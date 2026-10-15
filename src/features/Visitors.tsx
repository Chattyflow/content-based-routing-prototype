// Who visited the web app: visits per day and country, without cookies or IP
// addresses. Shown to admins in the Routing log tab.

import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { fetchVisits, isOptedOut, setOptedOut, type VisitSummary } from "../lib/visits";

const countryName = (code: string) => {
  if (code === "XX") return "Unknown";
  try {
    return new Intl.DisplayNames(undefined, { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

export function Visitors() {
  const [data, setData] = useState<VisitSummary | null | undefined>(undefined);
  const [optedOut, setOptedOutState] = useState(isOptedOut());

  useEffect(() => {
    void fetchVisits().then(setData);
  }, []);

  const max = Math.max(1, ...(data?.daily.map((d) => d.visits) ?? [1]));

  return (
    <section className="card space-y-4 p-4" aria-labelledby="visitors">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="visitors" className="flex items-center gap-2 text-base font-semibold"><Users className="size-4" aria-hidden /> Visitors</h2>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={optedOut} onChange={(e) => { setOptedOut(e.target.checked); setOptedOutState(e.target.checked); }} />
          Don't count my visits on this browser
        </label>
      </div>

      {data === undefined && <p className="text-sm text-slate-500">Loading…</p>}
      {data === null && <p className="text-sm text-slate-500">Visitor numbers are not available here.</p>}
      {data && (
        <>
          <div className="flex flex-wrap gap-6">
            <div><div className="text-2xl font-semibold">{data.total}</div><div className="text-xs text-slate-500">visits, last {data.windowDays} days</div></div>
            <div><div className="text-2xl font-semibold">{data.today}</div><div className="text-xs text-slate-500">today</div></div>
            <div><div className="text-2xl font-semibold">{data.countries.length}</div><div className="text-xs text-slate-500">countries</div></div>
          </div>

          <div>
            <div className="mb-1 text-xs text-slate-500">Last 14 days</div>
            <div className="flex h-24 items-end gap-1" role="img" aria-label={`Visits per day: ${data.daily.map((d) => `${d.date} ${d.visits}`).join(", ")}`}>
              {data.daily.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.visits}`}>
                  <div className="w-full rounded-t bg-indigo-500" style={{ height: `${(d.visits / max) * 80}px`, minHeight: d.visits ? 3 : 0 }} />
                  <span className="text-[9px] text-slate-400">{d.date.slice(8)}</span>
                </div>
              ))}
            </div>
          </div>

          {data.countries.length > 0 && (
            <ul className="space-y-1 text-sm">
              {data.countries.slice(0, 6).map((c) => (
                <li key={c.country} className="flex justify-between gap-4"><span>{countryName(c.country)}</span><span className="text-slate-500">{c.visits}</span></li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="text-xs text-slate-500">Counted without cookies or IP addresses: one visit per browser session, stored as day and country only. Known bots and scripts are left out.</p>
    </section>
  );
}
