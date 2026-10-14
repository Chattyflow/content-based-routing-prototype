import { useEffect, useMemo, useRef, useState } from "react";
import { Flag, Info, Send, Sparkles, TriangleAlert } from "lucide-react";
import type { AuditEntry, Mode, Policy, PolicyCategory, Tier, User } from "../types";
import { CATEGORY_INFO, classify, type Classification } from "../lib/classifier";
import { maskTexts, unmask, type MaskResult } from "../lib/pii";
import { mockReply } from "../lib/mockAi";
import { BEST_MASKED, MODELS, TIER_RANK, allowedTiers, describeMasking, manualWarning, modelById, route, type Decision, type Model } from "../lib/router";
import { DEMO_PROMPTS, PEOPLE } from "../store/seed";
import { actions } from "../store/store";
import { Confirm, TIER, TierPill } from "../app/ui";

interface Reply {
  model: Model;
  text: string; // as shown (placeholders restored on this device)
  restored: boolean;
  pending: boolean;
}

interface Exchange {
  id: string;
  text: string;
  mode: Mode;
  classification: Classification;
  decision: Decision; // what routing recommends
  chosen: Model; // what was actually used
  mask?: MaskResult;
  warning: string | null; // manual mode
  override: boolean;
  replies: Reply[];
  flag?: AuditEntry["flag"];
}

const AUTO = "auto";
const newId = () => crypto.randomUUID().slice(0, 8);

function categoriesOf(c: Classification): PolicyCategory[] {
  return [...(c.personal.length ? ["personal" as const] : []), ...c.detected];
}

