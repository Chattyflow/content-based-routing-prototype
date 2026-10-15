// A privacy-friendly visitor counter: no cookies, and network addresses are never
// stored. Each visit (one per browser session) is stored as its own small record
// named "day/country/visitor code/random id", and the totals are counted from
// those names, so visits arriving at the same time never overwrite each other.
// Known bots are left out. Hosted, the records live in Netlify Blobs; locally,
// in memory.
//
// Unique visitors: the visitor code is a one-way hash of the network address and
// browser, mixed with a random value that exists for one day only. The day's
// random value is deleted afterwards, so codes cannot be traced back or linked
// across days. Unique visitors are therefore counted per day.

export interface VisitStore {
  add(key: string): Promise<void>;
  keys(): Promise<string[]>;
  remove(key: string): Promise<void>;
  /** The random value for a day, created on first use. */
  salt(day: string): Promise<string>;
  /** Delete the random values of days before `day`. */
  forgetSalts(beforeDay: string): Promise<void>;
}

export function memoryVisitStore(): VisitStore {
  const keys = new Set<string>();
  const salts = new Map<string, string>();
  return {
    add: async (k) => void keys.add(k),
    keys: async () => [...keys],
    remove: async (k) => void keys.delete(k),
    salt: async (d) => {
      if (!salts.has(d)) salts.set(d, crypto.randomUUID());
      return salts.get(d)!;
    },
    forgetSalts: async (before) => {
      for (const d of salts.keys()) if (d < before) salts.delete(d);
    },
  };
}

/** Crawlers, link previews, scanners and scripts. */
export const BOT_USER_AGENT = /bot|crawl|spider|slurp|headless|preview|curl|wget|python|httpclient|scan|monitor|lighthouse|claude-user|facebookexternalhit|embedly|go-http|axios|node-fetch|java\//i;

const KEEP_DAYS = 90;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

async function visitorCode(salt: string, ip: string, userAgent: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}|${userAgent}`));
  return [...new Uint8Array(bytes)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function recordVisit(
  store: VisitStore,
  { country, userAgent, ip, now = Date.now() }: { country?: string; userAgent?: string; ip?: string; now?: number },
): Promise<boolean> {
  if (!userAgent || BOT_USER_AGENT.test(userAgent)) return false;
  const today = day(now);
  const cc = /^[A-Za-z]{2}$/.test(country ?? "") ? country!.toUpperCase() : "XX";
  // Without a network address every visit counts as a new visitor.
  const visitor = ip ? await visitorCode(await store.salt(today), ip, userAgent) : `x${crypto.randomUUID().slice(0, 15)}`;
  await store.add(`${today}/${cc}/${visitor}/${crypto.randomUUID()}`);
  await store.forgetSalts(today);
  return true;
}

export interface VisitSummary {
  /** Visits (browser sessions) in the window. */
  total: number;
  /** Unique visitors per day, added up over the window. */
  unique: number;
  today: number;
  todayUnique: number;
  /** The last 14 days, oldest first, including days without visits. */
  daily: { date: string; visits: number; unique: number }[];
  countries: { country: string; visits: number }[];
  windowDays: number;
}

export async function summarizeVisits(store: VisitStore, now = Date.now(), windowDays = 30): Promise<VisitSummary> {
  const since = day(now - (windowDays - 1) * 86_400_000);
  const forget = day(now - KEEP_DAYS * 86_400_000);
  const perDay = new Map<string, number>();
  const visitorsPerDay = new Map<string, Set<string>>();
  const perCountry = new Map<string, number>();
  let total = 0;
  for (const key of await store.keys()) {
    const parts = key.split("/");
    const [date, country] = parts;
    // Records from before unique counting have no visitor code: each counts as unique.
    const visitor = parts.length >= 4 ? parts[2] : parts[2] ?? key;
    if (date < forget) {
      await store.remove(key).catch(() => {}); // older records are not kept
      continue;
    }
    if (date < since) continue;
    total++;
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
    if (!visitorsPerDay.has(date)) visitorsPerDay.set(date, new Set());
    visitorsPerDay.get(date)!.add(visitor);
    perCountry.set(country, (perCountry.get(country) ?? 0) + 1);
  }
  await store.forgetSalts(day(now)).catch(() => {});
  const uniqueOn = (date: string) => visitorsPerDay.get(date)?.size ?? 0;
  const daily = Array.from({ length: 14 }, (_, i) => {
    const date = day(now - (13 - i) * 86_400_000);
    return { date, visits: perDay.get(date) ?? 0, unique: uniqueOn(date) };
  });
  return {
    total,
    unique: [...visitorsPerDay.keys()].reduce((sum, date) => sum + uniqueOn(date), 0),
    today: perDay.get(day(now)) ?? 0,
    todayUnique: uniqueOn(day(now)),
    daily,
    countries: [...perCountry.entries()].map(([country, visits]) => ({ country, visits })).sort((a, b) => b.visits - a.visits),
    windowDays,
  };
}
