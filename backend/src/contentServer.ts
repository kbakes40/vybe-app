/**
 * Minimal static catalog server for Railway "vybe-content" (or any host).
 * Does not import env.ts (no DB/auth required).
 *
 * Start: bun run start:content
 * URL:  GET /catalog/curated-playlists.json
 */
import { readFileSync } from "fs";
import path from "path";
import { Hono } from "hono";
import { cors } from "hono/cors";

// Local: `backend/.env` usually has PORT=3000 for the main API; Bun loads it here too,
// so we must not use PORT unless we're on Railway (or you set CONTENT_SERVER_PORT).
const contentPort = (): number => {
  const override = Number(process.env.CONTENT_SERVER_PORT);
  if (Number.isFinite(override) && override > 0) return override;
  if (process.env.RAILWAY_ENVIRONMENT) {
    const p = Number(process.env.PORT);
    if (Number.isFinite(p) && p > 0) return p;
  }
  return 3040;
};
const port = contentPort();
const app = new Hono();

app.use("/*", cors({ origin: "*" }));

app.get("/health", (c) => c.json({ ok: true }));

app.get("/catalog/curated-playlists.json", (c) => {
  const file = path.join(import.meta.dir, "..", "catalog", "curated-playlists.json");
  const body = readFileSync(file, "utf-8");
  return c.body(body, 200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  });
});

console.log(`[content] listening on :${port}`);
export default { port, fetch: app.fetch };
