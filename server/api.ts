// The app's server side, independent of where it runs: the Vite dev/preview
// server locally (server/aiPlugin.ts) and Netlify Functions when hosted
// (netlify/functions/api.ts). The API key comes from the environment and
// never reaches the browser.
//
//   POST /api/v1/check { text, policy?, ai? } -> routing decision + masked text (rules; "ai": true adds the AI check)
//   POST /api/classify { text }          -> AiCheck  (the optional AI check next to the rules)
//   POST /api/chat     { messages }      -> AiAnswer (a real answer for the chat)
//   POST /api/dm       { contactId, me, turns } -> the other person's reply in Messages (prototype)
//   GET  /api/status                     -> { ai: boolean, providers, models, spread_over }
//   POST /api/visit                      -> counts one visit (no cookies, no IP; bots left out)
//   GET  /api/visits                     -> visits per day and country, last 30 days

import { AI_SYSTEM_PROMPT, aiUserMessage, mergeAi, parseAiReply, type AiCheck } from "../src/lib/aiCheck.ts";
import { CHAT_SYSTEM_PROMPT, type AiAnswer, type ChatMessage } from "../src/lib/aiChat.ts";
import { CATEGORY_INFO, classify } from "../src/lib/classifier.ts";
import { maskTexts } from "../src/lib/pii.ts";
import { route } from "../src/lib/router.ts";
import { PEOPLE, PRESETS } from "../src/store/seed.ts";
import { CONTACTS } from "../src/features/messenger/data.ts";
import { personaPrompt, type DmAnswer, type DmRequest } from "../src/features/messenger/persona.ts";
import { DEFAULT_MODELS, PRIMARY_MODELS, complete, pausedProviders, providersFrom } from "./providers.ts";
import { memoryVisitStore, recordVisit, summarizeVisits, type VisitStore } from "./visits.ts";

export { BACKUP_MODELS, DEFAULT_MODELS, PRIMARY_MODELS, resetCooldowns } from "./providers.ts";

type Env = Record<string, string | undefined>;
export interface ApiResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

const MAX_CHARS = 8000;

const aiOn = (env: Env) => providersFrom(env).length > 0;

async function aiClassify(env: Env, text: string, context: unknown = []): Promise<AiCheck> {
  if (!aiOn(env)) return { status: "off" };
  // A few earlier messages help the check understand what the new one is.
  const earlier = (Array.isArray(context) ? context : []).filter((c): c is string => typeof c === "string" && c.trim() !== "").slice(-3).map((c) => c.slice(0, 500));
  const r = await complete(
    env,
    [{ role: "system", content: AI_SYSTEM_PROMPT }, { role: "user", content: aiUserMessage(text.slice(0, MAX_CHARS), earlier) }],
    0,
    (content) => parseAiReply(content, "") !== null,
  );
  return "error" in r ? { status: "error", message: r.error } : { status: "ok", finding: parseAiReply(r.content, r.model)! };
}

/** The other person in a Messages conversation, played by a model (prototype only). */
async function aiDm(env: Env, req: Partial<DmRequest>): Promise<DmAnswer | null> {
  const contact = CONTACTS.find((c) => c.id === req.contactId);
  if (!contact || !Array.isArray(req.turns) || !req.me?.name) return null;
  if (!aiOn(env)) return { status: "off" };
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
  if (!aiOn(env)) return { status: "off" };
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

/** Facts about the request that only the hosting layer knows. */
export interface RequestContext {
  country?: string;
  userAgent?: string;
  visits?: VisitStore;
}

// Locally (and in tests) visits are kept in memory; Netlify passes a Blobs store.
const localVisits = memoryVisitStore();

export async function handleApi(path: string, method: string, bodyText: string, env: Env, ctx: RequestContext = {}): Promise<ApiResult> {
  const isPublic = path === "/api/v1/check";
  if (method === "OPTIONS" && isPublic) return json(204, null, true);
  if (path === "/api/visit" && method === "POST") {
    const counted = await recordVisit(ctx.visits ?? localVisits, { country: ctx.country, userAgent: ctx.userAgent });
    return json(200, { counted });
  }
  if (path === "/api/visits") return json(200, await summarizeVisits(ctx.visits ?? localVisits));
  if (path === "/api/status") {
    const providers = providersFrom(env);
    const openrouter = providers.find((p) => p.id === "openrouter");
    const paused = pausedProviders();
    return json(200, {
      ai: providers.length > 0,
      providers: providers.map((p) => ({ name: p.name, models: p.models, paused: paused.some((x) => x.id === p.id) })),
      models: openrouter?.models ?? DEFAULT_MODELS,
      spread_over: openrouter ? openrouter.models.slice(0, openrouter.spread) : PRIMARY_MODELS,
    });
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
    // Optional "ai": true adds the AI check (needs an AI key; otherwise reported as off).
    // It can only make routing stricter, so it is skipped when the rules already keep the text on GREEN.
    const policy = typeof body.policy === "string" ? body.policy : undefined;
    const rulesOnly = check(text, policy);
    const ai = body.ai !== true ? undefined : rulesOnly.tier === "green" && !rulesOnly.unsure ? ({ status: "skipped" } as const) : await aiClassify(env, text);
    if (!ai) return json(200, rulesOnly, true);
    return json(200, check(text, policy, ai), true);
  }
  if (path === "/api/classify") return json(200, await aiClassify(env, String(body.text ?? ""), body.context));
  if (path === "/api/chat") return json(200, await aiChat(env, Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : []));
  if (path === "/api/dm") {
    const answer = await aiDm(env, body as Partial<DmRequest>);
    return answer ? json(200, answer) : json(400, { error: "Send a known contactId, me.name and turns ending with your message." });
  }
  return json(404, { error: "Not found." });
}
