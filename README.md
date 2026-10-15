# AI Workspace — Content-Based Routing (concept prototype)

A clickable, single-screen prototype for a privacy-first enterprise AI workspace used by regulated organisations. A small classifier checks each request before it is sent and routes it to the right data-protection tier.

## The problem

Employees choose between three tiers, shown as a coloured border around the chat input:

| Tier | Model | Data protection |
|---|---|---|
| GREEN | Open-weight models on the vendor's own EU infrastructure | Data never leaves |
| ORANGE | External frontier models (Claude, GPT, Gemini) | Personal data masked before sending |
| RED | External frontier models | No masking; admin-approved only |

Today, protection depends on every employee picking the right tier, and non-technical users pick the most capable model.

**Why masking alone isn't enough:** masking finds personal data such as names, emails and IBANs. It cannot see that a request contains contract terms, merger plans, salaries, source code with a secret, or an incident report. Content like that must stay on GREEN even when it has no personal data in it, and masking would send it straight to an external model.

## The feature

A classifier running on the vendor's infrastructure checks each request first:

- **Confidential content** → GREEN.
- **Personal data only** → ORANGE, masked.
- **Nothing sensitive** → the most capable model.
- **Unsure** (confidence below the admin threshold) → GREEN: "Unsure, so playing safe."

Routing is fully automatic. Employees see a plain chat: no model selector, no tiers, no model names. They type, the workspace picks a safe destination, and personal data is masked before it leaves and restored in the reply. Admins see every decision with a one-line reason in the **Routing log**. For the demo, **Show admin view** (on by default) shows the same information next to the chat; untick it to see exactly what an employee sees.

## Run it

Needs [git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org) 22 or newer. No backend, accounts or API keys.

```bash
git clone https://github.com/Chattyflow/content-based-routing-prototype.git
cd content-based-routing-prototype
npm install
npm run dev
```

Open http://localhost:5173. All data is fictional.

