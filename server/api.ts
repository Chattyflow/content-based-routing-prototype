// The app's server side, independent of where it runs: the Vite dev/preview
// server locally (server/aiPlugin.ts) and Netlify Functions when hosted
// (netlify/functions/api.ts). The API key comes from the environment and
// never reaches the browser.
//
//   POST /api/v1/check { text, policy?, ai? } -> routing decision + masked text (rules; "ai": true adds the AI check)
//   POST /api/classify { text }          -> AiCheck  (the optional AI check next to the rules)
//   POST /api/chat     { messages }      -> AiAnswer (a real answer for the chat)
//   POST /api/dm       { contactId, me, turns } -> the other person's reply in Messages (prototype)
//   GET  /api/status                     -> { ai: boolean, models, spread_over }

import { AI_SYSTEM_PROMPT, aiUserMessage, mergeAi, parseAiReply, type AiCheck } from "../src/lib/aiCheck.ts";
import { CHAT_SYSTEM_PROMPT, type AiAnswer, type ChatMessage } from "../src/lib/aiChat.ts";
import { CATEGORY_INFO, classify } from "../src/lib/classifier.ts";
import { maskTexts } from "../src/lib/pii.ts";
import { route } from "../src/lib/router.ts";
import { PEOPLE, PRESETS } from "../src/store/seed.ts";
import { CONTACTS } from "../src/features/messenger/data.ts";
import { personaPrompt, type DmAnswer, type DmRequest } from "../src/features/messenger/persona.ts";

type Env = Record<string, string | undefined>;
type Message = { role: "system" | "user" | "assistant"; content: string };
export interface ApiResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

const MAX_CHARS = 8000;

function settings(env: Env) {
  const own = (env.AI_MODEL || env.LLM_MODEL || "").split(",").map((m) => m.trim()).filter(Boolean);
  return {
    // Only your own key. OPENROUTER_API_KEY is deliberately ignored: on Netlify the
    // AI Gateway injects it, and using it would spend the team's Netlify credits.
    key: env.AI_API_KEY || env.LLM_API_KEY || "",
    baseUrl: (env.AI_BASE_URL || env.LLM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
    // Several models, comma-separated: requests are spread over all of them.
    ...(own.length ? { models: own, spread: own.length } : { models: DEFAULT_MODELS, spread: PRIMARY_MODELS.length }),
  };
}

/**
 * Free OpenRouter models that returned valid JSON for the AI check in a test on
 * 2026-10-15. Free models come and go: see https://openrouter.ai/models?q=free
 *
 * Each request starts with a random model from the primary pool, so the load is
 * spread and no single model's free rate limit is hit first. The backups (slow,
 * small, or a router) are tried only when the pool is busy.
 */
export const PRIMARY_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "cohere/north-mini-code:free",
  "poolside/laguna-s-2.1:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "poolside/laguna-xs-2.1:free",
];
export const BACKUP_MODELS = [
  "dots-studio/dots-3-note-preview:free",
  "liquid/lfm-2.5-2.6b:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  // Last resort: OpenRouter's own router picks any free model that is available.
  "openrouter/free",
];
export const DEFAULT_MODELS = [...PRIMARY_MODELS, ...BACKUP_MODELS];

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Total time for one request: stays inside Netlify's 60-second function limit. */
const BUDGET_MS = 40_000;
const PER_CALL_MS = 20_000;
// A model that just failed is tried last for a while, so the next request does
// not wait for it again: briefly when busy or slow, longer when it refuses us.
const COOLDOWN_MS = { busy: 60_000, refused: 10 * 60_000 };
const cooldownUntil = new Map<string, number>();
// When OpenRouter reports the key's daily free-model limit, every model is out:
// pause all AI calls for a while instead of spending requests on retries.
const DAILY_LIMIT_PAUSE_MS = 15 * 60_000;
let pausedUntil = 0;
const dailyLimitMessage = (reason: string) => `Daily free-model limit reached on this OpenRouter key${reason ? ` (${reason})` : ""}. AI is paused for a while; rules and canned replies are used meanwhile.`;
export const resetCooldowns = () => {
  cooldownUntil.clear();
  pausedUntil = 0;
};

