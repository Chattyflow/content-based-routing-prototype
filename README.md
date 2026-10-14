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

The user always sees the decision and a one-line reason. Overrides are possible within the admin rules, and every request, override and flag is logged.

## Run it

Needs [git](https://git-scm.com/downloads) and [Node.js](https://nodejs.org) 22 or newer. No backend, accounts or API keys.

```bash
git clone https://github.com/Chattyflow/content-based-routing-prototype.git
cd content-based-routing-prototype
npm install
npm run dev
```

Open http://localhost:5173. All data is fictional. **Reset demo** (top right of the tabs) puts the rules and the audit log back to the start.

```bash
npm test          # every demo prompt routes as expected, admin rules, masking
npm run build     # type check + production build
```

## Existing vs new

| Existing | New in this prototype |
|---|---|
| Three tiers and the coloured border around the input | **Auto (recommended)** model choice: a classifier picks the tier per request |
| Manual model selector | Manual choice still possible; less safe than the routing asks for confirmation and is logged |
| Personal-data masking with preview | **Confidential-content detection**: contracts, salaries and figures, M&A and strategy, code and secrets, incidents, documents marked confidential (English and German) |
| Admin approval for RED | **Decision line** per request: tier, model, one-line reason, confidence; "Why?" shows the detected items and the rules that fired |
| Audit of AI requests | **Admin rules per team**: an action per category, confidence threshold, RED and override switches, presets |
| | **Feedback**: "Flag this decision" (too cautious / missed something sensitive) |
| | **Audit log and dashboard**: detected categories (never content), tier, model, overrides, flags |

## 3-minute demo script

1. **Manual mode (today).** Click the *Supplier contract* sample. Claude is selected, as most people would pick. The warning appears: *"Without routing, this contract would have left EU infrastructure."* Send it: the decision line repeats the warning.
2. **Auto mode (proposed).** Switch to *Auto (proposed)* at the top and send the same contract. It stays on **GREEN**: *"Kept on EU servers: this looks like a confidential contract or legal matter."* Click **Why?** to see the penalty clause, NDA and "confidential" rules that fired.
3. **Slogan.** Send *Campaign slogan*: *"Nothing sensitive found: using the most capable model."*
4. **Customer email.** Send *Customer email*: **ORANGE**, *"Sent to Claude with 1 name and 1 phone number masked."* The preview shows the text next to what Claude receives.
5. **Ambiguous note.** Send *Ambiguous internal note*: weak signals only, confidence 32%, below the 70% threshold, so **GREEN**: *"Unsure, so playing safe."*
6. **Admin.** Open **Admin rules** → **HR** → **Strict** (personal data stays on GREEN, threshold 85%, no overrides). Back in Chat, the customer email now stays on GREEN.
7. **Audit log.** Every request with its detected categories, tier, model, override and flag, and the dashboard: share per tier, override rate, flags, and sensitive requests kept on EU infrastructure.

Also try **Use a different model** on a GREEN decision (a confirmation, then logged) and **Flag this decision**.

## How the classifier works

Simple, deterministic and explainable, so every decision can be traced:

- **Personal data:** regular expressions for emails, phone numbers, IBANs (with checksum), dates of birth and tax IDs, plus the names of the demo's fictional people.
- **Confidential content:** weighted keyword and pattern rules per category, in English and German: for example code blocks (+0.4), strings that look like API keys (+0.8), "Vertragsstrafe" (+0.7), "NDA" (+0.6), "Gehalt"/"salary" (+0.6), "merger" (+0.7), "Kündigung" (+0.5). A category's score is the sum of its rules, and it counts as detected from 0.5.
- **Confidence:** high when a category is clearly detected, or when nothing fires at all. Weak signals that don't add up to a detection give low confidence, and that is when the router plays safe.
- **Routing:** the strictest admin action among everything detected wins (keep on GREEN, mask for ORANGE, allow any model).

Code: `src/lib/classifier.ts` and `src/lib/router.ts`, tested in `src/lib/routing.test.ts`.

## Success metrics

- Share of confidential requests kept on GREEN.
- Override rate.
- Flag rate: "too cautious" vs "missed something sensitive".
- User satisfaction with answer quality.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Misclassification | Default to GREEN when unsure; admins tune actions and thresholds per team; flags feed the next version of the rules |
| Over-caution frustrates users | Overrides within admin rules, per-team thresholds, presets such as Lenient for Marketing |
| Added latency | The classifier is small and runs on the vendor's own infrastructure (about 40 ms) |

## Next steps

Replace keyword scoring with a small classifier model hosted on EU infrastructure, trained on customer feedback (the flags), while keeping the explanation of each decision.
