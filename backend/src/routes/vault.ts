import { Hono } from "hono";
import { env } from "../env";

const vaultRouter = new Hono();

/**
 * POST /api/vault/save
 * Fire-and-forget offline vault work (YouTube → downloadable asset) so the
 * current listening session never blocks on yt-dlp. Mirrors the heavy path
 * used by GET /api/youtube/download/:videoId against this same origin.
 */
vaultRouter.post("/save", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    videoId?: string;
    soundcloudUrl?: string;
    title?: string;
    artist?: string;
  };
  const videoId = body.videoId?.trim() ?? "";
  const soundcloudUrl = body.soundcloudUrl?.trim() ?? "";

  if (!videoId && !soundcloudUrl) {
    return c.json({ error: { message: "videoId or soundcloudUrl required", code: "MISSING_TARGET" } }, 400);
  }
  if (videoId && !/^[a-zA-Z0-9_-]{6,32}$/.test(videoId)) {
    return c.json({ error: { message: "invalid videoId", code: "INVALID_VIDEO_ID" } }, 400);
  }

  const base = env.BACKEND_URL.replace(/\/$/, "");

  if (videoId) {
    const url = `${base}/api/youtube/download/${encodeURIComponent(videoId)}`;
    queueMicrotask(() => {
      const started = Date.now();
      void fetch(url)
        .then(async (res) => {
          try {
            await res.arrayBuffer();
          } catch {
            /* drain body */
          }
          if (res.ok) {
            console.log(
              `[OfflineWorker] vault download ok videoId=${videoId} ms=${Date.now() - started} title=${JSON.stringify(body.title ?? "")}`,
            );
          } else {
            console.warn(`[OfflineWorker] vault download HTTP ${res.status} videoId=${videoId}`);
          }
        })
        .catch((e) => {
          console.warn("[OfflineWorker] vault download failed", videoId, e instanceof Error ? e.message : e);
        });
    });
  }

  return c.json({ data: { queued: true } });
});

export { vaultRouter };
