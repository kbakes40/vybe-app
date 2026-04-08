import { Hono } from "hono";
import { fetchSpotifyPlaylist, fetchSpotifyTrack } from "../services/spotifyService";

const spotifyRouter = new Hono();

const PLAYLIST_ID_RE = /^[a-zA-Z0-9]{22}$/;

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
