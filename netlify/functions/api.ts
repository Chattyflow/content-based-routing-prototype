// Netlify Function serving /api/* when the app is hosted. Same logic as the
// local dev server (server/api.ts). Set LLM_API_KEY (and optionally LLM_MODEL)
// in the Netlify site's environment variables to turn on the AI features.

import { handleApi } from "../../server/api.ts";

declare const Netlify: { env: { toObject(): Record<string, string> } };

export default async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const r = await handleApi(url.pathname, req.method, req.method === "POST" ? await req.text() : "", Netlify.env.toObject());
  return new Response(r.body === null ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers });
};

// A public deployment would otherwise let anyone spend the key's model quota.
export const config = {
  path: "/api/*",
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 30 },
};
