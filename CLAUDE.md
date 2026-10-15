# Content-Based Routing concept prototype: notes for Claude Code

Vite + React + TypeScript + Tailwind, no backend. See README.md for the feature and the 3-minute demo script.

- Commands: `npm run dev`, `npm test` (Vitest), `npm run build` (type check + build).
- `src/lib/classifier.ts`: deterministic rules; every rule records what it matched so the UI can explain it.
- `src/lib/router.ts`: policy + classification -> tier, model, one-line reason. The strictest action wins; below the threshold stays on GREEN.
- `src/lib/routing.test.ts` pins every demo prompt to its expected route. Change rule weights only with these tests passing.
- The routing log stores detected categories, never content.
- Employees must never see routing: no model selector, tier, model name or masking text in the chat. Routing details live only in the admin view (`AdminPanel.tsx`) and the Routing log.
- Request content and routing details stay in memory for the session only; localStorage holds the user, rules and log.
- Keep the UI simple.
- All people and companies are fictional. The public repo must not name the company this concept was written for.
