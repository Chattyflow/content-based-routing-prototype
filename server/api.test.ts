import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKUP_MODELS, DEFAULT_MODELS, PRIMARY_MODELS, handleApi, resetCooldowns } from "./api.ts";
import { resetAt } from "./providers.ts";

const post = (path: string, body: unknown, env = {}) => handleApi(path, "POST", JSON.stringify(body), env);

describe("public API: POST /api/v1/check", () => {
  it("masks personal data and returns the routing decision", async () => {
    const r = await post("/api/v1/check", { text: "Please call Petra Lindqvist on +49 40 5550 1234" });
    expect(r.status).toBe(200);
    expect(r.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(r.body).toMatchObject({
      tier: "orange",
      reason: "Sent to Claude with 1 name and 1 phone number masked.",
      personal_data: [{ kind: "NAME", placeholder: "[NAME_1]" }, { kind: "PHONE", placeholder: "[PHONE_1]" }],
      masked_text: "Please call [NAME_1] on [PHONE_1]",
      categories: [],
    });
  });

  it("keeps confidential content in the EU and honours the policy", async () => {
    const contract = await post("/api/v1/check", { text: "Clause 4: Vertragsstrafe of 5%, NDA applies." });
    expect(contract.body).toMatchObject({ tier: "green", categories: [{ id: "contract_legal" }] });
    const strict = await post("/api/v1/check", { text: "Please call Petra Lindqvist", policy: "strict" });
    expect(strict.body).toMatchObject({ tier: "green", policy: "strict" });
  });

  it("explains bad requests", async () => {
    expect((await post("/api/v1/check", {})).status).toBe(400);
    expect((await handleApi("/api/v1/check", "POST", "not json", {})).status).toBe(400);
    expect((await post("/api/v1/check", { text: "x".repeat(8001) })).status).toBe(413);
    expect((await handleApi("/api/v1/check", "GET", "", {})).status).toBe(405);
    expect((await handleApi("/api/v1/check", "OPTIONS", "", {})).status).toBe(204);
  });
});

describe("AI endpoints without a key", () => {
  it("report that AI is off instead of failing, and never call the network", async () => {
    expect((await handleApi("/api/status", "GET", "", {})).body).toMatchObject({ ai: false });
    expect((await post("/api/classify", { text: "hello" })).body).toEqual({ status: "off" });
    expect((await post("/api/chat", { messages: [{ role: "user", content: "hello" }] })).body).toEqual({ status: "off" });
  });

  it("ignore the OPENROUTER_API_KEY that Netlify's AI Gateway injects", async () => {
    const gateway = { OPENROUTER_API_KEY: "injected-by-netlify", OPENROUTER_BASE_URL: "https://gateway.example" };
    expect((await handleApi("/api/status", "GET", "", gateway)).body).toMatchObject({ ai: false });
    expect((await post("/api/classify", { text: "hello" }, gateway)).body).toEqual({ status: "off" });
  });
});

describe("model fallback (fake OpenRouter, no network)", () => {
  const env = { LLM_API_KEY: "test-key", LLM_MODEL: "busy-model,good-model,other-model" };
  const answer = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
  const chat = () => post("/api/chat", { messages: [{ role: "user", content: "hi" }] }, env);
  let calls: string[] = [];

  beforeEach(() => {
    resetCooldowns();
    calls = [];
    vi.spyOn(Math, "random").mockReturnValue(0.9999); // keep the listed order, so the steps are predictable
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("moves on from a busy model and skips it on the next request", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const model = JSON.parse(String(init.body)).model as string;
      calls.push(model);
      return model === "busy-model" ? new Response("{}", { status: 429 }) : answer(`hello from ${model}`);
    });
    expect((await chat()).body).toEqual({ status: "ok", reply: "hello from good-model", model: "good-model" });
    expect(calls).toEqual(["busy-model", "good-model"]);
    calls = [];
    await chat();
    expect(calls).toEqual(["good-model"]); // busy-model is cooling down, so it is tried last
  });

  it("says so when every model is busy", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 429 }));
    const pending = chat();
    await vi.runAllTimersAsync();
    expect((await pending).body).toEqual({ status: "error", message: "All models are busy (rate-limited). Try again shortly." });
    vi.useRealTimers();
  });

  it("stops at once when the key is rejected", async () => {
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)).model);
      return new Response("{}", { status: 401 });
    });
    expect((await chat()).body).toMatchObject({ status: "error", message: expect.stringMatching(/^OpenRouter rejected the API key \(HTTP 401\)\./) });
    expect(calls).toHaveLength(1);
  });

  it("spreads requests over the primary pool and keeps backups for when it is busy", async () => {
    vi.restoreAllMocks(); // real randomness for this one
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)).model);
      return answer("ok");
    });
    for (let i = 0; i < 40; i++) await post("/api/chat", { messages: [{ role: "user", content: "hi" }] }, { LLM_API_KEY: "test-key" });
    const firstPicks = new Set(calls);
    expect(firstPicks.size).toBeGreaterThan(3);
    expect([...firstPicks].every((m) => PRIMARY_MODELS.includes(m))).toBe(true);
    expect([...firstPicks].some((m) => BACKUP_MODELS.includes(m))).toBe(false);
  });

  it("lists all models and the pool in /api/status", async () => {
    const body = (await handleApi("/api/status", "GET", "", { LLM_API_KEY: "k" })).body as { models: string[]; spread_over: string[] };
    expect(body.models).toEqual(DEFAULT_MODELS);
    expect(body.spread_over).toEqual(PRIMARY_MODELS);
  });

  it("ships with the tested free models by default", () => {
    expect(DEFAULT_MODELS.length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_MODELS.every((m) => m.endsWith(":free") || m === "openrouter/free")).toBe(true);
    expect(DEFAULT_MODELS.at(-1)).toBe("openrouter/free");
  });
});

