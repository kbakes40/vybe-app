import { Hono } from "hono";
import { fetchAppleMusicUrl, searchAppleMusic } from "../services/appleMusicService";

const appleMusicRouter = new Hono();

appleMusicRouter.get("/resolve", async (c) => {
  const url = c.req.query("url");
  if (!url || !url.includes("music.apple.com")) {
    return c.json({ error: { message: "Invalid Apple Music URL" } }, 400);
  }
  try {
    const result = await fetchAppleMusicUrl(url);
    return c.json({ data: result });
  } catch (err: any) {
    console.error("[AppleMusic] error:", err?.message);
    return c.json({ error: { message: err?.message ?? "Failed to fetch Apple Music content" } }, 500);
  }
});

/**
 * GET /api/apple-music/search?q=query&limit=10
 * Searches the Apple Music catalog via iTunes Search API (no auth) and
 * returns the results already enriched with a YouTube videoId so the
 * client can hand each track directly to the existing YouTube download
 * pipeline — same way YouTube Music search already works.
 */
appleMusicRouter.get("/search", async (c) => {
  const q = c.req.query("q");
  const limitRaw = c.req.query("limit");
  const limit = Math.min(Math.max(parseInt(limitRaw ?? "10", 10) || 10, 1), 20);
  if (!q || !q.trim()) {
    return c.json({ error: { message: "Missing query" } }, 400);
  }
  try {
    const result = await searchAppleMusic(q.trim(), limit);
    return c.json({ data: result });
  } catch (err: any) {
    console.error("[AppleMusic] search error:", err?.message);
    return c.json({ error: { message: err?.message ?? "Apple Music search failed" } }, 500);
  }
});

export { appleMusicRouter };