**Optional real AI.** To let a language model check each request next to the rules, and to get real chat answers instead of the canned demo replies, copy `.env.example` to `.env` and add an [OpenRouter](https://openrouter.ai) key, then restart `npm run dev`. The key stays in `.env` on your machine (gitignored) and is used only by the local dev server, never in the browser. Without a key, everything works on the rules and canned replies. Use test data only: messages go to the model. Free models (`:free`) share rate limits with everyone, so the app uses 11 of them (`server/api.ts`): each request starts with a random model from a pool of 7 fast, capable ones, which spreads the load, and 4 backups (slower or smaller models, then OpenRouter's own free router `openrouter/free`) step in when the pool is busy. Your own comma-separated `LLM_MODEL` replaces the list. A model that is busy is tried last for the next minute; if all are busy, the admin view says so and the canned reply stands in. **Reset demo** (top right of the tabs) puts the rules and the routing log back to the start.

```bash
npm test          # every demo prompt routes as expected, admin rules, masking
npm run build     # type check + production build
```

## Pricing and the API

The **Pricing** tab sells the same engine as an API for other products: plan cards (Developer, Team, Business, Enterprise) with monthly or yearly billing, all marked *Coming soon*, a curl example, a disabled **Login to generate key** button, and a live **Try it** box that runs the rules plus the AI check. Plans and prices live in `src/features/plans.ts`.

The API works today, without a key (rules engine only):

```bash
curl -X POST http://localhost:5173/api/v1/check \
  -H "Content-Type: application/json" \
  -d '{"text": "Please call Petra Lindqvist on +49 40 5550 1234"}'
```

It returns the tier (`green`, `orange` or `red`), a one-line reason, detected categories and personal data, and `masked_text` to send to an external model. An optional `policy` is `standard`, `strict` or `lenient`. With `"ai": true`, a language model on OpenRouter checks the text as well (it can only add findings, never remove them) and the answer includes `ai_check`; without `LLM_API_KEY` it reports the AI check as off and answers from the rules.

## Host it on Netlify

Live: https://content-based-routing.netlify.app

`netlify.toml` builds the site and deploys `netlify/functions/api.ts`, which serves the same `/api/*` endpoints as the local dev server (`server/api.ts`).

1. Create a Netlify site from this repository (build settings come from `netlify.toml`).
2. In **Site configuration → Environment variables**, add `LLM_API_KEY` (your OpenRouter key) and optionally `LLM_MODEL`, then redeploy. Without them the site works on the rules and canned replies.
3. The API is rate-limited to 30 requests per minute per visitor, so a public link cannot use up the key's quota as quickly. Use test data only.

Netlify's AI Gateway injects its own `OPENROUTER_API_KEY` into every site. The app ignores it on purpose: gateway calls are paid in Netlify credits, which on the Free plan also cover bandwidth and builds.

## Existing vs new

| Existing | New in this prototype |
|---|---|
| Three tiers and the coloured border around the input | **No choice for employees**: every request is routed automatically; the chat shows no tier, model or masking |
| Manual model selector | Removed for employees; the classifier picks the tier per request |
| Personal-data masking with preview | **Confidential-content detection**: contracts, salaries and figures, M&A and strategy, code and secrets, incidents, health and patient data, documents marked confidential (English and German). Masking now also covers bank account numbers without a valid IBAN checksum |
| Admin approval for RED | **Admin rules per team**: an action per category, a confidence threshold, the RED switch, presets |
| Audit of AI requests | **Routing log and dashboard**: detected categories (never content), tier, model and reason per request; details for the current session show the rules that fired and what the external model received |

## 3-minute demo script

1. **Employee view.** Untick **Show admin view**. As Lena (HR), click the *Supplier contract* sample and send it. A normal answer comes back. There is no model to pick and nothing about tiers.
2. **Show admin view** (tick it again, top right of the tabs). The same request stayed on **GREEN**: *"Kept on EU servers: this looks like a confidential contract or legal matter."* The details list the penalty clause, NDA and "confidential" rules that fired.
3. **Slogan.** Send *Campaign slogan*: *"Nothing sensitive found: using the most capable model."*
4. **Customer email.** Send *Customer email*: **ORANGE**, *"Sent to Claude with 1 name and 1 phone number masked."* The admin view shows exactly what Claude received. The employee's answer contains the real name again.
5. **Bank details.** Type *Here is my IBAN: 97283638882900186538*: the number is masked as `[ACCOUNT_1]` before it leaves, and the employee gets a normal reply.
6. **Patient.** Type *I have a patient named Mr. Ahmed Fakh*: health data is a special category under GDPR, so it stays on **GREEN**. Without the word "patient", the name alone is still found from the title and masked.
7. **Ambiguous note.** Send *Ambiguous internal note*: weak signals only, confidence 32%, below the 70% threshold, so **GREEN**: *"Unsure, so playing safe."*
8. **Admin rules.** Open **Admin rules** → **HR** → **Strict** (personal data stays on GREEN, threshold 85%). Back in Chat, the customer email now stays on GREEN.
9. **Routing log.** Every request with its detected categories, tier, model and reason, plus the dashboard: share per tier, sensitive requests kept on EU infrastructure, requests masked, and "unsure, so played safe".

## How the classifier works

Simple, deterministic and explainable, so every decision can be traced:

- **Personal data:** regular expressions for emails, phone numbers, IBANs (with checksum), other bank account numbers (labelled, or 12 to 24 digits in a row), dates of birth and tax IDs. Names are found from context: after a title (Mr., Mrs., Dr., Herr, Frau), after cue words ("my name is", "named", "patient", "customer"), or a common first name followed by a surname. The demo's fictional people are always recognised, and every mention of the same person gets the same placeholder.
- **Confidential content:** weighted keyword and pattern rules per category, in English and German: for example code blocks (+0.4), strings that look like API keys (+0.8), "Vertragsstrafe" (+0.7), "NDA" (+0.6), "Gehalt"/"salary" (+0.6), "merger" (+0.7), "Kündigung" (+0.5). A category's score is the sum of its rules, and it counts as detected from 0.5.
- **Confidence:** high when a category is clearly detected, or when nothing fires at all. Weak signals that don't add up to a detection give low confidence, and that is when the router plays safe.
- **AI check (optional):** a model gets the message and returns the personal data and categories it sees, as JSON. It can only add protection: values it reports are masked only if they really occur in the text, a category counts if its confidence is 0.5 or more, and nothing the rules found is ever removed. If the two disagree, the lower confidence wins, so the router plays safe. If the check is off, slow or rate-limited, the rules decide alone and the admin view says so. In production, this would be a small model on the vendor's EU servers; here it runs through OpenRouter.
- **Answers (optional):** the conversation goes to the model the router chose (here a model on OpenRouter stands in for it). For ORANGE, the new message and earlier turns are masked together, so a person keeps the same placeholder for the whole chat; the reply is unmasked only on the employee's screen. A turn that was kept on GREEN is never sent to an external model later as context.
- **Routing:** the strictest admin action among everything detected wins (keep on GREEN, mask for ORANGE, allow any model).

Code: `src/lib/classifier.ts`, `src/lib/aiCheck.ts`, `src/lib/router.ts`, `src/lib/conversation.ts` and `server/api.ts`, tested in `src/lib/routing.test.ts`, `src/lib/aiCheck.test.ts` `src/lib/conversation.test.ts` and `server/api.test.ts`.

## Success metrics

- Share of confidential requests kept on GREEN.
- Share of "unsure, so played safe" decisions (too high means the rules are too cautious).
- Misrouting found in reviews of the routing log.
- User satisfaction with answer quality.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Misclassification | Default to GREEN when unsure; admins tune actions and thresholds per team from the routing log |
| Over-caution lowers answer quality | Per-team thresholds and presets such as Lenient for Marketing, set by admins, not by each employee |
| Added latency | The classifier is small and runs on the vendor's own infrastructure (about 40 ms) |

## Next steps

Replace keyword scoring with a small classifier model hosted on EU infrastructure, trained on reviewed routing decisions, while keeping the explanation of each decision.
