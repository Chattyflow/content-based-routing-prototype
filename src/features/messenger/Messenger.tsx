// Person-to-person messages and calls, with colleagues and with people outside
// the organisation. Nothing here goes to an AI model. Sending something that
// looks confidential to an external contact asks for a second look first.

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Building2, MessageSquare, Phone, Search, Send, ShieldAlert, Video } from "lucide-react";
import type { User } from "../../types";
import { CATEGORY_INFO, classify } from "../../lib/classifier";
import { PEOPLE } from "../../store/seed";
import { Call } from "./Call";
import { CONTACTS, ORG, SEED_UNREAD, isExternal, seedThreads, type Contact, type Message } from "./data";

interface Conversations {
  threads: Record<string, Message[]>;
  unread: Record<string, number>;
  replyIndex: Record<string, number>;
}

const PRESENCE_DOT = { online: "bg-emerald-500", away: "bg-amber-400", offline: "bg-slate-300" } as const;
const PRESENCE_LABEL = { online: "Online", away: "Away", offline: "Offline" } as const;
const clock = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const newId = () => crypto.randomUUID().slice(0, 8);

export function Messenger({ user }: { user: User }) {
  // Conversations per signed-in demo user, in memory only (like the AI chat).
  const [byUser, setByUser] = useState<Record<string, Conversations>>({});
  const conv = byUser[user.id] ?? { threads: seedThreads(), unread: { ...SEED_UNREAD }, replyIndex: {} };
  const update = (f: (c: Conversations) => Conversations) =>
    setByUser((all) => ({ ...all, [user.id]: f(all[user.id] ?? { threads: seedThreads(), unread: { ...SEED_UNREAD }, replyIndex: {} }) }));

  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typing, setTyping] = useState<string | null>(null);
  const [call, setCall] = useState<{ contact: Contact; video: boolean } | null>(null);

  const contacts = CONTACTS.filter((c) => c.id !== user.id);
  const open = contacts.find((c) => c.id === openId) ?? null;

  // Replies arrive later; they need to know which conversation is open then.
  const openIdRef = useRef(openId);
  useEffect(() => {
    openIdRef.current = openId;
  }, [openId]);

  // Back to the list when the demo user changes.
  useEffect(() => {
    setOpenId(null);
  }, [user.id]);

  const send = (contact: Contact, text: string) => {
    const mine: Message = { id: newId(), from: "me", text, at: Date.now() };
    update((c) => ({ ...c, threads: { ...c.threads, [contact.id]: [...(c.threads[contact.id] ?? []), mine] } }));
    if (contact.presence === "offline") return; // they'll read it later
    const delay = contact.presence === "away" ? 6000 : 1800;
    setTimeout(() => setTyping(contact.id), delay / 3);
    setTimeout(() => {
      setTyping((t) => (t === contact.id ? null : t));
      update((c) => {
        const i = c.replyIndex[contact.id] ?? 0;
        const reply: Message = { id: newId(), from: contact.id, text: contact.replies[i % contact.replies.length], at: Date.now() };
        return {
          ...c,
          threads: { ...c.threads, [contact.id]: [...(c.threads[contact.id] ?? []), reply] },
          replyIndex: { ...c.replyIndex, [contact.id]: i + 1 },
          unread: { ...c.unread, [contact.id]: openIdRef.current === contact.id ? 0 : (c.unread[contact.id] ?? 0) + 1 },
        };
      });
    }, delay);
  };

  const openThread = (id: string) => {
    setOpenId(id);
    update((c) => ({ ...c, unread: { ...c.unread, [id]: 0 } }));
  };

  const endCall = (summary: string) => {
    if (call) update((c) => ({ ...c, threads: { ...c.threads, [call.contact.id]: [...(c.threads[call.contact.id] ?? []), { id: newId(), from: "system", text: summary, at: Date.now() }] } }));
    setCall(null);
  };

  return (
    <section className="card flex h-[34rem] flex-col overflow-hidden" aria-label="Messages and calls">
      {open ? (
        <Thread
          contact={open}
          messages={conv.threads[open.id] ?? []}
          typing={typing === open.id}
          onBack={() => setOpenId(null)}
          onSend={(text) => send(open, text)}
          onCall={(video) => setCall({ contact: open, video })}
        />
      ) : (
        <ContactList contacts={contacts} conv={conv} query={query} setQuery={setQuery} onOpen={openThread} />
      )}
      {call && <Call contact={call.contact} video={call.video} onEnd={endCall} />}
    </section>
  );
}

