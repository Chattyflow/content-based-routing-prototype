import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { aiPlugin } from "./server/aiPlugin.ts";

export default defineConfig({
  plugins: [react(), tailwindcss(), aiPlugin()],
  server: { port: 5173 },
  test: { environment: "node", include: ["src/**/*.test.ts", "server/**/*.test.ts"] },
});
