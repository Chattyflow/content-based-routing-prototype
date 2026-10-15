// Counts one visit per browser session (no cookies; the server stores only the
// day and the country). A browser can opt out, for example the owner's own.

import type { VisitSummary } from "../../server/visits.ts";

export type { VisitSummary };

const OPT_OUT = "cbr:dont-count-visits";
const COUNTED = "cbr:visit-counted";

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // storage blocked: nothing to remember
  }
}

export const isOptedOut = () => read(() => localStorage, OPT_OUT) === "1";
export const setOptedOut = (on: boolean) => write(() => localStorage, OPT_OUT, on ? "1" : null);

export function countVisit() {
  if (isOptedOut() || read(() => sessionStorage, COUNTED)) return;
  write(() => sessionStorage, COUNTED, "1");
  void fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", keepalive: true }).catch(() => {});
}

export async function fetchVisits(): Promise<VisitSummary | null> {
  try {
    const r = await fetch("/api/visits");
    if (!r.ok || !r.headers.get("content-type")?.includes("application/json")) return null;
    return (await r.json()) as VisitSummary;
  } catch {
    return null;
  }
}
