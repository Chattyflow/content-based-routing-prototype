// The other side of a conversation, played by a model in this prototype. The
// browser masks personal data first and sends the conversation to /api/dm; the
// server (server/api.ts) adds the persona and asks OpenRouter.

import { ORG, isExternal, type Contact } from "./data.ts";

export interface DmTurn {
  from: "me" | "them";
  text: string;
}

export interface DmRequest {
  contactId: string;
  me: { name: string; role: string };
  turns: DmTurn[];
}

export type DmAnswer = { status: "ok"; reply: string; model: string } | { status: "off" } | { status: "error"; message: string };

export function personaPrompt(c: Contact, me: DmRequest["me"]): string {
  const first = c.name.split(" ")[0];
  return `You are ${c.name}, ${c.role} at ${c.org ?? ORG}. ${c.about}

You are chatting in a work messenger with ${me.name}, ${me.role} at ${ORG}${isExternal(c) ? ", a company you work with" : ", your colleague"}.

Write ${first}'s next message only:
- Reply to what was actually said, consistent with the whole conversation so far.
- Keep it short, like a chat message: one to three sentences. Plain text, no Markdown, no greeting line, no signature.
- Use the language of the last message.
- Stay in character. Never mention being an AI, a model or a simulation.
- If you are asked something you cannot know, say you'll check rather than inventing facts, figures or dates.
- Personal data may appear as placeholders such as [NAME_1] or [PHONE_1]. Use them exactly as written, as if they were the real values, and never comment on them.`;
}

/** Ask the local or hosted server for the other person's reply. */
export async function runDm(req: DmRequest): Promise<DmAnswer> {
  try {
    const r = await fetch("/api/dm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(50_000),
    });
    if (!r.ok || !r.headers.get("content-type")?.includes("application/json")) return { status: "off" };
    return (await r.json()) as DmAnswer;
  } catch {
    return { status: "error", message: "No answer in time." };
  }
}
