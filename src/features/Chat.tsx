// What an employee sees: a plain chat. Routing happens behind the scenes; there
// is no model choice and no tier, model or masking shown here.

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { PolicyCategory, User } from "../types";
import { classify } from "../lib/classifier";
import { maskTexts, unmask } from "../lib/pii";
import { mockReply } from "../lib/mockAi";
import { route } from "../lib/router";
import { DEMO_PROMPTS, PEOPLE } from "../store/seed";
import { actions, getState, useStore } from "../store/store";

export function Chat({ user, adminView }: { user: User; adminView: boolean }) {
  const s = useStore();
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const items = s.chat.filter((c) => c.userId === user.id);

  // Block body on purpose: newer browsers return a Promise from scrollIntoView,
  // and an effect must not return anything but a cleanup function.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [items.length, items.at(-1)?.reply]);

  const send = () => {
    const input = text.trim();
    if (!input) return;
    const classification = classify(input, PEOPLE);
    const decision = route(classification, getState().policies[user.team]);
    const mask = decision.masked ? maskTexts([input], PEOPLE) : undefined;
    const sentText = mask ? mask.masked[0] : input;
    const id = crypto.randomUUID().slice(0, 8);
    const categories: PolicyCategory[] = [...(classification.personal.length ? ["personal" as const] : []), ...classification.detected];

    actions.ask(
      { id, userId: user.id, text: input, reply: null },
      {
        id, at: new Date().toISOString(), userId: user.id, team: user.team, categories, maskedItems: mask?.count ?? 0,
        routedTier: decision.tier, model: decision.model.label, reason: decision.reason,
        confidence: classification.confidence, lowConfidence: decision.lowConfidence,
      },
      { text: input, classification, decision, mask, sentText },
    );
    setText("");
    // The model answers what it received; masked values are put back for the employee.
    const raw = mockReply(sentText);
    setTimeout(() => actions.answer(id, mask ? unmask(raw, mask.restore) : raw), 700 + Math.random() * 500);
  };

  return (
    <div className={`flex flex-col gap-4 ${adminView ? "" : "mx-auto max-w-3xl"}`}>
      <ol className="min-h-[40vh] space-y-4" aria-live="polite">
        {items.map((c) => (
          <li key={c.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-3 py-2 text-sm whitespace-pre-wrap text-white">{c.text}</p>
            <div className="w-fit max-w-[90%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3 py-2 text-sm whitespace-pre-wrap shadow-xs">
              {c.reply ?? <span className="text-slate-400">Writing…</span>}
            </div>
          </li>
        ))}
        {!items.length && (
          <li className="py-16 text-center">
            <p className="text-lg font-medium text-slate-800">How can I help, {user.name.split(" ")[0]}?</p>
            <p className="mt-1 text-sm text-slate-500">Just ask. Your workspace takes care of the rest.</p>
          </li>
        )}
        <div ref={bottom} />
      </ol>

      <div className="sticky bottom-0 space-y-2 bg-slate-50 pt-2 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Sample requests:</span>
          {DEMO_PROMPTS.map((p) => (
            <button key={p.id} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-slate-500" onClick={() => setText(p.text)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <label htmlFor="msg" className="sr-only">Message</label>
          <textarea
            id="msg"
            rows={2}
            className="input flex-1 resize-none"
            placeholder="Ask anything…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button className="btn btn-primary h-10" disabled={!text.trim()} onClick={send} aria-label="Send">
            <Send className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
