// A privacy-friendly visitor counter: no cookies, no IP addresses. Each visit
// (one per browser session) is stored as its own small record named
// "day/country/random id", and the totals are counted from those names, so
// visits arriving at the same time never overwrite each other. Known bots are
// left out. Hosted, the records live in Netlify Blobs; locally, in memory.

export interface VisitStore {
  add(key: string): Promise<void>;
  keys(): Promise<string[]>;
  remove(key: string): Promise<void>;
}

export function memoryVisitStore(): VisitStore {
  const keys = new Set<string>();
  return {
    add: async (k) => void keys.add(k),
    keys: async () => [...keys],
    remove: async (k) => void keys.delete(k),
  };
}

/** Crawlers, link previews, scanners and scripts. */
export const BOT_USER_AGENT = /bot|crawl|spider|slurp|headless|preview|curl|wget|python|httpclient|scan|monitor|lighthouse|claude-user|facebookexternalhit|embedly|go-http|axios|node-fetch|java\//i;

const KEEP_DAYS = 90;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

export async function recordVisit(store: VisitStore, { country, userAgent, now = Date.now() }: { country?: string; userAgent?: string; now?: number }): Promise<boolean> {
  if (!userAgent || BOT_USER_AGENT.test(userAgent)) return false;
  const cc = /^[A-Za-z]{2}$/.test(country ?? "") ? country!.toUpperCase() : "XX";
  await store.add(`${day(now)}/${cc}/${crypto.randomUUID()}`);
  return true;
}

export interface VisitSummary {
  total: number;
  today: number;
  /** The last 14 days, oldest first, including days without visits. */
  daily: { date: string; visits: number }[];
  countries: { country: string; visits: number }[];
  windowDays: number;
}

export async function summarizeVisits(store: VisitStore, now = Date.now(), windowDays = 30): Promise<VisitSummary> {
  const since = day(now - (windowDays - 1) * 86_400_000);
  const forget = day(now - KEEP_DAYS * 86_400_000);
  const perDay = new Map<string, number>();
  const perCountry = new Map<string, number>();
  let total = 0;
  for (const key of await store.keys()) {
    const [date, country] = key.split("/");
    if (date < forget) {
      await store.remove(key).catch(() => {}); // older records are not kept
      continue;
    }
    if (date < since) continue;
    total++;
    perDay.set(date, (perDay.get(date) ?? 0) + 1);
    perCountry.set(country, (perCountry.get(country) ?? 0) + 1);
  }
  const daily = Array.from({ length: 14 }, (_, i) => {
    const date = day(now - (13 - i) * 86_400_000);
    return { date, visits: perDay.get(date) ?? 0 };
  });
  return {
    total,
    today: perDay.get(day(now)) ?? 0,
    daily,
    countries: [...perCountry.entries()].map(([country, visits]) => ({ country, visits })).sort((a, b) => b.visits - a.visits),
    windowDays,
  };
}
