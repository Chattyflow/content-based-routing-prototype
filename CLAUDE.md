# Content-Based Routing concept prototype: notes for Claude Code

Vite + React + TypeScript + Tailwind, no backend. See README.md for the feature and the 3-minute demo script.

- Commands: `npm run dev`, `npm test` (Vitest), `npm run build` (type check + build).
- `src/lib/classifier.ts`: deterministic rules; every rule records what it matched so the UI can explain it.
- `src/lib/router.ts`: policy + classification -> tier, model, one-line reason. The strictest action wins; below the threshold stays on GREEN.
- `src/lib/routing.test.ts` pins every demo prompt to its expected route. Change rule weights only with these tests passing.
- Server side in `server/api.ts` (/api/v1/check public rules API, /api/classify, /api/chat, /api/status), served by `server/aiPlugin.ts` locally and `netlify/functions/api.ts` when hosted; key from env, never sent to the browser. Optional real AI, `src/lib/aiCheck.ts` (AI check: prompt, parsing, merge; it may only add protection) and `src/lib/conversation.ts` (what the chosen model receives; GREEN turns never go external as history). Tests never call the network.
- Imports reachable from `vite.config.ts` use `.ts` extensions (Vite's native config loader).
- The routing log stores detected categories, never content.
- Employees must never see routing: no model selector, tier, model name or masking text in the chat. Routing details live only in the admin view (`AdminPanel.tsx`) and the Routing log.
- Request content and routing details stay in memory for the session only; localStorage holds the user, rules and log.
- Pricing tab: plans in `src/features/plans.ts`; every plan shows "Coming soon" and nothing can be bought.
- Messages and calls (`src/features/messenger/`): the other person is played by a model via /api/dm (persona in `persona.ts`, personal data masked first, canned replies without a key); calls are simulated; external contacts get a confidential-content check before sending.
- Keep the UI simple.
- All people and companies are fictional. The public repo must not name the company this concept was written for.
