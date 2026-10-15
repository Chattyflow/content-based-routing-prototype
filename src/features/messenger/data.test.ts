import { describe, expect, it } from "vitest";
import { CONTACTS, SEED_UNREAD, isExternal, seedThreads } from "./data";

describe("messenger contacts", () => {
  it("has colleagues and people outside the organisation, each with replies", () => {
    expect(CONTACTS.filter((c) => !isExternal(c)).length).toBeGreaterThanOrEqual(4);
    expect(CONTACTS.filter(isExternal).map((c) => c.org)).toEqual(["Baltic Grid Components", "Marino & Partner", "Private customer"]);
    expect(CONTACTS.every((c) => c.replies.length > 0)).toBe(true);
  });

  it("seeds conversations and unread counts only for known contacts", () => {
    const ids = new Set(CONTACTS.map((c) => c.id));
    const threads = seedThreads(0);
    for (const [id, messages] of Object.entries(threads)) {
      expect(ids.has(id)).toBe(true);
      expect(messages.every((m) => m.from === "me" || m.from === id)).toBe(true);
    }
    expect(Object.keys(SEED_UNREAD).every((id) => threads[id]?.at(-1)?.from === id)).toBe(true);
  });
});
