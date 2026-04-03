import { Hono } from "hono";
import ytdl from "ytdl-core";

const youtubeRouter = new Hono();

youtubeRouter.get("/audio/:videoId", async (c) => {
  const videoId = c.req.param("videoId");

  try {
    if (!videoId || !ytdl.validateID(videoId)) {
      return c.json({ error: "Invalid YouTube video ID" }, 400);
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const info = await ytdl.getInfo(videoUrl);
    const format = ytdl.chooseFormat(info.formats, {
      quality: "highestaudio",
      filter: "audioonly",
    });

    const contentType = format.mimeType?.split(";")[0] ?? "audio/mp4";
    const extension = contentType.includes("webm") ? "webm" : "mp4";
    const title = info.videoDetails.title.replace(/[^\w\s-]/g, "").trim() || videoId;

    const stream = ytdl(videoUrl, {
      quality: format.itag,
      filter: "audioonly",
      highWaterMark: 1 << 25,
    });

    c.header("Content-Type", contentType);
    c.header("Content-Disposition", `inline; filename="${title}.${extension}"`);
    c.header("Cache-Control", "no-store");

    return new Response(stream as unknown as ReadableStream, { status: 200 });
  } catch (error) {
    console.error("YouTube audio proxy failed:", error);
    return c.json({ error: "Failed to stream YouTube audio" }, 500);
  }
});

export { youtubeRouter };
