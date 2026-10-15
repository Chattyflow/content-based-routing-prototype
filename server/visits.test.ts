import { describe, expect, it } from "vitest";
import { memoryVisitStore, recordVisit, summarizeVisits } from "./visits.ts";

const browser = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36";
const phone = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const day = 86_400_000;
const now = Date.UTC(2026, 9, 15, 12);

describe("visitor counter", () => {
  it("counts visits and unique visitors per day, by country, and leaves out bots", async () => {
    const store = memoryVisitStore();
    // The same person visits twice today, a second person once, and the first person came yesterday too.
    expect(await recordVisit(store, { country: "DE", userAgent: browser, ip: "203.0.113.7", now })).toBe(true);
    await recordVisit(store, { country: "de", userAgent: browser, ip: "203.0.113.7", now: now + 3_600_000 });
    await recordVisit(store, { country: "FR", userAgent: phone, ip: "198.51.100.4", now });
    await recordVisit(store, { country: "DE", userAgent: browser, ip: "203.0.113.7", now: now - day });
    for (const bot of ["curl/8.19.0", "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/153.0", "Googlebot/2.1", ""]) {
      expect(await recordVisit(store, { country: "US", userAgent: bot, ip: "192.0.2.1", now })).toBe(false);
    }
    const s = await summarizeVisits(store, now);
    expect([s.total, s.unique, s.today, s.todayUnique]).toEqual([4, 3, 3, 2]);
    expect(s.daily.at(-1)).toEqual({ date: "2026-10-15", visits: 3, unique: 2 });
    expect(s.daily.at(-2)).toEqual({ date: "2026-10-14", visits: 1, unique: 1 });
    expect(s.countries).toEqual([{ country: "DE", visits: 3 }, { country: "FR", visits: 1 }]);
  });

  it("never stores the network address, and forgets the day's random value afterwards", async () => {
    const store = memoryVisitStore();
    await recordVisit(store, { country: "DE", userAgent: browser, ip: "203.0.113.7", now: now - day });
    const yesterdaySalt = await store.salt("2026-10-14");
    await recordVisit(store, { country: "DE", userAgent: browser, ip: "203.0.113.7", now });
    const keys = await store.keys();
    expect(keys.join(" ")).not.toContain("203.0.113.7");
    expect(keys.every((k) => /^\d{4}-\d{2}-\d{2}\/[A-Z]{2}\/[0-9a-z]{16}\/[0-9a-f-]{36}$/.test(k))).toBe(true);
    // The same person gets a different code on a different day: no tracking across days.
    expect(keys[0].split("/")[2]).not.toBe(keys[1].split("/")[2]);
    expect(await store.salt("2026-10-14")).not.toBe(yesterdaySalt); // yesterday's value was deleted
  });

  it("counts every visit as unique when no network address is known", async () => {
    const store = memoryVisitStore();
    await recordVisit(store, { country: "DE", userAgent: browser, now });
    await recordVisit(store, { country: "DE", userAgent: browser, now });
    expect((await summarizeVisits(store, now)).todayUnique).toBe(2);
  });

  it("keeps older records readable and forgets records after 90 days", async () => {
    const store = memoryVisitStore();
    await store.add(`2026-10-15/DE/${crypto.randomUUID()}`); // a record from before unique counting
    await recordVisit(store, { country: "DE", userAgent: browser, ip: "203.0.113.7", now: now - 100 * day });
    const s = await summarizeVisits(store, now);
    expect([s.today, s.todayUnique]).toEqual([1, 1]);
    expect(await store.keys()).toHaveLength(1);
  });
});