export function Chat({ user, mode, policy }: { user: User; mode: Mode; policy: Policy }) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState(mode === "auto" ? AUTO : "claude");
  const [confirm, setConfirm] = useState<{ title: string; body: string; run: () => void } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setModelId(mode === "auto" ? AUTO : "claude");
  }, [mode]);
  // Block body on purpose: newer browsers return a Promise from scrollIntoView,
  // and an effect must not return anything but a cleanup function.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [exchanges.length, exchanges.at(-1)?.replies.length]);

  // Live preview for manual mode: what routing would have done with this text.
  const live = useMemo(() => (text.trim() ? route(classify(text, PEOPLE), policy) : null), [text, policy]);
  const picked = modelId === AUTO ? null : modelById(modelId);
  const liveWarning = mode === "manual" && live && picked ? manualWarning(live, picked) : null;
  const lastTier: Tier | null = exchanges.at(-1)?.chosen.tier ?? null;

  const answer = (exId: string, model: Model, sourceText: string) => {
    const mask = model.tier === "orange" ? maskTexts([sourceText], PEOPLE) : undefined;
    const sent = mask ? mask.masked[0] : sourceText;
    const raw = mockReply(sent);
    setExchanges((list) => list.map((e) => (e.id === exId ? { ...e, replies: [...e.replies, { model, text: "", restored: false, pending: true }] } : e)));
    setTimeout(() => {
      const shown = mask ? unmask(raw, mask.restore) : raw;
      setExchanges((list) => list.map((e) => (e.id === exId ? { ...e, replies: e.replies.map((r, i) => (i === e.replies.length - 1 ? { model, text: shown, restored: shown !== raw, pending: false } : r)) } : e)));
    }, 700 + Math.random() * 500);
    return mask;
  };

  const send = (input = text) => {
    if (!input.trim()) return;
    const classification = classify(input, PEOPLE);
    const decision = route(classification, policy);
    const chosen = mode === "auto" && modelId === AUTO ? decision.model : modelById(modelId);
    const lessSafe = TIER_RANK[chosen.tier] > TIER_RANK[decision.tier];

    const go = () => {
      const id = newId();
      const ex: Exchange = {
        id, text: input, mode, classification, decision, chosen,
        warning: mode === "manual" ? manualWarning(decision, chosen) : null,
        override: mode === "auto" && chosen.id !== decision.model.id, replies: [],
      };
      setExchanges((list) => [...list, ex]);
      const mask = answer(id, chosen, input);
      setExchanges((list) => list.map((e) => (e.id === id ? { ...e, mask } : e)));
      actions.log({
        id, at: new Date().toISOString(), userId: user.id, team: user.team, mode, categories: categoriesOf(classification),
        maskedItems: mask?.count ?? 0, recommendedTier: decision.tier, routedTier: chosen.tier, model: chosen.label,
        confidence: classification.confidence, lowConfidence: decision.lowConfidence,
        ...(ex.override ? { override: { from: decision.tier, to: chosen.tier, model: chosen.label } } : {}),
        ...(ex.warning ? { manualRisk: true } : {}),
      });
      setText("");
    };

    if (mode === "auto" && modelId !== AUTO && chosen.id !== decision.model.id) {
      if (!policy.overrideAllowed) {
        setConfirm({ title: "Overrides are turned off", body: `Your admin doesn't allow choosing a model yourself in the ${user.team.toUpperCase()} team. The request will use the routed model instead.`, run: () => { setModelId(AUTO); } });
        return;
      }
      if (lessSafe) {
        setConfirm({ title: `Send to ${chosen.label}?`, body: `Routing would keep this on ${TIER[decision.tier].label}: ${decision.reason} Your choice is less safe, and it will be logged.`, run: go });
        return;
      }
    }
    go();
  };

  const overrideTo = (ex: Exchange, model: Model) => {
    const run = () => {
      setExchanges((list) => list.map((e) => (e.id === ex.id ? { ...e, chosen: model, override: true } : e)));
      const mask = answer(ex.id, model, ex.text);
      if (mask) setExchanges((list) => list.map((e) => (e.id === ex.id ? { ...e, mask } : e)));
      actions.updateLog(ex.id, { override: { from: ex.decision.tier, to: model.tier, model: model.label }, routedTier: model.tier, model: model.label, maskedItems: mask?.count ?? 0 });
    };
    if (TIER_RANK[model.tier] > TIER_RANK[ex.decision.tier]) {
      setConfirm({ title: `Use ${model.label}?`, body: `This is less safe than the routed ${TIER[ex.decision.tier].label} tier. The override will be logged.`, run });
    } else run();
  };

  const flag = (ex: Exchange, kind: NonNullable<AuditEntry["flag"]>) => {
    setExchanges((list) => list.map((e) => (e.id === ex.id ? { ...e, flag: kind } : e)));
    actions.updateLog(ex.id, { flag: kind });
  };

  const options = MODELS.filter((m) => m.tier !== "red" || policy.redAllowed);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {mode === "manual" ? (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          <b>Manual mode (today):</b> you pick the model yourself, and with it the protection tier.
        </p>
      ) : (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <b>Auto mode (proposed):</b> each request is checked on EU infrastructure first, then sent to the right tier.
        </p>
      )}

      <ol className="space-y-6" aria-live="polite">
        {exchanges.map((ex) => (
          <li key={ex.id} className="space-y-2">
            <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-slate-900 px-3 py-2 text-sm whitespace-pre-wrap text-white">{ex.text}</p>
            <DecisionLine ex={ex} policy={policy} onOverride={(m) => overrideTo(ex, m)} onFlag={(k) => flag(ex, k)} />
            {ex.replies.map((r, i) => (
              <div key={i} className={`max-w-[95%] rounded-lg border-l-4 ${TIER[r.model.tier].border} bg-white px-3 py-2 shadow-xs`}>
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <TierPill tier={r.model.tier} short={false} />
                  <span className="font-semibold text-slate-700">{r.model.label}</span>
                  {i > 0 && <span>(after override)</span>}
                </div>
                {r.pending ? (
                  <p className="text-sm text-slate-500">Writing…</p>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap">{r.text}</p>
                    {r.restored && <p className="mt-1 text-[11px] text-slate-500">Names were put back on your device. The model only saw placeholders.</p>}
                  </>
                )}
              </div>
            ))}
          </li>
        ))}
        {!exchanges.length && <li className="py-8 text-center text-sm text-slate-500">Pick a sample below, or type your own request.</li>}
        <div ref={bottom} />
      </ol>

      <div className="sticky bottom-0 space-y-2 bg-slate-50 pt-2 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500">Try:</span>
          {DEMO_PROMPTS.map((p) => (
            <button key={p.id} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-slate-500" onClick={() => setText(p.text)}>
              {p.label}
            </button>
          ))}
        </div>
        <label htmlFor="msg" className="sr-only">Message</label>
        <textarea
          id="msg"
          rows={3}
          className={`input border-2 ${lastTier ? TIER[lastTier].border : "border-slate-300"} transition-colors`}
          placeholder="Ask anything…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        {liveWarning && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {liveWarning}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500" htmlFor="model">Model</label>
          <select id="model" className="input w-auto py-1.5" value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {mode === "auto" && <option value={AUTO}>Auto (recommended)</option>}
            {options.map((m) => <option key={m.id} value={m.id}>{m.label} ({TIER[m.tier].label})</option>)}
          </select>
          {lastTier && <span className="text-xs text-slate-500">Last request: <TierPill tier={lastTier} /></span>}
          <button className="btn btn-primary ml-auto" disabled={!text.trim()} onClick={() => send()}>
            <Send className="size-4" aria-hidden /> Send
          </button>
        </div>
      </div>

      <Confirm
        open={Boolean(confirm)}
        title={confirm?.title ?? ""}
        confirmLabel="Continue"
        onCancel={() => setConfirm(null)}
        onConfirm={() => { confirm?.run(); setConfirm(null); }}
      >
        {confirm?.body}
      </Confirm>
    </div>
  );
}

