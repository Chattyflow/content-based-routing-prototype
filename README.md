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

## What's in the app

- **Chat**: the employee's AI chat. No model choice; every request is routed automatically.
- **Show admin view** (on by default): next to the chat, how each request was routed and why.
- **Messages**: chat and voice/video calls with colleagues and external contacts.
- **Admin rules**: per team, what happens to each kind of content, with presets.
- **Routing log**: every request's detected categories, tier and reason (never the content), with a dashboard and a **Visitors** card.
- **Pricing**: the same engine as an API for other products, with plans (all *Coming soon*) and a live **Try it** box.

## Run it locally

Needs [git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org) 22 or newer. Works without any account or API key.

```bash
git clone https://github.com/Chattyflow/content-based-routing-prototype.git
cd content-based-routing-prototype
npm install
npm run dev
```

Open http://localhost:5173. All people, companies and data are fictional. **Reset demo** (top right of the tabs) puts the rules, the chat and the routing log back to the start.

Without a key, routing and masking run on the built-in rules, the chat and Messages use canned replies, and the admin view says "AI check: Off".

### Optional: real AI with an OpenRouter key

This turns on the AI check next to the rules, real answers in the chat, and realistic replies in Messages.

1. Create a key at https://openrouter.ai/keys.
2. Copy the example settings file:
   - macOS / Linux: `cp .env.example .env`
   - Windows (PowerShell): `Copy-Item .env.example .env`
3. Open `.env` and put your key after `LLM_API_KEY=`.
4. Stop `npm run dev` (Ctrl+C) and start it again.

The key stays in `.env` on your machine (gitignored) and is used only by the local server, never in the browser. Use test data only: messages go to the model.

The app uses free OpenRouter models (`server/api.ts`): each request starts with a random model from a pool of 7, which spreads the load, and 4 backups (slower or smaller models, then OpenRouter's free router `openrouter/free`) step in when the pool is busy. A busy model is tried last for the next minute. To use your own models, set a comma-separated `LLM_MODEL` in `.env`.

Free models have limits: they are shared with everyone, and OpenRouter caps free-model requests per account per day (all free models together, so switching models does not help). Each chat message uses up to two requests (the AI check is skipped when the rules already keep a request on EU servers), each Messages reply one.

**Backup providers.** When OpenRouter's daily allowance is used up, the next provider that has a key answers right away, in the same request, and OpenRouter is used again as soon as its limit resets (the app reads the reset time from OpenRouter's answer, or checks again after two minutes). The backups, in order: Groq (`GROQ_API_KEY`), Cerebras (`CEREBRAS_API_KEY`), Google AI Studio (`GOOGLE_AI_STUDIO_KEY`), Mistral (`MISTRAL_API_KEY`), or any other OpenAI-compatible provider (`BACKUP_BASE_URL`, `BACKUP_API_KEY`, `BACKUP_MODEL`). Each has its own free tier and limits; see `.env.example` and the provider's site. Only when every provider is out do the rules and canned replies take over, and the admin view says why. The key names avoid the ones Netlify's AI Gateway injects, so no Netlify credits are spent.

### Tests and build

```bash
npm test          # routing of every demo prompt, masking, admin rules, AI merge, API, model fallback (no network)
npm run build     # type check + production build
```

## Visitors

The **Visitors** card (Routing log tab) shows visits and unique visitors for the last 30 days, a 14-day chart of both, and the top countries. It uses no cookies, and network addresses are never stored. A visit is one browser session. Unique visitors are recognised within a day by a one-way code made from the network address and browser plus a random value that is deleted at the end of the day, so visitors cannot be traced back or followed across days; unique visitors over several days are the daily figures added up. Known bots and scripts are left out, and **Don't count my visits on this browser** leaves out your own. Hosted, the records live in Netlify Blobs (`server/visits.ts`, `netlify/functions/api.ts`); locally they are kept in memory until the dev server stops.

## Messages and calls

Next to the AI chat, **Messages** is a window for talking to people: colleagues in the organisation and contacts outside it (a supplier, outside counsel, a customer), with presence, unread counts, typing indicators, and voice or video calls.

