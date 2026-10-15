// Local endpoints for the optional AI features, inside the Vite dev and preview
// servers. The API key stays in .env on this machine and never reaches the
// browser or the repo. Without a key both answer { status: "off" } and the app
// uses its rules and canned replies.
//
//   POST /api/classify { text }      -> AiCheck  (the AI check next to the rules)
//   POST /api/chat     { messages }  -> AiAnswer (a real answer for the chat)

import { loadEnv, type Plugin } from "vite";
import { AI_SYSTEM_PROMPT, aiUserMessage, parseAiReply, type AiCheck } from "../src/lib/aiCheck.ts";
import { CHAT_SYSTEM_PROMPT, type AiAnswer, type ChatMessage } from "../src/lib/aiChat.ts";

interface Req extends AsyncIterable<Uint8Array> {
  method?: string;
}
interface Res {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body: string): void;
}
type Message = { role: "system" | "user" | "assistant"; content: string };

const MAX_CHARS = 8000;

export function aiPlugin(): Plugin {
  let env: Record<string, string> = {};
  const settings = () => ({
    key: env.AI_API_KEY || env.OPENROUTER_API_KEY || env.LLM_API_KEY || "",
    baseUrl: (env.AI_BASE_URL || env.LLM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
    // Several models, comma-separated: the next one is tried if one fails.
    models: (env.AI_MODEL || env.LLM_MODEL || "nvidia/nemotron-3-super-120b-a12b:free,poolside/laguna-s-2.1:free").split(",").map((m) => m.trim()).filter(Boolean),
  });

  /**
   * One completion. Free models share rate limits with everyone, so each model is
   * tried once, and models that were only busy (HTTP 429) get a second pass.
   */
  async function complete(messages: Message[], temperature: number, accept: (content: string) => boolean): Promise<{ content: string; model: string } | { error: string }> {
    const { key, baseUrl, models } = settings();
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
            signal: AbortSignal.timeout(25_000),
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

  async function classify(text: string): Promise<AiCheck> {
    if (!settings().key) return { status: "off" };
    const r = await complete(
      [{ role: "system", content: AI_SYSTEM_PROMPT }, { role: "user", content: aiUserMessage(text.slice(0, MAX_CHARS)) }],
      0,
      (content) => parseAiReply(content, "") !== null,
    );
    return "error" in r ? { status: "error", message: r.error } : { status: "ok", finding: parseAiReply(r.content, r.model)! };
  }

  async function chat(messages: ChatMessage[]): Promise<AiAnswer> {
    if (!settings().key) return { status: "off" };
    const history = messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
    const r = await complete([{ role: "system", content: CHAT_SYSTEM_PROMPT }, ...history], 0.4, (content) => content.length > 0);
    return "error" in r ? { status: "error", message: r.error } : { status: "ok", reply: r.content, model: r.model };
  }

  async function readJson(req: Req): Promise<Record<string, unknown> | null> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req) chunks.push(chunk);
    try {
      return JSON.parse(await new Blob(chunks as BlobPart[]).text());
    } catch {
      return null;
    }
  }

  const route = (run: (body: Record<string, unknown>) => Promise<unknown>) => async (req: Req, res: Res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") {
      const { key, models } = settings();
      res.end(JSON.stringify({ enabled: Boolean(key), model: models[0] }));
      return;
    }
    const body = await readJson(req);
    if (!body) {
      res.statusCode = 400;
      res.end(JSON.stringify({ status: "error", message: "Bad request." }));
      return;
    }
    res.end(JSON.stringify(await run(body)));
  };

  const handlers = {
    "/api/classify": route((b) => classify(String(b.text ?? ""))),
    "/api/chat": route((b) => chat(Array.isArray(b.messages) ? (b.messages as ChatMessage[]) : [])),
  };

  return {
    name: "ai-endpoints",
    configResolved(config) {
      env = loadEnv(config.mode, typeof config.envDir === "string" ? config.envDir : config.root, "");
    },
    configureServer(server) {
      for (const [path, h] of Object.entries(handlers)) server.middlewares.use(path, (req, res) => void h(req as Req, res as Res));
    },
    configurePreviewServer(server) {
      for (const [path, h] of Object.entries(handlers)) server.middlewares.use(path, (req, res) => void h(req as Req, res as Res));
    },
  };
}
