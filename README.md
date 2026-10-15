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

Routing is fully automatic. Employees see a plain chat: no model selector, no tiers, no model names. They type, the workspace picks a safe destination, and personal data is masked before it leaves and restored in the reply. Admins see every decision with a one-line reason in the **Routing log**. For the demo, **Show admin view** opens the same information next to the chat.

## Run it

Needs [git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org) 22 or newer. No backend, accounts or API keys.

```bash
git clone https://github.com/Chattyflow/content-based-routing-prototype.git
cd content-based-routing-prototype
npm install
npm run dev
```

Open http://localhost:5173. All data is fictional. **Reset demo** (top right of the tabs) puts the rules and the routing log back to the start.

```bash
npm test          # every demo prompt routes as expected, admin rules, masking
npm run build     # type check + production build
```

## Existing vs new

| Existing | New in this prototype |
|---|---|
| Three tiers and the coloured border around the input | **No choice for employees**: every request is routed automatically; the chat shows no tier, model or masking |
| Manual model selector | Removed for employees; the classifier picks the tier per request |
| Personal-data masking with preview | **Confidential-content detection**: contracts, salaries and figures, M&A and strategy, code and secrets, incidents, documents marked confidential (English and German). Masking now also covers bank account numbers without a valid IBAN checksum |
| Admin approval for RED | **Admin rules per team**: an action per category, a confidence threshold, the RED switch, presets |
| Audit of AI requests | **Routing log and dashboard**: detected categories (never content), tier, model and reason per request; details for the current session show the rules that fired and what the external model received |

## 3-minute demo script

1. **Employee view.** As Lena (HR), click the *Supplier contract* sample and send it. A normal answer comes back. There is no model to pick and nothing about tiers.
2. **Show admin view** (top right of the tabs). The same request stayed on **GREEN**: *"Kept on EU servers: this looks like a confidential contract or legal matter."* The details list the penalty clause, NDA and "confidential" rules that fired.
3. **Slogan.** Send *Campaign slogan*: *"Nothing sensitive found: using the most capable model."*
4. **Customer email.** Send *Customer email*: **ORANGE**, *"Sent to Claude with 1 name and 1 phone number masked."* The admin view shows exactly what Claude received. The employee's answer contains the real name again.
5. **Bank details.** Type *Here is my IBAN: 97283638882900186538*: the number is masked as `[ACCOUNT_1]` before it leaves, and the employee gets a normal reply.
6. **Ambiguous note.** Send *Ambiguous internal note*: weak signals only, confidence 32%, below the 70% threshold, so **GREEN**: *"Unsure, so playing safe."*
7. **Admin rules.** Open **Admin rules** → **HR** → **Strict** (personal data stays on GREEN, threshold 85%). Back in Chat, the customer email now stays on GREEN.
8. **Routing log.** Every request with its detected categories, tier, model and reason, plus the dashboard: share per tier, sensitive requests kept on EU infrastructure, requests masked, and "unsure, so played safe".

## How the classifier works

Simple, deterministic and explainable, so every decision can be traced:

- **Personal data:** regular expressions for emails, phone numbers, IBANs (with checksum), other bank account numbers (labelled, or 12 to 24 digits in a row), dates of birth and tax IDs, plus the names of the demo's fictional people.
- **Confidential content:** weighted keyword and pattern rules per category, in English and German: for example code blocks (+0.4), strings that look like API keys (+0.8), "Vertragsstrafe" (+0.7), "NDA" (+0.6), "Gehalt"/"salary" (+0.6), "merger" (+0.7), "Kündigung" (+0.5). A category's score is the sum of its rules, and it counts as detected from 0.5.
- **Confidence:** high when a category is clearly detected, or when nothing fires at all. Weak signals that don't add up to a detection give low confidence, and that is when the router plays safe.
- **Routing:** the strictest admin action among everything detected wins (keep on GREEN, mask for ORANGE, allow any model).

Code: `src/lib/classifier.ts` and `src/lib/router.ts`, tested in `src/lib/routing.test.ts`.

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
