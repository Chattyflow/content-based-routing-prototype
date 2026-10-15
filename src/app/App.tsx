import { useState } from "react";
import { RotateCcw, Route } from "lucide-react";
import { AdminPanel } from "../features/AdminPanel";
import { Admin } from "../features/Admin";
import { Chat } from "../features/Chat";
import { Messenger } from "../features/messenger/Messenger";
import { Pricing } from "../features/Pricing";
import { RoutingLog } from "../features/RoutingLog";
import { TEAMS, USERS } from "../store/seed";
import { actions, useStore } from "../store/store";
import { Avatar } from "./ui";

type Tab = "chat" | "admin" | "log" | "pricing";
const TABS: { id: Tab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "admin", label: "Admin rules" },
  { id: "log", label: "Routing log" },
  { id: "pricing", label: "Pricing" },
];

export function App() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>("chat");
  const [adminView, setAdminView] = useState(true);
  const user = USERS.find((u) => u.id === s.userId) ?? USERS[0];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-slate-800 text-white" aria-hidden><Route className="size-4" /></span>
            <span className="text-sm font-semibold">AI Workspace <span className="font-normal text-slate-500">— Content-Based Routing (concept)</span></span>
          </div>
          <span className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">Concept prototype</span>

          <label className="ml-auto flex items-center gap-2 text-xs text-slate-600">
            <Avatar name={user.name} color={user.avatarColor} />
            <select className="input w-auto py-1 text-xs" value={user.id} onChange={(e) => actions.setUser(e.target.value)} aria-label="Current user">
              {USERS.map((u) => <option key={u.id} value={u.id}>{u.name} · {TEAMS[u.team]}</option>)}
            </select>
          </label>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t.id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-4 py-2">
            {tab === "chat" && (
              <label className="flex items-center gap-2 text-xs text-slate-600" title="For the demo: show what happens behind the scenes. Employees never see this.">
                <input type="checkbox" checked={adminView} onChange={(e) => setAdminView(e.target.checked)} /> Show admin view
              </label>
            )}
            <button className="link inline-flex items-center gap-1 text-xs" onClick={() => { if (confirm("Reset rules, the chat and the routing log to the demo start?")) actions.reset(); }}>
              <RotateCcw className="size-3.5" aria-hidden /> Reset demo
            </button>
          </div>
        </nav>
      </header>

      <main className="px-4 py-6">
        {tab === "chat" && (
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_380px]">
            <Chat user={user} />
            <div className="min-w-0 space-y-4">
              {adminView && <AdminPanel user={user} />}
              <Messenger user={user} />
            </div>
          </div>
        )}
        {tab === "admin" && <Admin policies={s.policies} />}
        {tab === "log" && <RoutingLog />}
        {tab === "pricing" && <Pricing />}
      </main>
    </div>
  );
}