- In a real product, messages go to the person. In this prototype, the other person is played by a model on OpenRouter (`/api/dm`), with a short background for each contact (Erik handles deliveries at the meter supplier, Tobias reviews contracts in Legal, and so on), so the conversation makes sense. Personal data in the conversation is masked before it goes to the model and put back in the reply. Without a key, canned replies stand in. The thread says so: *"Prototype: Erik's replies are written by an AI model."*
- Before something that looks confidential (a contract, salaries, a security incident and so on) goes to an **external** contact, the sender gets a second look: *"This looks like salary or financial information. Erik Sandberg is outside Nordwerk Energie GmbH."* with **Edit message** or **Send anyway**.
- Prototype limits: there is no messaging or calling server, so the other side of a call is simulated (and says so). A video call shows your own camera if the browser allows it. Real calls would need a signalling server, for example WebRTC with a hosted service.

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
2. In **Site configuration → Environment variables**, add `LLM_API_KEY` (your OpenRouter key), and optionally backup provider keys such as `GROQ_API_KEY`, then redeploy. Without them the site works on the rules and canned replies.
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
9. **Messages.** Open *Erik Sandberg* (an external supplier) and type a salary overview: before it leaves, *"This looks like salary or financial information. Erik Sandberg is outside Nordwerk Energie GmbH."* Then send a normal message and get a reply in character; try a video call.
10. **Routing log.** Every request with its detected categories, tier, model and reason, plus the dashboard: share per tier, sensitive requests kept on EU infrastructure, requests masked, and "unsure, so played safe".

## How the classifier works

Simple, deterministic and explainable, so every decision can be traced:

- **Personal data:** regular expressions for emails, phone numbers, IBANs (with checksum), other bank account numbers (labelled, or 12 to 24 digits in a row), dates of birth and tax IDs. Names are found from context: after a title (Mr., Mrs., Dr., Herr, Frau), after cue words ("my name is", "named", "patient", "customer"), or a common first name followed by a surname. The demo's fictional people are always recognised, and every mention of the same person gets the same placeholder.
- **Confidential content:** weighted keyword and pattern rules per category, in English and German: for example code blocks (+0.4), strings that look like API keys (+0.8), "Vertragsstrafe" (+0.7), "NDA" (+0.6), "Gehalt"/"salary" (+0.6), "merger" (+0.7), "Kündigung" (+0.5). A category's score is the sum of its rules, and it counts as detected from 0.5.
- **Confidence:** high when a category is clearly detected, or when nothing fires at all. Weak signals that don't add up to a detection give low confidence, and that is when the router plays safe.
- **AI check (optional):** a model gets the message and returns the personal data and categories it sees, as JSON. It can only add protection: values it reports are masked only if they really occur in the text, a category counts if its confidence is 0.5 or more, and nothing the rules found is ever removed. If the two disagree, the lower confidence wins, so the router plays safe. If the check is off, slow or rate-limited, the rules decide alone and the admin view says so. In production, this would be a small model on the vendor's EU servers; here it runs through OpenRouter.
- **Answers (optional):** the conversation goes to the model the router chose (here a model on OpenRouter stands in for it). For ORANGE, the new message and earlier turns are masked together, so a person keeps the same placeholder for the whole chat; the reply is unmasked only on the employee's screen. A turn that was kept on GREEN is never sent to an external model later as context.
- **Routing:** the strictest admin action among everything detected wins (keep on GREEN, mask for ORANGE, allow any model).

Code: `src/lib/classifier.ts`, `src/lib/aiCheck.ts`, `src/lib/router.ts`, `src/lib/conversation.ts` and `server/api.ts`, tested in `src/lib/routing.test.ts`, `src/lib/aiCheck.test.ts`, `src/lib/conversation.test.ts` and `server/api.test.ts`.

## Project structure

```text
src/app/            App shell, tabs and shared UI
src/features/       Chat, admin view, admin rules, routing log, pricing
src/features/messenger/  Messages and calls (contacts, personas, call window)
src/lib/            Classifier, personal-data masking, router, AI check, conversation building
src/store/          Fictional organisation, demo prompts, team policies, app state
server/api.ts       The server side: /api/v1/check, /api/classify, /api/chat, /api/dm, /api/status, /api/visit(s)
server/providers.ts AI providers (OpenRouter, then backups), model fallback, daily-limit pauses
server/visits.ts    Visitor counter
server/aiPlugin.ts  Serves server/api.ts from the local dev server
netlify/functions/  Serves server/api.ts on Netlify
```

## Troubleshooting

- **"AI check: Off" in the admin view**: no key in `.env`, or the dev server was not restarted after adding it.
- **"OpenRouter rejected the API key"**: the key in `.env` is wrong or was deleted; create a new one.
- **"Daily free-model limit reached"**: OpenRouter's free allowance is used up for the day. Add a backup provider key (see above), wait for OpenRouter's reset, or see OpenRouter's message for options.
- **Video call says "Camera not available"**: the browser blocked the camera; allow it for the site.
- **Port 5173 in use**: Vite picks the next free port and prints the address.

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
