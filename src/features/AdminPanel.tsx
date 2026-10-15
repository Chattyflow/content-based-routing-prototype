// Side panel for the presenter: what happened behind the scenes for each of the
// current user's requests. Employees never see this.

import { useState } from "react";
import { EyeOff } from "lucide-react";
import type { User } from "../types";
import { useStore } from "../store/store";
import { DecisionDetail, DecisionSummary } from "./Decision";

export function AdminPanel({ user }: { user: User }) {
  const s = useStore();
  const items = s.chat.filter((c) => c.userId === user.id).slice().reverse();
  const [open, setOpen] = useState<string | null>(null);
  const threshold = s.policies[user.team].threshold;

  return (
    <aside className="space-y-3" aria-label="Admin view">
      <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
        <div className="flex items-center gap-1.5 font-semibold"><EyeOff className="size-3.5" aria-hidden /> Admin view</div>
        Employees never see this. Each request is routed automatically, before it leaves.
      </div>
      {items.map((c, i) => {
        const d = s.details[c.id];
        if (!d) return null;
        const expanded = open === c.id || (open === null && i === 0);
        return (
          <section key={c.id} className="card space-y-2 p-3">
            <p className="line-clamp-2 text-xs text-slate-500">“{c.text}”</p>
            <DecisionSummary d={d} />
            <button className="link text-xs" onClick={() => setOpen(expanded ? "" : c.id)} aria-expanded={expanded}>{expanded ? "Hide details" : "Why?"}</button>
            {expanded && <DecisionDetail d={d} threshold={threshold} />}
          </section>
        );
      })}
      {!items.length && <p className="px-1 text-sm text-slate-500">Send a request to see how it is routed.</p>}
    </aside>
  );
}
