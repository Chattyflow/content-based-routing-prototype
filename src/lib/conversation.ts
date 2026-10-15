// What the chosen model receives for a follow-up: the earlier turns it may see,
// plus the new message, masked together so placeholders stay consistent.
//
// A turn that was kept on GREEN never goes to an external model later as
// history: otherwise "make it shorter" after a confidential contract would
// carry the contract out with it.

import type { Tier } from "../types";
import type { ChatMessage } from "./aiChat";
import { maskTexts, type KnownPerson, type MaskResult, type PiiExtra } from "./pii";
import type { Decision } from "./router";

export interface Turn {
  text: string;
  reply: string | null;
  tier: Tier;
  extra?: PiiExtra[];
}

export interface Conversation {
  messages: ChatMessage[];
  /** Masking for the whole conversation; `count` covers the new message only. */
  mask?: MaskResult;
  /** Earlier turns included as context. */
  contextTurns: number;
}

export function buildConversation(history: Turn[], input: string, decision: Decision, people: KnownPerson[] = [], extra: PiiExtra[] = []): Conversation {
  const external = decision.tier !== "green";
  const usable = history.filter((t) => t.reply !== null && (!external || t.tier !== "green"));
  const texts = [...usable.flatMap((t) => [t.text, t.reply!]), input];
  let contents = texts;
  let mask: MaskResult | undefined;
  if (decision.masked) {
    const m = maskTexts(texts, people, [...usable.flatMap((t) => t.extra ?? []), ...extra]);
    mask = { ...m, count: m.matches.filter((x) => x.textIndex === texts.length - 1).length };
    contents = m.masked;
  }
  return {
    messages: contents.map((content, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content })),
    mask,
    contextTurns: usable.length,
  };
}
