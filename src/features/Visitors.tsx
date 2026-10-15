// Who visited the web app: visits and unique visitors per day, plus countries,
// without cookies. Shown to admins in the Routing log tab.

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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

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
            <Stat value={data.total} label={`visits, last ${data.windowDays} days`} />
            <Stat value={data.unique} label={`unique visitors, last ${data.windowDays} days*`} />
            <Stat value={data.today} label="visits today" />
            <Stat value={data.todayUnique} label="unique visitors today" />
            <Stat value={data.countries.length} label="countries" />
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>Last 14 days</span>
              <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-indigo-300" aria-hidden /> Visits</span>
              <span className="flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-indigo-700" aria-hidden /> Unique visitors</span>
            </div>
            <div className="flex h-24 items-end gap-1" role="img"
              aria-label={`Visits and unique visitors per day: ${data.daily.map((d) => `${d.date} ${d.visits} visits, ${d.unique} unique`).join("; ")}`}>
              {data.daily.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.visits} visits, ${d.unique} unique visitors`}>
                  <div className="flex w-full items-end justify-center gap-px">
                    <div className="w-1/2 rounded-t bg-indigo-300" style={{ height: `${(d.visits / max) * 80}px`, minHeight: d.visits ? 3 : 0 }} />
                    <div className="w-1/2 rounded-t bg-indigo-700" style={{ height: `${(d.unique / max) * 80}px`, minHeight: d.unique ? 3 : 0 }} />
                  </div>
                  <span className="text-[9px] text-slate-400">{d.date.slice(8)}</span>
                </div>
              ))}
            </div>
          </div>

          {data.countries.length > 0 && (
            <ul className="space-y-1 text-sm">
              {data.countries.slice(0, 6).map((c) => (
                <li key={c.country} className="flex justify-between gap-4"><span>{countryName(c.country)}</span><span className="text-slate-500">{c.visits} visits</span></li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="text-xs text-slate-500">
        No cookies, and network addresses are never stored. A visit is one browser session. Unique visitors are recognised within a day by a one-way code made from the
        network address and browser plus a random value that is deleted at the end of the day, so visitors cannot be traced or followed across days.
        *Unique visitors over several days are the daily figures added up. Known bots and scripts are left out.
      </p>
    </section>
  );
}
