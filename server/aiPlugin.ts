// Serves /api/* (server/api.ts) from the Vite dev and preview servers, with
// settings from .env. Hosted on Netlify, netlify/functions/api.ts does the same.

import { loadEnv, type Plugin } from "vite";
import { handleApi } from "./api.ts";

interface Req extends AsyncIterable<Uint8Array> {
  method?: string;
  url?: string;
}
interface Res {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

export function aiPlugin(): Plugin {
  let env: Record<string, string> = {};

  async function handle(req: Req, res: Res) {
    const chunks: Uint8Array[] = [];
    if (req.method === "POST") for await (const chunk of req) chunks.push(chunk);
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const r = await handleApi(path, req.method ?? "GET", await new Blob(chunks as BlobPart[]).text(), env);
    res.statusCode = r.status;
    for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v);
    res.end(r.body === null ? undefined : JSON.stringify(r.body));
  }

  const middleware = (req: unknown, res: unknown, next: () => void) => {
    if (!(req as Req).url?.startsWith("/api/")) return next();
    void handle(req as Req, res as Res);
  };

  return {
    name: "api",
    configResolved(config) {
      env = loadEnv(config.mode, typeof config.envDir === "string" ? config.envDir : config.root, "");
    },
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
