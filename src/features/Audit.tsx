import type { AuditEntry, PolicyCategory, Tier } from "../types";
import { CATEGORY_INFO } from "../lib/classifier";
import { TEAMS, USERS } from "../store/seed";
import { TIER, TierPill } from "../app/ui";

const catLabel = (c: PolicyCategory) => (c === "personal" ? "Personal data" : CATEGORY_INFO[c].label);

export function Audit({ audit }: { audit: AuditEntry[] }) {
  const total = audit.length || 1;
  const byTier = (t: Tier) => audit.filter((e) => e.routedTier === t).length;
  const overrides = audit.filter((e) => e.override).length;
  const flags = audit.filter((e) => e.flag);
  const sensitive = audit.filter((e) => e.categories.some((c) => c !== "personal") || e.lowConfidence);
  const keptGreen = sensitive.filter((e) => e.routedTier === "green").length;
  const rows = [...audit].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Audit log</h1>
        <p className="text-sm text-slate-600">Every request is logged with what was detected, never the content itself.</p>
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
        <Stat label="Override rate" value={`${Math.round((overrides / total) * 100)}%`} hint={`${overrides} of ${audit.length} requests`} />
        <Stat label="Flagged decisions" value={String(flags.length)} hint={`${flags.filter((f) => f.flag === "too_cautious").length} too cautious · ${flags.filter((f) => f.flag === "missed_sensitive").length} missed sensitive`} />
        <Stat label="Sensitive requests kept on EU infrastructure" value={`${sensitive.length ? Math.round((keptGreen / sensitive.length) * 100) : 0}%`} hint={`${keptGreen} of ${sensitive.length}`} />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-200">
              {["Time", "User", "Detected", "Routed to", "Override", "Flag"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const u = USERS.find((x) => x.id === e.userId);
              return (
                <tr key={e.id} className="border-b border-slate-100 align-top last:border-0">
                  <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-500">{new Date(e.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{u?.name}<div className="text-slate-500">{TEAMS[e.team]}{e.mode === "manual" ? " · manual" : ""}</div></td>
                  <td className="px-3 py-2 text-xs">{e.categories.length ? e.categories.map(catLabel).join(", ") : "Nothing sensitive"}{e.lowConfidence ? " · low confidence" : ""}{e.maskedItems ? ` · ${e.maskedItems} masked` : ""}</td>
                  <td className="px-3 py-2 text-xs"><TierPill tier={e.routedTier} short={false} /><div className="mt-0.5 text-slate-500">{e.model}</div>{e.manualRisk && <div className="text-amber-700">riskier than routing</div>}</td>
                  <td className="px-3 py-2 text-xs">{e.override ? `${TIER[e.override.from].label} → ${TIER[e.override.to].label}` : "-"}</td>
                  <td className="px-3 py-2 text-xs">{e.flag === "too_cautious" ? "Too cautious" : e.flag === "missed_sensitive" ? "Missed sensitive" : "-"}</td>
                </tr>
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
