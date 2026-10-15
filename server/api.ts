// The app's server side, independent of where it runs: the Vite dev/preview
// server locally (server/aiPlugin.ts) and Netlify Functions when hosted
// (netlify/functions/api.ts). The API key comes from the environment and
// never reaches the browser.
//
//   POST /api/v1/check { text, policy? } -> routing decision + masked text (rules only, no key needed)
//   POST /api/classify { text }          -> AiCheck  (the optional AI check next to the rules)
//   POST /api/chat     { messages }      -> AiAnswer (a real answer for the chat)
//   GET  /api/status                     -> { ai: boolean, model }

import { AI_SYSTEM_PROMPT, aiUserMessage, parseAiReply, type AiCheck } from "../src/lib/aiCheck.ts";
import { CHAT_SYSTEM_PROMPT, type AiAnswer, type ChatMessage } from "../src/lib/aiChat.ts";
import { CATEGORY_INFO, classify } from "../src/lib/classifier.ts";
import { maskTexts } from "../src/lib/pii.ts";
import { route } from "../src/lib/router.ts";
import { PEOPLE, PRESETS } from "../src/store/seed.ts";

type Env = Record<string, string | undefined>;
type Message = { role: "system" | "user" | "assistant"; content: string };
export interface ApiResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

const MAX_CHARS = 8000;

function settings(env: Env) {
  return {
    // Only your own key. OPENROUTER_API_KEY is deliberately ignored: on Netlify the
    // AI Gateway injects it, and using it would spend the team's Netlify credits.
    key: env.AI_API_KEY || env.LLM_API_KEY || "",
    baseUrl: (env.AI_BASE_URL || env.LLM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
    // Several models, comma-separated: the next one is tried if one fails.
    models: (env.AI_MODEL || env.LLM_MODEL || "nvidia/nemotron-3-super-120b-a12b:free,poolside/laguna-s-2.1:free").split(",").map((m) => m.trim()).filter(Boolean),
  };
}

/**
 * One completion. Free models share rate limits with everyone, so each model is
 * tried once, and models that were only busy (HTTP 429) get a second pass.
 */
async function complete(env: Env, messages: Message[], temperature: number, accept: (content: string) => boolean): Promise<{ content: string; model: string } | { error: string }> {
  const { key, baseUrl, models } = settings(env);
  let busy = models;
  let error = "No model answered.";
  for (let pass = 0; pass < 2 && busy.length; pass++) {
    if (pass) await new Promise((r) => setTimeout(r, 2500));
    const stillBusy: string[] = [];
    for (const model of busy) {
      try {
        const r = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Content-Based Routing prototype" },
          body: JSON.stringify({ model, temperature, messages }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!r.ok) {
          error = `${model} answered HTTP ${r.status}.`;
          if (r.status === 429) stillBusy.push(model);
          continue;
        }
        const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        // The chat shows plain text: drop Markdown bold and headings if a model uses them anyway.
        const content = (data.choices?.[0]?.message?.content ?? "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "").trim();
        if (accept(content)) return { content, model };
        error = `${model} gave an unusable answer.`;
      } catch {
        error = `${model} did not answer in time.`;
      }
    }
    busy = stillBusy;
  }
  return { error: busy.length === models.length ? "All models are busy (rate-limited). Try again shortly." : error };
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
export function check(text: string, policyName = "standard") {
  const preset = PRESETS[policyName as keyof typeof PRESETS] ?? PRESETS.standard;
  const c = classify(text, PEOPLE);
  const d = route(c, preset.policy);
  const m = maskTexts([text], PEOPLE);
  return {
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
    return json(200, { ai: Boolean(s.key), model: s.models[0] });
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
    return json(200, check(text, typeof body.policy === "string" ? body.policy : undefined), true);
  }
  if (path === "/api/classify") return json(200, await aiClassify(env, String(body.text ?? "")));
  if (path === "/api/chat") return json(200, await aiChat(env, Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : []));
  return json(404, { error: "Not found." });
}
