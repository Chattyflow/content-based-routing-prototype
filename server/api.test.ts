import { describe, expect, it } from "vitest";
import { handleApi } from "./api.ts";

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
