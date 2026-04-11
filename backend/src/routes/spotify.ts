import { Hono } from "hono";
import { fetchSpotifyPlaylist, fetchSpotifyTrack, searchSpotifyTracks } from "../services/spotifyService";

const spotifyRouter = new Hono();

const PLAYLIST_ID_RE = /^[a-zA-Z0-9]{22}$/;

/**
 * GET /api/spotify/search?q=query&limit=10
 * Search the Spotify-style catalog (backed by iTunes Search API) and
 * return results pre-resolved to YouTube video IDs so the client can
 * download them through the existing YouTube pipeline. Mirrors the
 * /api/apple-music/search and /api/youtube/search contracts.
 */
spotifyRouter.get("/search", async (c) => {
  const q = c.req.query("q");
  const limitRaw = c.req.query("limit");
  const limit = Math.min(Math.max(parseInt(limitRaw ?? "10", 10) || 10, 1), 20);
  if (!q || !q.trim()) {
    return c.json({ error: { message: "Missing query" } }, 400);
  }
  try {
    const result = await searchSpotifyTracks(q.trim(), limit);
    return c.json({ data: result });
  } catch (err: any) {
    console.error("[Spotify] search error:", err?.message);
    return c.json({ error: { message: err?.message ?? "Spotify search failed" } }, 500);
  }
});

spotifyRouter.get("/track/:id", async (c) => {
  const id = c.req.param("id");
  if (!PLAYLIST_ID_RE.test(id)) {
    return c.json({ error: { message: "Invalid Spotify track ID" } }, 400);
  }
  try {
    const result = await fetchSpotifyTrack(id);
    return c.json({ data: result });
  } catch (err) {
    console.error("[Spotify] track fetch error:", err);
    return c.json({ error: { message: "Failed to fetch Spotify track" } }, 500);
  }
});

spotifyRouter.get("/playlist/:id", async (c) => {
  const id = c.req.param("id");
  if (!PLAYLIST_ID_RE.test(id)) {
    return c.json({ error: { message: "Invalid Spotify playlist ID" } }, 400);
  }
  try {
    const result = await fetchSpotifyPlaylist(id);
    return c.json({ data: result });
  } catch (err) {
    console.error("[Spotify] fetch error:", err);
    return c.json({ error: { message: "Failed to fetch Spotify playlist" } }, 500);
  }
});

export { spotifyRouter };
