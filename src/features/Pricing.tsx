// Pricing for the routing API: plans with monthly or yearly billing (all coming
// soon) and a live "Try the API" box.

import { useState } from "react";
import { Check, Code2, KeyRound, ShieldCheck } from "lucide-react";
import { DEMO_PROMPTS } from "../store/seed";
import { PLANS, euro, type Billing, type Plan } from "./plans";

const LAW = [
  { title: "Data minimisation", ref: "Art. 5 GDPR", text: "Personal data is masked before a request leaves, and put back only for the user." },
  { title: "Special categories", ref: "Art. 9 GDPR", text: "Health data and similar content is recognised and kept on EU infrastructure." },
  { title: "Privacy by design", ref: "Art. 25 GDPR", text: "Every request is checked automatically. Nobody has to remember to pick the safe option." },
  { title: "Processors", ref: "Art. 28 GDPR", text: "A data processing agreement on Business and Enterprise; processing in the EU only." },
  { title: "Accountability", ref: "Art. 5(2), 30 GDPR", text: "A routing log of what was detected and where it went, never the content itself." },
];

export function Pricing() {
  const [billing, setBilling] = useState<Billing>("yearly");

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <div className="space-y-3 text-center">
        <h1 className="text-2xl font-semibold">Privacy-first routing for your own AI features</h1>
        <p className="mx-auto max-w-2xl text-sm text-slate-600">
          One API call before each request to a language model: it finds personal and confidential data, masks it, and tells you where the request may go under GDPR and European privacy rules.
        </p>
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm" role="radiogroup" aria-label="Billing period">
          {(["monthly", "yearly"] as Billing[]).map((b) => (
            <button key={b} role="radio" aria-checked={billing === b} onClick={() => setBilling(b)}
              className={`rounded-md px-3 py-1 font-medium ${billing === b ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"}`}>
              {b === "monthly" ? "Monthly" : "Yearly"}
              {b === "yearly" && <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${billing === b ? "bg-emerald-400 text-emerald-950" : "bg-emerald-100 text-emerald-800"}`}>2 months free</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((p) => (
          <section key={p.id} className={`card relative flex flex-col p-5 ${p.popular ? "border-slate-900 ring-1 ring-slate-900" : ""}`} aria-label={`${p.name} plan`}>
            {p.popular && <span className="absolute -top-2.5 left-5 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-white">Most popular</span>}
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{p.name}</h2>
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">Coming soon</span>
            </div>
            <p className="text-sm text-slate-500">{p.tagline}</p>
            <Price plan={p} billing={billing} />
            <p className="text-sm font-medium">{p.checks}</p>
            {p.overage && <p className="text-xs text-slate-500">{p.overage}</p>}
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />{f}</li>
              ))}
            </ul>
            <button className={`btn mt-5 w-full ${p.popular ? "btn-primary" : ""}`} disabled>Coming soon</button>
          </section>
        ))}
      </div>
      <p className="-mt-6 text-center text-xs text-slate-500">Prices excl. VAT. A check is one API call for one text of up to 8,000 characters.</p>

      <TryApi />

      <section className="space-y-3" aria-labelledby="law">
        <h2 id="law" className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="size-5 text-emerald-700" aria-hidden /> Built for European privacy law</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {LAW.map((l) => (
            <div key={l.title} className="card p-3">
              <div className="text-sm font-medium">{l.title}</div>
              <div className="text-xs text-slate-500">{l.ref}</div>
              <p className="mt-1 text-sm text-slate-700">{l.text}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500">The API helps you meet these obligations; it does not replace your own legal assessment.</p>
      </section>

      <p className="pb-4 text-center text-xs text-slate-500">Concept prototype: plans are coming soon and prices are examples.</p>
    </div>
  );
}

function Price({ plan, billing }: { plan: Plan; billing: Billing }) {
  if (plan.monthly === null || plan.yearly === null) {
    return <div className="my-4"><span className="text-3xl font-semibold">Custom</span><div className="text-xs text-slate-500">Yearly contract</div></div>;
  }
  const perMonth = billing === "monthly" ? plan.monthly : Math.round((plan.yearly / 12) * 100) / 100;
  return (
    <div className="my-4">
      <span className="text-3xl font-semibold">{euro(perMonth)}</span>
      <span className="text-sm text-slate-500"> / month</span>
      <div className="text-xs text-slate-500">
        {plan.monthly === 0 ? "Free forever" : billing === "yearly" ? `Billed ${euro(plan.yearly)} yearly` : "Billed monthly, cancel any time"}
      </div>
    </div>
  );
}

function TryApi() {
  const [text, setText] = useState(DEMO_PROMPTS.find((p) => p.id === "customer")!.text);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const endpoint = `${location.origin}/api/v1/check`;
  const curl = `curl -X POST ${endpoint} \\\n  -H "Content-Type: application/json" \\\n  -d '{"text": "Please call Petra Lindqvist on +49 40 5550 1234"}'`;

  const run = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, ai: true }) });
      if (r.status === 429) setResult("Too many requests from your network. Please wait a minute and try again.");
      else setResult(JSON.stringify(await r.json(), null, 2));
    } catch {
      setResult("The API is not reachable from this page.");
    }
    setBusy(false);
  };

  return (
    <section className="card grid gap-5 p-5 lg:grid-cols-2" aria-labelledby="try">
      <div className="min-w-0 space-y-3">
        <h2 id="try" className="flex items-center gap-2 text-lg font-semibold"><Code2 className="size-5" aria-hidden /> One call before every model request</h2>
        <p className="text-sm text-slate-600">Send the text. You get back where it may go, why, and a masked version that is safe to send to an external model.</p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100"><code>{curl}</code></pre>
        <button className="btn btn-primary" disabled title="Coming soon">
          <KeyRound className="size-4" aria-hidden /> Login to generate key
        </button>
      </div>
      <div className="min-w-0 space-y-2">
        <label htmlFor="api-text" className="text-sm font-medium">Try it</label>
        <textarea id="api-text" rows={4} className="input resize-y" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" onClick={run} disabled={busy || !text.trim()}>{busy ? "Checking…" : "Send to the API"}</button>
        {result && <pre className="max-h-80 overflow-auto rounded-lg bg-slate-50 p-3 text-xs" aria-live="polite"><code>{result}</code></pre>}
      </div>
    </section>
  );
}