describe('public API with "ai": true', () => {
  beforeEach(() => resetCooldowns());
  afterEach(() => vi.unstubAllGlobals());

  it("adds what the AI check found, and masks it too", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ choices: [{ message: { content:
      '{"personal":[{"kind":"NAME","value":"zoe quint"}],"categories":[{"category":"health_data","confidence":0.9,"evidence":"x-ray"}],"confidence":0.9,"summary":"A name and health data."}' } }] })));
    const r = await post("/api/v1/check", { text: "zoe quint sent her x-ray results", ai: true }, { LLM_API_KEY: "test-key", LLM_MODEL: "m" });
    expect(r.body).toMatchObject({
      ai_check: { status: "ok", model: "m", summary: "A name and health data." },
      tier: "green",
      categories: [{ id: "health_data" }],
      masked_text: "[NAME_1] sent her x-ray results",
    });
  });

  it("reports the AI check as off without a key and still answers from the rules", async () => {
    const r = await post("/api/v1/check", { text: "Please call Petra Lindqvist", ai: true });
    expect(r.body).toMatchObject({ ai_check: { status: "off", note: "Rules only." }, tier: "orange", masked_text: "Please call [NAME_1]" });
  });
});

describe("Messages: the other person, played by a model (fake OpenRouter)", () => {
  const env = { LLM_API_KEY: "test-key", LLM_MODEL: "m" };
  const me = { name: "Lena Hoffmann", role: "HR Lead" };
  const turns = [
    { from: "them", text: "Hi! The replacement meters ship on Wednesday. Do you need the installation team as well?" },
    { from: "me", text: "Yes please, can they come on Friday?" },
  ];
  let sent: { messages: { role: string; content: string }[] } | null = null;

  beforeEach(() => {
    resetCooldowns();
    sent = null;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "Erik: Friday works, I'll book the team for 9:00." } }] }));
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("answers in character, with the whole conversation as context", async () => {
    const r = await post("/api/dm", { contactId: "x-erik", me, turns }, env);
    expect(r.body).toEqual({ status: "ok", reply: "Friday works, I'll book the team for 9:00.", model: "m" });
    const system = sent!.messages[0];
    expect(system.role).toBe("system");
    expect(system.content).toContain("You are Erik Sandberg, Account Manager at Baltic Grid Components.");
    expect(system.content).toContain("chatting in a work messenger with Lena Hoffmann, HR Lead at Nordwerk Energie GmbH");
    expect(sent!.messages.slice(1).map((m) => m.role)).toEqual(["assistant", "user"]);
  });

  it("is off without a key, and rejects unknown contacts or a conversation not ending with your message", async () => {
    expect((await post("/api/dm", { contactId: "x-erik", me, turns })).body).toEqual({ status: "off" });
    expect((await post("/api/dm", { contactId: "nobody", me, turns }, env)).status).toBe(400);
    expect((await post("/api/dm", { contactId: "x-erik", me, turns: turns.slice(0, 1) }, env)).status).toBe(400);
  });
});

