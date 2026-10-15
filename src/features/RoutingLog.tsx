import { Fragment, useState } from "react";
import type { AuditEntry, PolicyCategory, Tier } from "../types";
import { CATEGORY_INFO } from "../lib/classifier";
import { TEAMS, USERS } from "../store/seed";
import { useStore } from "../store/store";
import { TIER, TierPill } from "../app/ui";
import { DecisionDetail } from "./Decision";

const catLabel = (c: PolicyCategory) => (c === "personal" ? "Personal data" : CATEGORY_INFO[c].label);

export function RoutingLog() {
  const s = useStore();
  const audit = s.audit;
  const [open, setOpen] = useState<string | null>(null);
  const total = audit.length || 1;
  const byTier = (t: Tier) => audit.filter((e) => e.routedTier === t).length;
  const sensitive = audit.filter((e) => e.categories.some((c) => c !== "personal") || e.lowConfidence);
  const keptGreen = sensitive.filter((e) => e.routedTier === "green").length;
  const masked = audit.filter((e) => e.maskedItems > 0).length;
  const playedSafe = audit.filter((e) => e.lowConfidence).length;
  const rows = [...audit].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Routing log</h1>
        <p className="text-sm text-slate-600">Admins only. Every request with what was detected and where it went, never the content itself.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-3">
          <div className="text-xs text-slate-500">Requests per tier</div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full" aria-hidden>
            {(["green", "orange", "red"] as Tier[]).map((t) => (
              <div key={t} className={t === "green" ? "bg-emerald-600" : t === "orange" ? "bg-amber-500" : "bg-rose-600"} style={{ width: `${(byTier(t) / total) * 100}%` }} />
            ))}
          </div>
          <div className="mt-2 space-y-0.5 text-xs">
            {(["green", "orange", "red"] as Tier[]).map((t) => <div key={t}>{TIER[t].label}: {Math.round((byTier(t) / total) * 100)}%</div>)}
          </div>
        </div>
        <Stat label="Sensitive requests kept on EU infrastructure" value={`${sensitive.length ? Math.round((keptGreen / sensitive.length) * 100) : 0}%`} hint={`${keptGreen} of ${sensitive.length}`} />
        <Stat label="Requests with personal data masked" value={String(masked)} hint={`of ${audit.length} requests`} />
        <Stat label="Unsure, so played safe" value={String(playedSafe)} hint="kept on GREEN below the threshold" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-200">
              {["Time", "User", "Detected", "Routed to", "Reason"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((e: AuditEntry) => {
              const u = USERS.find((x) => x.id === e.userId);
              const detail = s.details[e.id];
              return (
                <Fragment key={e.id}>
                  <tr className="border-b border-slate-100 align-top">
                    <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-500">{new Date(e.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{u?.name}<div className="text-slate-500">{TEAMS[e.team]}</div></td>
                    <td className="px-3 py-2 text-xs">{e.categories.length ? e.categories.map(catLabel).join(", ") : "Nothing sensitive"}{e.maskedItems ? ` · ${e.maskedItems} masked` : ""}</td>
                    <td className="px-3 py-2 text-xs"><TierPill tier={e.routedTier} short={false} /><div className="mt-0.5 text-slate-500">{e.model}</div></td>
                    <td className="px-3 py-2 text-xs">
                      {e.reason}
                      {detail && (
                        <button className="link mt-1 block text-xs" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                          {open === e.id ? "Hide details" : "Details (this session)"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {detail && open === e.id && (
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <td colSpan={5} className="px-3 py-3"><DecisionDetail d={detail} threshold={s.policies[e.team].threshold} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-slate-500">{hint}</div>
    </div>
  );
}
