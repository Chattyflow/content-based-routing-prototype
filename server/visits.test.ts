import { describe, expect, it } from "vitest";
import { memoryVisitStore, recordVisit, summarizeVisits } from "./visits.ts";

const browser = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const day = 86_400_000;
const now = Date.UTC(2026, 9, 15, 12);

describe("visitor counter", () => {
  it("counts browsers by day and country, and leaves out bots", async () => {
    const store = memoryVisitStore();
    expect(await recordVisit(store, { country: "DE", userAgent: browser, now })).toBe(true);
    await recordVisit(store, { country: "de", userAgent: browser, now });
    await recordVisit(store, { country: "FR", userAgent: browser, now: now - day });
    await recordVisit(store, { userAgent: browser, now });
    for (const bot of ["curl/8.19.0", "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/153.0", "Googlebot/2.1", ""]) {
      expect(await recordVisit(store, { country: "US", userAgent: bot, now })).toBe(false);
    }
    const s = await summarizeVisits(store, now);
    expect([s.total, s.today]).toEqual([4, 3]);
    expect(s.countries).toEqual([{ country: "DE", visits: 2 }, { country: "FR", visits: 1 }, { country: "XX", visits: 1 }]);
    expect(s.daily).toHaveLength(14);
    expect(s.daily.at(-1)).toEqual({ date: "2026-10-15", visits: 3 });
  });

  it("stores no IP or cookie, only day/country/random id, and forgets records after 90 days", async () => {
    const store = memoryVisitStore();
    await recordVisit(store, { country: "DE", userAgent: browser, now });
    await recordVisit(store, { country: "DE", userAgent: browser, now: now - 100 * day });
    const keys = await store.keys();
    expect(keys.every((k) => /^\d{4}-\d{2}-\d{2}\/[A-Z]{2}\/[0-9a-f-]{36}$/.test(k))).toBe(true);
    await summarizeVisits(store, now);
    expect(await store.keys()).toHaveLength(1);
  });
});
