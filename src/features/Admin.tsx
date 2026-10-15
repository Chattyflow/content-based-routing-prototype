import { useState } from "react";
import type { CategoryAction, Policy, PolicyCategory, TeamId } from "../types";
import { CATEGORY_INFO } from "../lib/classifier";
import { PRESETS, TEAMS } from "../store/seed";
import { actions } from "../store/store";

const ROWS: { id: PolicyCategory; label: string }[] = [
  { id: "personal", label: "Personal data (names, emails, phones, IBANs, dates of birth)" },
  ...(Object.keys(CATEGORY_INFO) as (keyof typeof CATEGORY_INFO)[]).map((id) => ({ id, label: CATEGORY_INFO[id].label })),
];

const ACTIONS: { id: CategoryAction; label: string }[] = [
  { id: "green", label: "Keep on GREEN" },
  { id: "mask", label: "Mask, allow ORANGE" },
  { id: "any", label: "Allow any model" },
];

export function Admin({ policies }: { policies: Record<TeamId, Policy> }) {
  const [team, setTeam] = useState<TeamId>("hr");
  const p = policies[team];
  const set = (patch: Partial<Policy>) => actions.setPolicy(team, { ...p, ...patch });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Admin rules</h1>
        <p className="text-sm text-slate-600">Decide per team what happens to each kind of content. Changes apply to the next request.</p>
      </div>

      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Team">
        {(Object.keys(TEAMS) as TeamId[]).map((t) => (
          <button key={t} role="tab" aria-selected={t === team} className={`btn ${t === team ? "btn-primary" : ""}`} onClick={() => setTeam(t)}>{TEAMS[t]}</button>
        ))}
      </div>

      <div className="card space-y-5 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Apply a preset:</span>
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
            <button key={k} className="btn py-1" onClick={() => actions.setPolicy(team, { ...PRESETS[k].policy, actions: { ...PRESETS[k].policy.actions } })}>{PRESETS[k].label}</button>
          ))}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pb-2 font-medium">Content</th>
              <th className="pb-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="py-2 pr-3">{row.label}</td>
                <td className="py-2">
                  <label className="sr-only" htmlFor={`a-${row.id}`}>Action for {row.label}</label>
                  <select id={`a-${row.id}`} className="input w-auto py-1" value={p.actions[row.id]} onChange={(e) => set({ actions: { ...p.actions, [row.id]: e.target.value as CategoryAction } })}>
                    {ACTIONS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div>
          <label className="text-sm font-medium" htmlFor="threshold">Confidence threshold: {Math.round(p.threshold * 100)}%</label>
          <input id="threshold" type="range" min={0.3} max={0.95} step={0.05} value={p.threshold} onChange={(e) => set({ threshold: Number(e.target.value) })} className="mt-1 w-full" />
          <p className="text-xs text-slate-500">Below this, requests stay on GREEN: "Unsure, so playing safe."</p>
        </div>

        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={p.redAllowed} onChange={(e) => set({ redAllowed: e.target.checked })} /> Allow RED (external models without masking)</label>
        </div>
      </div>
    </div>
  );
}
