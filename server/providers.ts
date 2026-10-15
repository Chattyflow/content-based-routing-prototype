// AI providers, tried in order: OpenRouter first, then backups. Each backup is
// switched on by setting its key. When a provider runs into its daily limit, it
// is paused for a while and the next one takes over, so the app keeps working.
//
// All of them speak the OpenAI-compatible chat API. The key names deliberately
// avoid the variables Netlify's AI Gateway injects (OPENROUTER_API_KEY,
// OPENAI_API_KEY, GEMINI_API_KEY, ...): those would spend Netlify credits.

type Env = Record<string, string | undefined>;
export type Message = { role: "system" | "user" | "assistant"; content: string };

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  key: string;
  models: string[];
  /** Requests start with a random model among the first `spread` models. */
  spread: number;
}

/**
 * Free OpenRouter models that returned valid JSON for the AI check in a test on
 * 2026-10-15. Free models come and go: see https://openrouter.ai/models?q=free
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
  // Last resort on OpenRouter: its own router picks any free model that is available.
  "openrouter/free",
];
export const DEFAULT_MODELS = [...PRIMARY_MODELS, ...BACKUP_MODELS];

/**
 * Backup providers with a free tier. Model names change often: each can be
 * replaced with a comma-separated *_MODEL variable. A model the provider does
 * not know is skipped automatically.
 */
