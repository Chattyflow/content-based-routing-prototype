import { describe, expect, it } from "vitest";
import { PEOPLE, PRESETS } from "../store/seed";
import { classify } from "./classifier";
import { buildConversation, type Turn } from "./conversation";
import { route } from "./router";

const decide = (text: string) => route(classify(text, PEOPLE), PRESETS.standard.policy);

describe("follow-up questions", () => {
  it("sends earlier turns as context, masked with the same placeholders", () => {
    const history: Turn[] = [{ text: "i have a patience name Mr. Ahmed Fakh", reply: "How can I help with Ahmed Fakh?", tier: "orange" }];
    const input = "Write him a short reminder about his appointment, Mr. Ahmed Fakh";
    const c = buildConversation(history, input, decide(input), PEOPLE);
    expect(c.messages).toEqual([
      { role: "user", content: "i have a patience name Mr. [NAME_1]" },
      { role: "assistant", content: "How can I help with [NAME_1]?" },
      { role: "user", content: "Write him a short reminder about his appointment, Mr. [NAME_1]" },
    ]);
    expect([c.mask?.count, c.contextTurns]).toEqual([1, 1]);
  });

  it("never sends a turn kept on GREEN to an external model", () => {
    const history: Turn[] = [
      { text: "Summarise this contract: Vertragsstrafe 5%, NDA applies.", reply: "The penalty is 5%...", tier: "green" },
      { text: "Write a slogan for our summer campaign", reply: "Summer, powered by you.", tier: "orange" },
    ];
    const c = buildConversation(history, "Make it shorter", decide("Make it shorter"), PEOPLE);
    expect(c.messages.map((m) => m.content).join(" ")).not.toMatch(/Vertragsstrafe|penalty/);
    expect(c.contextTurns).toBe(1);
  });

  it("keeps the whole conversation when the new request stays on GREEN", () => {
    const history: Turn[] = [{ text: "Summarise this contract: Vertragsstrafe 5%, NDA applies.", reply: "The penalty is 5%...", tier: "green" }];
    const input = "Is the NDA clause standard?";
    const c = buildConversation(history, input, decide(input), PEOPLE);
    expect(decide(input).tier).toBe("green");
    expect(c.messages).toHaveLength(3);
  });

  it("leaves out a turn that is still waiting for its reply", () => {
    const c = buildConversation([{ text: "Hello", reply: null, tier: "orange" }], "Write a slogan", decide("Write a slogan"), PEOPLE);
    expect(c.messages).toEqual([{ role: "user", content: "Write a slogan" }]);
  });
});