/**
 * One completion. Free models share rate limits with everyone, so models are
 * tried in turn, and those that were only busy (HTTP 429) get a second pass if
 * time allows.
 */
async function complete(env: Env, messages: Message[], temperature: number, accept: (content: string) => boolean): Promise<{ content: string; model: string } | { error: string }> {
  const { key, baseUrl, models, spread } = settings(env);
  if (Date.now() < pausedUntil) return { error: dailyLimitMessage("") };
  const start = Date.now();
  const left = () => BUDGET_MS - (Date.now() - start);
  const cool = (model: string, ms: number) => cooldownUntil.set(model, Date.now() + ms);
  // Random start within the pool spreads the load; models cooling down go last.
  const order = [...shuffled(models.slice(0, spread)), ...models.slice(spread)];
  const ready = order.filter((m) => (cooldownUntil.get(m) ?? 0) <= Date.now());
  let queue = [...ready, ...order.filter((m) => !ready.includes(m))];
  let error = "No model answered.";
  let tried = 0;
  let busyCount = 0;
  let reason = "";
  for (let pass = 0; pass < 2 && queue.length; pass++) {
    if (pass) {
      if (left() < 8_000) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    const busy: string[] = [];
    for (const model of queue) {
      if (left() < 3_000) break;
      if (!pass) tried++;
      try {
        const r = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Content-Based Routing prototype" },
          body: JSON.stringify({ model, temperature, messages }),
          signal: AbortSignal.timeout(Math.min(PER_CALL_MS, left())),
        });
        if (!r.ok) {
          // OpenRouter says why (shared pool busy, daily free limit, ...): keep it for the admin view.
          const detail = await r.text().then((t) => String(JSON.parse(t)?.error?.message ?? "")).catch(() => "");
          if (detail) reason = detail.slice(0, 160);
          // A daily limit covers every free model on the key: stop, and pause instead of retrying.
          if (r.status === 429 && /per-day/i.test(detail)) {
            pausedUntil = Date.now() + DAILY_LIMIT_PAUSE_MS;
            return { error: dailyLimitMessage(reason) };
          }
          error = `${model} answered HTTP ${r.status}${detail ? `: ${detail.slice(0, 160)}` : ""}.`;
          if (r.status === 429) {
            busy.push(model);
            if (!pass) busyCount++;
            cool(model, COOLDOWN_MS.busy);
          } else if (r.status === 401) {
            return { error: "OpenRouter rejected the API key (HTTP 401)." };
          } else {
            cool(model, COOLDOWN_MS.refused);
          }
          continue;
        }
        const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        // The chat shows plain text: drop Markdown bold and headings if a model uses them anyway.
        const content = (data.choices?.[0]?.message?.content ?? "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "").trim();
        if (accept(content)) {
          cooldownUntil.delete(model);
          return { content, model };
        }
        error = `${model} gave an unusable answer.`;
        cool(model, COOLDOWN_MS.busy);
      } catch {
        error = `${model} did not answer in time.`;
        cool(model, COOLDOWN_MS.busy);
      }
    }
    queue = busy;
  }
  return { error: tried > 0 && busyCount === tried ? `All models are busy (rate-limited)${reason ? `: ${reason}` : ""}. Try again shortly.` : error };
}

async function aiClassify(env: Env, text: string): Promise<AiCheck> {
  if (!settings(env).key) return { status: "off" };
  const r = await complete(
    env,
    [{ role: "system", content: AI_SYSTEM_PROMPT }, { role: "user", content: aiUserMessage(text.slice(0, MAX_CHARS)) }],
    0,
    (content) => parseAiReply(content, "") !== null,
  );
  return "error" in r ? { status: "error", message: r.error } : { status: "ok", finding: parseAiReply(r.content, r.model)! };
}

