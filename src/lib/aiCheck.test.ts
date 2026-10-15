import { describe, expect, it } from "vitest";
import { PEOPLE, PRESETS } from "../store/seed";
import { mergeAi, parseAiReply, type AiCheck } from "./aiCheck";
import { classify } from "./classifier";
import { maskTexts } from "./pii";
import { route } from "./router";

const standard = PRESETS.standard.policy;
const ok = (finding: Partial<Extract<AiCheck, { status: "ok" }>["finding"]>): AiCheck => ({
  status: "ok",
  finding: { model: "test-model", personal: [], categories: [], confidence: 0.9, summary: "", ...finding },
});
const check = (text: string, ai: AiCheck) => mergeAi(classify(text, PEOPLE), ai, text, PEOPLE);

describe("reading the AI check's answer", () => {
  it("accepts JSON wrapped in prose or code fences and drops unknown kinds and categories", () => {
    const raw = 'Sure!\n```json\n{"personal":[{"kind":"NAME","value":" Zoe Quint "},{"kind":"SHOE_SIZE","value":"42"}],"categories":[{"category":"health_data","confidence":1.4,"evidence":"x-ray"},{"category":"weather","confidence":0.9}],"confidence":0.8,"summary":"A name."}\n```';
    expect(parseAiReply(raw, "m")).toEqual({
      model: "m", personal: [{ kind: "NAME", value: "Zoe Quint" }],
      categories: [{ category: "health_data", confidence: 1, evidence: "x-ray" }], confidence: 0.8, summary: "A name.",
    });
  });

  it("returns null for an answer without JSON", () => {
    expect(parseAiReply("I cannot help with that.", "m")).toBeNull();
  });
});

describe("combining the rules with the AI check", () => {
  it("masks a name only the AI check found, everywhere it appears", () => {
    const text = "zoe quint wants to know when Zoe will get her replacement card";
    const c = check(text, ok({ personal: [{ kind: "NAME", value: "zoe quint" }, { kind: "NAME", value: "Zoe" }] }));
    expect(route(c, standard).reason).toBe("Sent to Claude with 2 names masked.");
    expect(maskTexts([text], PEOPLE, c.extra).masked[0]).toBe("[NAME_1] wants to know when [NAME_2] will get her replacement card");
  });

  it("ignores personal data the model invented", () => {
    const c = check("Write a slogan for our summer campaign", ok({ personal: [{ kind: "NAME", value: "Max Mustermann" }] }));
    expect(c.personal).toEqual([]);
  });

  it("adds a category the rules missed", () => {
    const c = check("The x-ray from Tuesday shows a fracture", ok({ categories: [{ category: "health_data", confidence: 0.9, evidence: "x-ray" }] }));
    expect(c.detected).toContain("health_data");
    expect(route(c, standard).tier).toBe("green");
  });

  it("can never remove what the rules found", () => {
    const text = "Clause 4: Vertragsstrafe of 5%, NDA applies.";
    const c = check(text, ok({ confidence: 0.99, summary: "Nothing sensitive." }));
    expect(c.detected).toContain("contract_legal");
    expect(route(c, standard).tier).toBe("green");
  });

  it("plays safe when the AI check is unsure", () => {
    const d = route(check("Write a slogan for our summer campaign", ok({ confidence: 0.4 })), standard);
    expect([d.tier, d.reason]).toEqual(["green", "Unsure, so playing safe."]);
  });

  it("falls back to the rules alone when the AI check is off or fails", () => {
    for (const ai of [{ status: "off" }, { status: "error", message: "timeout" }] as AiCheck[]) {
      const c = check("i have a patience name Mr. Ahmed Fakh", ai);
      expect(c.personal.map((p) => p.value)).toEqual(["Ahmed Fakh"]);
      expect(c.ai).toEqual(ai);
    }
  });
});
