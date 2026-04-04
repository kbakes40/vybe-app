import { Hono } from "hono";
import YTDlpWrap from "yt-dlp-wrap";
import { Readable } from "stream";
import { getQuotaStats, getSearchCacheSize, purgeExpiredSearchCache } from "../services/youtubeService";

const youtubeRouter = new Hono();
const ytDlp = new YTDlpWrap("/opt/homebrew/bin/yt-dlp");

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{6,32}$/;

youtubeRouter.get("/audio/:videoId", async (c) => {
  const videoId = c.req.param("videoId");

  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return c.json({ error: "Invalid YouTube video ID" }, 400);
  }

  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // Get metadata to derive filename and content type
    const meta = await ytDlp.getVideoInfo(url);
    const title = (meta.title as string | undefined)?.replace(/[^\w\s-]/g, "").trim() || videoId;

    // Stream best audio-only format via yt-dlp stdout
    const stream = ytDlp.execStream([
      url,
      "-f", "bestaudio[ext=m4a]/bestaudio/best",
      "--no-playlist",
      "-o", "-",
    ]);

    c.header("Content-Type", "audio/mp4");
    c.header("Content-Disposition", `inline; filename="${title}.m4a"`);
    c.header("Cache-Control", "no-store");

    const webStream = Readable.toWeb(stream as unknown as Readable) as ReadableStream;
    return new Response(webStream, { status: 200 });
  } catch (error) {
    console.error("YouTube audio proxy failed:", error);
    return c.json({ error: "Failed to stream YouTube audio" }, 500);
  }
});

youtubeRouter.get("/quota", (c) => {
  const stats = getQuotaStats();
  const cacheSize = getSearchCacheSize();
  const purged = purgeExpiredSearchCache();
  return c.json({
    data: {
      quota: {
        unitsUsedToday: stats.totalUnits,
        dailyLimit: 10000,
        percentUsed: ((stats.totalUnits / 10000) * 100).toFixed(1) + '%',
        apiCallsToday: stats.callCount,
        cacheHitsToday: stats.cacheHits,
        unitsSavedByCache: stats.cacheHits * 100,
        resetsAt: new Date(stats.resetAt).toISOString(),
      },
      cache: {
        entriesActive: cacheSize - purged,
        entriesPurged: purged,
        ttlHours: 24,
      },
    },
  });
});

export { youtubeRouter };