export const BACKUP_PROVIDERS = [
  { id: "groq", name: "Groq", keyVar: "GROQ_API_KEY", modelVar: "GROQ_MODEL", baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant"] },
  { id: "cerebras", name: "Cerebras", keyVar: "CEREBRAS_API_KEY", modelVar: "CEREBRAS_MODEL", baseUrl: "https://api.cerebras.ai/v1",
    models: ["gpt-oss-120b", "llama3.1-8b"] },
  { id: "google", name: "Google AI Studio", keyVar: "GOOGLE_AI_STUDIO_KEY", modelVar: "GOOGLE_AI_STUDIO_MODEL", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.5-flash", "gemini-2.5-flash-lite"] },
  { id: "mistral", name: "Mistral", keyVar: "MISTRAL_API_KEY", modelVar: "MISTRAL_MODEL", baseUrl: "https://api.mistral.ai/v1",
    models: ["mistral-small-latest"] },
] as const;

const list = (value: string | undefined) => (value ?? "").split(",").map((m) => m.trim()).filter(Boolean);

/** The providers that have a key, in the order they are tried. */
export function providersFrom(env: Env): Provider[] {
  const out: Provider[] = [];
  // Only your own OpenRouter key; OPENROUTER_API_KEY is Netlify's AI Gateway.
  const orKey = env.AI_API_KEY || env.LLM_API_KEY || "";
  if (orKey) {
    const own = list(env.AI_MODEL || env.LLM_MODEL);
    out.push({
      id: "openrouter", name: "OpenRouter", key: orKey,
      baseUrl: (env.AI_BASE_URL || env.LLM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
      ...(own.length ? { models: own, spread: own.length } : { models: DEFAULT_MODELS, spread: PRIMARY_MODELS.length }),
    });
  }
  for (const b of BACKUP_PROVIDERS) {
    const key = env[b.keyVar];
    if (!key) continue;
    const models = list(env[b.modelVar]);
    out.push({ id: b.id, name: b.name, key, baseUrl: b.baseUrl, models: models.length ? models : [...b.models], spread: 1 });
  }
  // Any other OpenAI-compatible provider.
  if (env.BACKUP_API_KEY && env.BACKUP_BASE_URL && env.BACKUP_MODEL) {
    out.push({ id: "custom", name: env.BACKUP_NAME || "Backup", key: env.BACKUP_API_KEY, baseUrl: env.BACKUP_BASE_URL.replace(/\/$/, ""), models: list(env.BACKUP_MODEL), spread: 1 });
  }
  return out;
}

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
// A model that just failed is tried last for a while: briefly when busy or slow,
// longer when it refuses us.
const COOLDOWN_MS = { busy: 60_000, refused: 10 * 60_000 };
// A provider whose daily limit is reached (or whose key is rejected) is skipped
// for a while, and the next provider takes over.
const PAUSE_MS = 15 * 60_000;
const cooldownUntil = new Map<string, number>();
const paused = new Map<string, { until: number; why: string }>();

export const resetCooldowns = () => {
  cooldownUntil.clear();
  paused.clear();
};

export const pausedProviders = () =>
  [...paused.entries()].filter(([, p]) => p.until > Date.now()).map(([id, p]) => ({ id, why: p.why }));

const isDailyLimit = (status: number, detail: string) =>
  status === 429 && /per[- ]day|daily|requests per day|\bRPD\b|quota/i.test(detail);

function dailyLimitMessage(p: Provider, reason: string) {
  const what = p.id === "openrouter" ? "Daily free-model limit reached on this OpenRouter key" : `Daily limit reached on ${p.name}`;
  return `${what}${reason ? ` (${reason})` : ""}.`;
}

export type Completion = { content: string; model: string } | { error: string };

/**
 * One completion. Providers are tried in order; within a provider, models are
 * tried in turn. Models that were only busy (HTTP 429) get a second pass if time
 * allows.
 */
export async function complete(env: Env, messages: Message[], temperature: number, accept: (content: string) => boolean): Promise<Completion> {
  const providers = providersFrom(env);
  const start = Date.now();
  const left = () => BUDGET_MS - (Date.now() - start);
  const errors: string[] = [];
  const busy: { p: Provider; model: string }[] = [];
  let tried = 0;
  let reason = "";

  const attempt = async (p: Provider, model: string): Promise<Completion | "busy" | "skip-provider" | "next"> => {
    const id = `${p.id}:${model}`;
    try {
      const r = await fetch(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json", "X-Title": "Content-Based Routing prototype" },
        body: JSON.stringify({ model, temperature, messages }),
        signal: AbortSignal.timeout(Math.min(PER_CALL_MS, left())),
      });
      if (!r.ok) {
        // Providers say why (shared pool busy, daily limit, ...): keep it for the admin view.
        const detail = await r.text().then((t) => {
          const j = JSON.parse(t);
          return String((Array.isArray(j) ? j[0] : j)?.error?.message ?? "");
        }).catch(() => "");
        if (detail) reason = detail.slice(0, 160);
        if (isDailyLimit(r.status, detail)) {
          const why = dailyLimitMessage(p, reason);
          paused.set(p.id, { until: Date.now() + PAUSE_MS, why });
          errors.push(why);
          return "skip-provider";
        }
        if (r.status === 401 || r.status === 403 && !/model/i.test(detail)) {
          const why = `${p.name} rejected the API key (HTTP ${r.status}).`;
          paused.set(p.id, { until: Date.now() + PAUSE_MS, why });
          errors.push(why);
          return "skip-provider";
        }
        errors.push(`${model} answered HTTP ${r.status}${detail ? `: ${detail.slice(0, 160)}` : ""}.`);
        if (r.status === 429) {
          cooldownUntil.set(id, Date.now() + COOLDOWN_MS.busy);
          return "busy";
        }
        cooldownUntil.set(id, Date.now() + COOLDOWN_MS.refused);
        return "next";
      }
      const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      // The chat shows plain text: drop Markdown bold and headings if a model uses them anyway.
      const content = (data.choices?.[0]?.message?.content ?? "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "").trim();
      if (accept(content)) {
        cooldownUntil.delete(id);
        return { content, model: p.id === "openrouter" ? model : `${model} (${p.name})` };
      }
      errors.push(`${model} gave an unusable answer.`);
    } catch {
      errors.push(`${model} did not answer in time.`);
    }
    cooldownUntil.set(id, Date.now() + COOLDOWN_MS.busy);
    return "next";
  };

  for (const p of providers) {
    const pause = paused.get(p.id);
    if (pause && pause.until > Date.now()) {
      errors.push(pause.why);
      continue;
    }
    // Random start within the pool spreads the load; models cooling down go last.
    const order = [...shuffled(p.models.slice(0, p.spread)), ...p.models.slice(p.spread)];
    const ready = order.filter((m) => (cooldownUntil.get(`${p.id}:${m}`) ?? 0) <= Date.now());
    for (const model of [...ready, ...order.filter((m) => !ready.includes(m))]) {
      if (left() < 3_000) break;
      tried++;
      const r = await attempt(p, model);
      if (typeof r === "object") return r;
      if (r === "skip-provider") break;
      if (r === "busy") busy.push({ p, model });
    }
  }

  // Models that were only busy get a second chance, if there is time.
  if (busy.length && left() > 8_000) {
    await new Promise((r) => setTimeout(r, 2000));
    for (const { p, model } of busy) {
      if (left() < 3_000 || (paused.get(p.id)?.until ?? 0) > Date.now()) continue;
      const r = await attempt(p, model);
      if (typeof r === "object") return r;
    }
  }

  if (tried > 0 && busy.length === tried) return { error: `All models are busy (rate-limited)${reason ? `: ${reason}` : ""}. Try again shortly.` };
  const limits = errors.filter((e) => /^Daily /.test(e) || /rejected the API key/.test(e));
  if (limits.length && limits.length >= providers.length) return { error: `${[...new Set(limits)].join(" ")} AI is paused for a while; rules and canned replies are used meanwhile.` };
  return { error: errors.at(-1) ?? "No model answered." };
}
