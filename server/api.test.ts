import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MODELS, handleApi, resetCooldowns } from "./api.ts";

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
  });
  afterEach(() => vi.unstubAllGlobals());

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
    expect((await chat()).body).toEqual({ status: "error", message: "OpenRouter rejected the API key (HTTP 401)." });
    expect(calls).toHaveLength(1);
  });

  it("ships with the tested free models by default", () => {
    expect(DEFAULT_MODELS.length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_MODELS.every((m) => m.endsWith(":free"))).toBe(true);
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
