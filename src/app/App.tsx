import { useState } from "react";
import { RotateCcw, Route } from "lucide-react";
import { Admin } from "../features/Admin";
import { Audit } from "../features/Audit";
import { Chat } from "../features/Chat";
import { TEAMS, USERS } from "../store/seed";
import { actions, useStore } from "../store/store";
import { Avatar } from "./ui";

type Tab = "chat" | "admin" | "audit";
const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "admin", label: "Admin rules" },
  { id: "audit", label: "Audit log" },
];

export function App() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>("chat");
  const user = USERS.find((u) => u.id === s.userId) ?? USERS[0];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-slate-800 text-white" aria-hidden><Route className="size-4" /></span>
            <span className="text-sm font-semibold">AI Workspace <span className="font-normal text-slate-500">— Content-Based Routing (concept)</span></span>
          </div>
          <span className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">Concept prototype</span>

          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-slate-300 bg-slate-100 p-0.5 text-sm" role="radiogroup" aria-label="Mode">
              {(["manual", "auto"] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={s.mode === m}
                  onClick={() => actions.setMode(m)}
                  className={`rounded-md px-3 py-1 font-medium ${s.mode === m ? "bg-white text-slate-900 shadow-xs" : "text-slate-600"}`}
                >
                  {m === "manual" ? "Manual (today)" : "Auto (proposed)"}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <Avatar name={user.name} color={user.avatarColor} />
              <select className="input w-auto py-1 text-xs" value={user.id} onChange={(e) => actions.setUser(e.target.value)} aria-label="Current user">
                {USERS.map((u) => <option key={u.id} value={u.id}>{u.name} · {TEAMS[u.team]}</option>)}
              </select>
            </label>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 px-4" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              {t.label}
            </button>
          ))}
          <button className="link ml-auto inline-flex items-center gap-1 py-2 text-xs" onClick={() => { if (confirm("Reset rules and the audit log to the demo start?")) actions.reset(); }}>
            <RotateCcw className="size-3.5" aria-hidden /> Reset demo
          </button>
        </nav>
      </header>

      <main className="px-4 py-6">
        {tab === "chat" && <Chat key={`${user.id}-${s.mode}`} user={user} mode={s.mode} policy={s.policies[user.team]} />}
        {tab === "admin" && <Admin policies={s.policies} />}
        {tab === "audit" && <Audit audit={s.audit} />}
      </main>
    </div>
  );
}