describe("daily free-model limit (fake OpenRouter)", () => {
  const env = { LLM_API_KEY: "test-key" };
  let calls = 0;
  beforeEach(() => {
    resetCooldowns();
    calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return new Response(JSON.stringify({ error: { message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day" } }), { status: 429 });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("stops after one request and pauses, instead of trying every model", async () => {
    const first = (await post("/api/chat", { messages: [{ role: "user", content: "hi" }] }, env)).body as { status: string; message: string };
    expect(first.status).toBe("error");
    expect(first.message).toMatch(/^Daily free-model limit reached on this OpenRouter key/);
    expect(calls).toBe(1);
    await post("/api/classify", { text: "hello" }, env);
    expect(calls).toBe(1); // paused: no further requests
  });
});

describe("backup AI providers (fake APIs, no network)", () => {
  const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }));
  const dailyLimit = () => new Response(JSON.stringify({ error: { message: "Rate limit exceeded: free-models-per-day." } }), { status: 429 });
  let hosts: string[] = [];
  beforeEach(() => {
    resetCooldowns();
    hosts = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  it("takes over when OpenRouter's daily limit is reached, and stays on the backup while it is paused", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      hosts.push(new URL(url).host);
      return url.includes("openrouter.ai") ? dailyLimit() : ok("hello from Groq");
    });
    const env = { LLM_API_KEY: "or-key", GROQ_API_KEY: "groq-key" };
    const first = (await post("/api/chat", { messages: [{ role: "user", content: "hi" }] }, env)).body as { status: string; reply: string; model: string };
    expect(first).toMatchObject({ status: "ok", reply: "hello from Groq" });
    expect(first.model).toMatch(/\(Groq\)$/);
    expect(hosts).toEqual(["openrouter.ai", "api.groq.com"]);
    hosts = [];
    await post("/api/chat", { messages: [{ role: "user", content: "again" }] }, env);
    expect(hosts).toEqual(["api.groq.com"]); // OpenRouter is paused, no wasted request
  });

  it("uses only providers that have a key, and never Netlify's injected gateway keys", async () => {
    const status = (await handleApi("/api/status", "GET", "", {
      MISTRAL_API_KEY: "m", OPENROUTER_API_KEY: "netlify-gateway", GEMINI_API_KEY: "netlify-gateway", OPENAI_API_KEY: "netlify-gateway",
    })).body as { ai: boolean; providers: { name: string }[] };
    expect(status.ai).toBe(true);
    expect(status.providers.map((p) => p.name)).toEqual(["Mistral"]);
  });

  it("explains when every provider is out for the day", async () => {
    vi.stubGlobal("fetch", async () => dailyLimit());
    const r = (await post("/api/chat", { messages: [{ role: "user", content: "hi" }] }, { LLM_API_KEY: "a", GROQ_API_KEY: "b" })).body as { message: string };
    expect(r.message).toMatch(/OpenRouter key.*Daily limit reached on Groq.*Every AI provider has reached its limit/);
  });
});

describe("switching back automatically when a limit resets (fake APIs)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reads the reset time providers send", () => {
    const now = 1_000_000_000_000;
    expect(resetAt(new Headers({ "retry-after": "120" }), null, now)).toBe(now + 120_000);
    expect(resetAt(new Headers(), { error: { metadata: { headers: { "X-RateLimit-Reset": String(now + 5000) } } } }, now)).toBe(now + 5000);
    expect(resetAt(new Headers({ "x-ratelimit-reset": "2000000000" }), null, now)).toBe(2_000_000_000_000);
    expect(resetAt(new Headers(), { error: { message: "no reset info" } }, now)).toBeNull();
  });

  it("answers from the backup at once, and goes back to OpenRouter as soon as its limit resets", async () => {
    resetCooldowns();
    vi.useFakeTimers({ toFake: ["Date"] });
    const t0 = Date.UTC(2026, 9, 15, 23, 59);
    vi.setSystemTime(t0);
    let limited = true;
    let hosts: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const host = new URL(url).host;
      hosts.push(host);
      if (host === "openrouter.ai" && limited) {
        return new Response(JSON.stringify({ error: { message: "Rate limit exceeded: free-models-per-day.", metadata: { headers: { "X-RateLimit-Reset": String(t0 + 60_000) } } } }), { status: 429 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: `hello from ${host}` } }] }));
    });
    const env = { LLM_API_KEY: "or-key", GROQ_API_KEY: "groq-key" };
    const ask = async () => ((await post("/api/chat", { messages: [{ role: "user", content: "hi" }] }, env)).body as { reply: string }).reply;

    expect(await ask()).toBe("hello from api.groq.com"); // same request, no waiting
    expect(hosts).toEqual(["openrouter.ai", "api.groq.com"]);

    hosts = [];
    vi.setSystemTime(t0 + 30_000);
    expect(await ask()).toBe("hello from api.groq.com");
    expect(hosts).toEqual(["api.groq.com"]); // OpenRouter is not asked again before its reset

    hosts = [];
    limited = false;
    vi.setSystemTime(t0 + 61_000);
    expect(await ask()).toBe("hello from openrouter.ai"); // back on OpenRouter after the reset
    expect(hosts).toEqual(["openrouter.ai"]);
  });
});