function ContactList({ contacts, conv, query, setQuery, onOpen }: {
  contacts: Contact[]; conv: Conversations; query: string; setQuery: (q: string) => void; onOpen: (id: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const shown = contacts.filter((c) => !q || `${c.name} ${c.role} ${c.org ?? ""}`.toLowerCase().includes(q));
  const last = (id: string) => conv.threads[id]?.at(-1);
  const byRecent = (a: Contact, b: Contact) => (last(b.id)?.at ?? 0) - (last(a.id)?.at ?? 0);
  const groups = [
    { title: ORG, items: shown.filter((c) => !isExternal(c)).sort(byRecent) },
    { title: "External", items: shown.filter(isExternal).sort(byRecent) },
  ];

  return (
    <>
      <div className="space-y-2 border-b border-slate-200 p-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><MessageSquare className="size-4" aria-hidden /> Messages</h2>
        <label className="relative block">
          <span className="sr-only">Search people</span>
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-slate-400" aria-hidden />
          <input className="input py-1.5 pl-8" placeholder="Search people" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        {groups.map((g) => g.items.length > 0 && (
          <div key={g.title}>
            <div className="sticky top-0 bg-slate-50 px-3 py-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{g.title}</div>
            <ul>
              {g.items.map((c) => {
                const m = last(c.id);
                const unread = conv.unread[c.id] ?? 0;
                return (
                  <li key={c.id}>
                    <button className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50" onClick={() => onOpen(c.id)}>
                      <PersonAvatar contact={c} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className={`truncate text-sm ${unread ? "font-semibold" : "font-medium"}`}>{c.name}</span>
                          {isExternal(c) && <Building2 className="size-3.5 shrink-0 text-slate-400" aria-label="External" />}
                        </span>
                        <span className={`block truncate text-xs ${unread ? "text-slate-800" : "text-slate-500"}`}>
                          {m ? `${m.from === "me" ? "You: " : ""}${m.text}` : isExternal(c) ? `${c.role} · ${c.org}` : c.role}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        {m && <span className="text-[10px] text-slate-400">{clock(m.at)}</span>}
                        {unread > 0 && <span className="rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white" aria-label={`${unread} unread`}>{unread}</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {!shown.length && <p className="p-4 text-sm text-slate-500">No one found.</p>}
      </div>
    </>
  );
}

function Thread({ contact, messages, typing, onBack, onSend, onCall }: {
  contact: Contact; messages: Message[]; typing: boolean; onBack: () => void; onSend: (text: string) => void; onCall: (video: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const external = isExternal(contact);

  // Block body on purpose: some browsers return a Promise from scrollIntoView.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, typing]);

  // A second look before confidential content leaves the organisation.
  const confidential = useMemo(() => {
    if (!external || !text.trim()) return null;
    const hit = classify(text, PEOPLE).detected[0];
    return hit ? CATEGORY_INFO[hit].reason : null;
  }, [external, text]);

  const submit = (force = false) => {
    const t = text.trim();
    if (!t) return;
    if (confidential && !force) {
      setWarning(confidential);
      return;
    }
    onSend(t);
    setText("");
    setWarning(null);
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b border-slate-200 px-2 py-2">
        <button className="rounded-md p-1.5 hover:bg-slate-100" onClick={onBack} aria-label="Back to messages"><ArrowLeft className="size-4" aria-hidden /></button>
        <PersonAvatar contact={contact} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{contact.name}</div>
          <div className="truncate text-xs text-slate-500">{PRESENCE_LABEL[contact.presence]} · {external ? contact.org : contact.role}</div>
        </div>
        <button className="rounded-md p-2 hover:bg-slate-100" onClick={() => onCall(false)} aria-label={`Call ${contact.name}`}><Phone className="size-4" aria-hidden /></button>
        <button className="rounded-md p-2 hover:bg-slate-100" onClick={() => onCall(true)} aria-label={`Video call ${contact.name}`}><Video className="size-4" aria-hidden /></button>
      </div>

      {external && (
        <div className="flex items-center gap-1.5 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          <Building2 className="size-3.5 shrink-0" aria-hidden /> External: {contact.org}. Messages leave {ORG}.
        </div>
      )}

      <ol className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-3" aria-live="polite">
        {messages.map((m) =>
          m.from === "system" ? (
            <li key={m.id} className="text-center text-[11px] text-slate-500">{m.text} · {clock(m.at)}</li>
          ) : (
            <li key={m.id} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap ${m.from === "me" ? "rounded-br-md bg-indigo-600 text-white" : "rounded-bl-md border border-slate-200 bg-white"}`}>
                {m.text}
                <div className={`mt-0.5 text-right text-[10px] ${m.from === "me" ? "text-indigo-200" : "text-slate-400"}`}>{clock(m.at)}</div>
              </div>
            </li>
          ),
        )}
        {!messages.length && <li className="py-8 text-center text-sm text-slate-500">Say hello to {contact.name.split(" ")[0]}.</li>}
        {typing && <li className="text-xs text-slate-500">{contact.name.split(" ")[0]} is typing…</li>}
        <div ref={bottom} />
      </ol>

      {warning && (
        <div className="space-y-2 border-t border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="alert">
          <p className="flex gap-1.5"><ShieldAlert className="size-4 shrink-0" aria-hidden /> This looks like {warning}. {contact.name} is outside {ORG}.</p>
          <div className="flex gap-2">
            <button className="btn py-1 text-xs" onClick={() => setWarning(null)}>Edit message</button>
            <button className="btn py-1 text-xs" onClick={() => submit(true)}>Send anyway</button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-slate-200 p-2">
        <label htmlFor="dm" className="sr-only">Message {contact.name}</label>
        <textarea id="dm" rows={1} className="input flex-1 resize-none py-1.5" placeholder={`Message ${contact.name.split(" ")[0]}`} value={text}
          onChange={(e) => { setText(e.target.value); setWarning(null); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
        <button className="btn btn-primary h-9" onClick={() => submit()} disabled={!text.trim()} aria-label="Send message"><Send className="size-4" aria-hidden /></button>
      </div>
    </>
  );
}

function PersonAvatar({ contact }: { contact: Contact }) {
  const initials = contact.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("");
  return (
    <span className="relative shrink-0">
      <span className={`inline-flex size-9 items-center justify-center rounded-full text-xs font-semibold text-white ${contact.avatarColor}`} aria-hidden>{initials}</span>
      <span className={`absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-white ${PRESENCE_DOT[contact.presence]}`} aria-label={PRESENCE_LABEL[contact.presence]} />
    </span>
  );
}
