// Admin-only: how one request was routed, and why.

import { CATEGORY_INFO } from "../lib/classifier";
import { describeMasking } from "../lib/router";
import type { RoutingDetail } from "../store/store";
import { TierPill } from "../app/ui";

export function DecisionSummary({ d }: { d: RoutingDetail }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <TierPill tier={d.decision.tier} />
        <span className="font-medium">{d.decision.model.label}</span>
        <span className="text-xs text-slate-500">· confidence {Math.round(d.classification.confidence * 100)}%</span>
      </div>
      <p className="text-sm text-slate-700">{d.decision.reason}</p>
    </div>
  );
}

export function DecisionDetail({ d, threshold }: { d: RoutingDetail; threshold: number }) {
  const c = d.classification;
  const hits = c.categories.filter((x) => x.fired.length);
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="text-xs font-semibold text-slate-500">Personal data</div>
        <p>{c.personal.length ? `${describeMasking(c.personalCounts)} found` : "None found"}</p>
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-500">Confidential business content</div>
        {hits.length ? (
          <ul className="space-y-1">
            {hits.map((h) => (
              <li key={h.category}>
                <span className={h.detected ? "font-medium" : "text-slate-500"}>{CATEGORY_INFO[h.category].label}</span>
                <span className="text-xs text-slate-500"> · score {h.score.toFixed(2)}{h.detected ? " · detected" : " · below 0.50"}</span>
                <div className="text-xs text-slate-500">{h.fired.map((f) => `${f.rule.label} (“${f.match}”, +${f.rule.weight})`).join("; ")}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p>None found</p>
        )}
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-500">Confidence {Math.round(c.confidence * 100)}% · threshold {Math.round(threshold * 100)}%</div>
        <div className="relative mt-1 h-2 rounded-full bg-slate-100" aria-hidden>
          <div className={`h-2 rounded-full ${d.decision.lowConfidence ? "bg-amber-500" : "bg-slate-700"}`} style={{ width: `${c.confidence * 100}%` }} />
          <div className="absolute -top-1 h-4 w-0.5 bg-rose-500" style={{ left: `${threshold * 100}%` }} />
        </div>
      </div>
      {d.mask && d.mask.count > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500">What the external model received ({d.mask.count} masked)</div>
          <p className="mt-1 rounded-lg bg-amber-50 p-2 font-mono text-xs whitespace-pre-wrap">{d.sentText}</p>
        </div>
      )}
      <p className="text-xs text-slate-500">Classified in ~40 ms on EU infrastructure (simulated).</p>
    </div>
  );
}