function DecisionLine({ ex, policy, onOverride, onFlag }: { ex: Exchange; policy: Policy; onOverride: (m: Model) => void; onFlag: (k: NonNullable<AuditEntry["flag"]>) => void }) {
  const [why, setWhy] = useState(false);
  const [menu, setMenu] = useState<"override" | "flag" | null>(null);
  const c = ex.classification;
  const auto = ex.mode === "auto";
  const reason = !auto
    ? `Manual mode: you picked ${ex.chosen.label}. No routing.`
    : ex.override
      ? `You chose ${ex.chosen.label}. Routing recommended ${TIER[ex.decision.tier].label}: ${ex.decision.reason}`
      : ex.decision.reason;

  return (
    <section className={`rounded-xl border bg-white p-3 ${ex.warning ? "border-amber-400" : "border-slate-200"}`} aria-label="Routing decision">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Sparkles className="size-4 text-slate-400" aria-hidden />
        <TierPill tier={ex.chosen.tier} />
        <span className="font-medium">{ex.chosen.label}</span>
        {auto && <span className="text-xs text-slate-500">· confidence {Math.round(c.confidence * 100)}%</span>}
      </div>
      <p className="mt-1 text-sm text-slate-700">{reason}</p>
      {ex.warning && (
        <p className="mt-1 flex items-start gap-1.5 text-sm text-amber-800"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {ex.warning}</p>
      )}

      {ex.mask && ex.mask.count > 0 && <MaskingPreview text={ex.text} mask={ex.mask} />}

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button className="link inline-flex items-center gap-1" onClick={() => setWhy((w) => !w)} aria-expanded={why}><Info className="size-3.5" aria-hidden /> Why?</button>
        {auto && <button className="link" disabled={!policy.overrideAllowed} title={policy.overrideAllowed ? "" : "Your admin has turned overrides off"} onClick={() => setMenu(menu === "override" ? null : "override")}>Use a different model</button>}
        {auto && !ex.flag && <button className="link inline-flex items-center gap-1" onClick={() => setMenu(menu === "flag" ? null : "flag")}><Flag className="size-3.5" aria-hidden /> Flag this decision</button>}
        {ex.flag && <span className="text-xs text-slate-500">Flagged: {ex.flag === "too_cautious" ? "too cautious" : "missed something sensitive"}. Thanks, your admin will see it.</span>}
      </div>

      {menu === "override" && (
        <div className="mt-2 flex flex-wrap gap-2">
          {MODELS.filter((m) => allowedTiers(policy).includes(m.tier) && m.id !== ex.chosen.id).map((m) => (
            <button key={m.id} className="btn py-1 text-xs" onClick={() => { setMenu(null); onOverride(m); }}>
              {m.label} <span className="text-slate-500">({TIER[m.tier].label})</span>
            </button>
          ))}
        </div>
      )}
      {menu === "flag" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button className="btn py-1 text-xs" onClick={() => { setMenu(null); onFlag("too_cautious"); }}>Too cautious</button>
          <button className="btn py-1 text-xs" onClick={() => { setMenu(null); onFlag("missed_sensitive"); }}>Missed something sensitive</button>
        </div>
      )}

      {why && <WhyPanel c={c} decision={ex.decision} threshold={policy.threshold} />}
    </section>
  );
}

function WhyPanel({ c, decision, threshold }: { c: Classification; decision: Decision; threshold: number }) {
  const hits = c.categories.filter((x) => x.fired.length);
  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 text-sm">
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
                <span className="text-xs text-slate-500"> · score {h.score.toFixed(2)}{h.detected ? " · detected" : " · below 0.50, not detected"}</span>
                <div className="text-xs text-slate-500">Rules: {h.fired.map((f) => `${f.rule.label} (“${f.match}”, +${f.rule.weight})`).join("; ")}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p>None found</p>
        )}
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-500">Confidence {Math.round(c.confidence * 100)}% · admin threshold {Math.round(threshold * 100)}%</div>
        <div className="relative mt-1 h-2 rounded-full bg-slate-100" aria-hidden>
          <div className={`h-2 rounded-full ${decision.lowConfidence ? "bg-amber-500" : "bg-slate-700"}`} style={{ width: `${c.confidence * 100}%` }} />
          <div className="absolute -top-1 h-4 w-0.5 bg-rose-500" style={{ left: `${threshold * 100}%` }} title="Admin threshold" />
        </div>
      </div>
      <p className="text-xs text-slate-500">Classification time: ~40 ms, on EU infrastructure (simulated; the classifier is deterministic rules).</p>
    </div>
  );
}

function MaskingPreview({ text, mask }: { text: string; mask: MaskResult }) {
  const matches = mask.matches.filter((m) => m.textIndex === 0);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  matches.forEach((m, i) => {
    parts.push(text.slice(pos, m.start));
    parts.push(<mark key={i} className="rounded bg-amber-200 px-0.5">{text.slice(m.start, m.end)}</mark>);
    pos = m.end;
  });
  parts.push(text.slice(pos));
  return (
    <div className="mt-2 grid gap-2 rounded-lg bg-amber-50 p-2 text-xs sm:grid-cols-2">
      <div>
        <div className="mb-0.5 font-semibold text-amber-900">What you wrote</div>
        <p className="whitespace-pre-wrap text-slate-800">{parts}</p>
      </div>
      <div>
        <div className="mb-0.5 font-semibold text-amber-900">What {BEST_MASKED.label.split(" ·")[0]} receives ({mask.count} masked)</div>
        <p className="font-mono whitespace-pre-wrap text-slate-800">{mask.masked[0]}</p>
      </div>
    </div>
  );
}
