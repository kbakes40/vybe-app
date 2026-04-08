import { Hono } from "hono";
import { fetchAppleMusicUrl } from "../services/appleMusicService";

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

export { appleMusicRouter };