/** The other person in a Messages conversation, played by a model (prototype only). */
async function aiDm(env: Env, req: Partial<DmRequest>): Promise<DmAnswer | null> {
  const contact = CONTACTS.find((c) => c.id === req.contactId);
  if (!contact || !Array.isArray(req.turns) || !req.me?.name) return null;
  if (!settings(env).key) return { status: "off" };
  const turns = req.turns
    .filter((t) => (t?.from === "me" || t?.from === "them") && typeof t.text === "string" && t.text.trim())
    .slice(-16)
    .map((t) => ({ role: t.from === "me" ? ("user" as const) : ("assistant" as const), content: t.text.slice(0, MAX_CHARS) }));
  if (turns.at(-1)?.role !== "user") return null;
  const r = await complete(env, [{ role: "system", content: personaPrompt(contact, { name: String(req.me.name), role: String(req.me.role ?? "") }) }, ...turns], 0.7, (content) => content.length > 0);
  if ("error" in r) return { status: "error", message: r.error };
  // Models sometimes prefix the speaker's name ("Erik: ..."); the chat shows it already.
  let reply = r.content;
  for (const prefix of [`${contact.name}:`, `${contact.name.split(" ")[0]}:`]) if (reply.startsWith(prefix)) reply = reply.slice(prefix.length).trim();
  return { status: "ok", reply, model: r.model };
}

async function aiChat(env: Env, messages: ChatMessage[]): Promise<AiAnswer> {
  if (!settings(env).key) return { status: "off" };
  const history = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  const r = await complete(env, [{ role: "system", content: CHAT_SYSTEM_PROMPT }, ...history], 0.4, (content) => content.length > 0);
  return "error" in r ? { status: "error", message: r.error } : { status: "ok", reply: r.content, model: r.model };
}

/** The public API: the rules engine, deterministic and fast. */
export function check(text: string, policyName = "standard", ai?: AiCheck) {
  const preset = PRESETS[policyName as keyof typeof PRESETS] ?? PRESETS.standard;
  // With the AI check, a language model adds what the rules missed (it can never remove anything).
  const c = ai ? mergeAi(classify(text, PEOPLE), ai, text, PEOPLE) : classify(text, PEOPLE);
  const d = route(c, preset.policy);
  const m = maskTexts([text], PEOPLE, c.extra);
  return {
    ...(ai && {
      ai_check: ai.status === "ok"
        ? { status: "ok", model: ai.finding.model, summary: ai.finding.summary, confidence: ai.finding.confidence }
        : { ...ai, note: "Rules only." },
    }),
    tier: d.tier,
    destination: d.model.label,
    reason: d.reason,
    confidence: c.confidence,
    unsure: d.lowConfidence,
    policy: preset === PRESETS[policyName as keyof typeof PRESETS] ? policyName : "standard",
    categories: c.detected.map((id) => ({ id, label: CATEGORY_INFO[id].label })),
    personal_data: m.matches.map((x) => ({ kind: x.kind, placeholder: x.placeholder })),
    masked_text: m.masked[0],
  };
}

const json = (status: number, body: unknown, cors = false): ApiResult => ({
  status,
  body,
  headers: {
    "Content-Type": "application/json",
    ...(cors ? { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } : {}),
  },
});

export async function handleApi(path: string, method: string, bodyText: string, env: Env): Promise<ApiResult> {
  const isPublic = path === "/api/v1/check";
  if (method === "OPTIONS" && isPublic) return json(204, null, true);
  if (path === "/api/status") {
    const s = settings(env);
    return json(200, { ai: Boolean(s.key), models: s.models, spread_over: s.models.slice(0, s.spread) });
  }
  if (method !== "POST") return json(405, { error: "Use POST." }, isPublic);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(bodyText || "{}");
  } catch {
    return json(400, { error: "The body must be JSON." }, isPublic);
  }

  if (isPublic) {
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) return json(400, { error: 'Send {"text": "..."}.' }, true);
    if (text.length > MAX_CHARS) return json(413, { error: `Text is longer than ${MAX_CHARS} characters.` }, true);
    // Optional "ai": true adds the AI check (needs LLM_API_KEY; otherwise reported as off).
    const ai = body.ai === true ? await aiClassify(env, text) : undefined;
    return json(200, check(text, typeof body.policy === "string" ? body.policy : undefined, ai), true);
  }
  if (path === "/api/classify") return json(200, await aiClassify(env, String(body.text ?? "")));
  if (path === "/api/chat") return json(200, await aiChat(env, Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : []));
  if (path === "/api/dm") {
    const answer = await aiDm(env, body as Partial<DmRequest>);
    return answer ? json(200, answer) : json(400, { error: "Send a known contactId, me.name and turns ending with your message." });
  }
  return json(404, { error: "Not found." });
}
