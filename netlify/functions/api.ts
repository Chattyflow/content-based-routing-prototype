// Netlify Function serving /api/* when the app is hosted. Same logic as the
// local dev server (server/api.ts). Set LLM_API_KEY (and optionally LLM_MODEL)
// in the Netlify site's environment variables to turn on the AI features.

import { getStore } from "@netlify/blobs";
import { handleApi } from "../../server/api.ts";
import type { VisitStore } from "../../server/visits.ts";

declare const Netlify: { env: { toObject(): Record<string, string> } };

// Visits are kept in Netlify Blobs, one small record per visit (see server/visits.ts).
function blobVisits(): VisitStore {
  const store = getStore({ name: "visits", consistency: "strong" });
  return {
    add: async (key) => void (await store.set(key, "1")),
    keys: async () => (await store.list()).blobs.map((b) => b.key),
    remove: (key) => store.delete(key),
  };
}

export default async (req: Request, context: { geo?: { country?: { code?: string } } }): Promise<Response> => {
  const url = new URL(req.url);
  const visits = url.pathname.startsWith("/api/visit") ? blobVisits() : undefined;
  const r = await handleApi(url.pathname, req.method, req.method === "POST" ? await req.text() : "", Netlify.env.toObject(), {
    country: context?.geo?.country?.code,
    userAgent: req.headers.get("user-agent") ?? "",
    visits,
  });
  return new Response(r.body === null ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers });
};

// A public deployment would otherwise let anyone spend the key's model quota.
export const config = {
  path: "/api/*",
  rateLimit: { action: "rate_limit", aggregateBy: ["ip", "domain"], windowSize: 60, windowLimit: 30 },
};
