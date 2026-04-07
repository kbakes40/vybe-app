import { Hono } from "hono";
import { spawn } from "child_process";
import { getQuotaStats, getSearchCacheSize, purgeExpiredSearchCache, fetchNewReleases, fetchCuratedPlaylists, searchYouTube } from "../services/youtubeService";

const youtubeRouter = new Hono();

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{6,32}$/;
const YTDLP = "/opt/homebrew/bin/yt-dlp";

// Cache resolved CDN URLs so repeated range requests don't re-run yt-dlp
// YouTube CDN URLs expire after ~6 hours, so cache for 4 hours to be safe
const urlCache = new Map<string, { url: string; expires: number }>();
const URL_TTL_MS = 4 * 60 * 60 * 1000;

function getCachedUrl(videoId: string): string | null {
  const entry = urlCache.get(videoId);
  if (entry && Date.now() < entry.expires) return entry.url;
  urlCache.delete(videoId);
  return null;
}

function setCachedUrl(videoId: string, url: string): void {
  urlCache.set(videoId, { url, expires: Date.now() + URL_TTL_MS });
}

/**
 * Resolve a YouTube videoId to a direct CDN audio URL using yt-dlp.
 * Prefers m4a (AAC) which iOS AVPlayer can decode natively.
 */
function resolveAudioUrl(videoId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn(YTDLP, [
      `https://www.youtube.com/watch?v=${videoId}`,
      "-f", "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio",
      "--get-url",
      "--no-playlist",
      "--quiet",
    ]);

    const timeout = setTimeout(() => {
      ytdlp.kill("SIGKILL");
      reject(new Error(`yt-dlp timed out resolving ${videoId}`));
    }, 30_000);

    let output = "";
    let errOutput = "";
    ytdlp.stdout.on("data", (chunk) => { output += chunk.toString(); });
    ytdlp.stderr.on("data", (chunk) => { errOutput += chunk.toString(); });
    ytdlp.on("close", (code) => {
      clearTimeout(timeout);
      const url = output.trim().split("\n")[0];
      if (code === 0 && url.startsWith("http")) {
        resolve(url);
      } else {
        reject(new Error(`yt-dlp failed (${code}): ${errOutput.slice(0, 200)}`));
      }
    });
    ytdlp.on("error", reject);
  });
}

// Track in-flight resolutions so concurrent requests for the same video
// don't each spawn their own yt-dlp process
const inflight = new Map<string, Promise<string>>();

async function getAudioUrl(videoId: string): Promise<string> {
  const cached = getCachedUrl(videoId);
  if (cached) return cached;

  let pending = inflight.get(videoId);
  if (!pending) {
    pending = resolveAudioUrl(videoId).then((url) => {
      setCachedUrl(videoId, url);
      inflight.delete(videoId);
      return url;
    }).catch((e) => {
      inflight.delete(videoId);
      throw e;
    });
    inflight.set(videoId, pending);
  }
  return pending;
}

/**
 * GET /api/youtube/audio/:videoId
 * Resolves the YouTube video to a direct CDN URL via yt-dlp (cached for 4h),
 * then proxies the request — forwarding Range headers so iOS AVPlayer gets
 * proper 206 responses with Content-Length and Accept-Ranges.
 */
youtubeRouter.get("/audio/:videoId", async (c) => {
  const videoId = c.req.param("videoId");

  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return c.json({ error: "Invalid YouTube video ID" }, 400);
  }

  let directUrl: string;
  try {
    directUrl = await getAudioUrl(videoId);
  } catch (e) {
    console.error("[YouTube] Failed to resolve CDN URL:", e);
    return c.json({ error: "Failed to resolve audio URL" }, 502);
  }

  const rangeHeader = c.req.header("Range");
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; VybeApp/1.0)",
  };
  if (rangeHeader) {
    upstreamHeaders["Range"] = rangeHeader;
  }

  const cdnAbort = new AbortController();
  const cdnTimeout = setTimeout(() => cdnAbort.abort(), 90_000);

  let upstream: Response;
  try {
    upstream = await fetch(directUrl, { headers: upstreamHeaders, signal: cdnAbort.signal });
  } catch (e) {
    clearTimeout(cdnTimeout);
    console.error("[YouTube] CDN fetch failed:", e);
    return c.json({ error: "Failed to fetch audio from CDN" }, 502);
  }
  clearTimeout(cdnTimeout);

  // If the CDN URL expired (403/404), clear cache and retry once
  if (upstream.status === 403 || upstream.status === 404) {
    urlCache.delete(videoId);
    try {
      directUrl = await getAudioUrl(videoId);
      upstream = await fetch(directUrl, { headers: upstreamHeaders });
    } catch (e) {
      return c.json({ error: "Audio URL expired and refresh failed" }, 502);
    }
  }

  const contentType = upstream.headers.get("Content-Type") ?? "audio/mp4";

  if (!rangeHeader) {
    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    };
    const upstreamLength = upstream.headers.get("Content-Length");
    if (upstreamLength) responseHeaders["Content-Length"] = upstreamLength;
    return new Response(upstream.body, { status: 200, headers: responseHeaders });
  }

  const responseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  };

  const contentLength = upstream.headers.get("Content-Length");
  const contentRange = upstream.headers.get("Content-Range");
  const acceptRanges = upstream.headers.get("Accept-Ranges");

  if (contentLength) responseHeaders["Content-Length"] = contentLength;
  if (contentRange) responseHeaders["Content-Range"] = contentRange;
  if (acceptRanges) responseHeaders["Accept-Ranges"] = acceptRanges;

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
});

/**
 * GET /api/youtube/download/:videoId
 * Downloads audio via yt-dlp to a temp file, then serves it to the mobile app.
 */
youtubeRouter.get("/download/:videoId", async (c) => {
  const videoId = c.req.param("videoId");
  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return c.json({ error: "Invalid video ID" }, 400);
  }

  const tmpBase = `/tmp/yt_${videoId}_${Date.now()}`;
  const tmpTemplate = `${tmpBase}.%(ext)s`;

  const result = await new Promise<{ ok: true; path: string } | { ok: false; reason: string }>((resolve) => {
    const ytdlp = spawn(YTDLP, [
      `https://www.youtube.com/watch?v=${videoId}`,
      "-f", "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio",
      "--no-playlist",
      "-o", tmpTemplate,
      "--no-warnings",
      "--no-part",
      "--print", "after_move:filepath",
    ]);

    const timeout = setTimeout(() => {
      ytdlp.kill("SIGKILL");
      Bun.spawn(["sh", "-c", `rm -f ${tmpBase}.* 2>/dev/null`]);
      resolve({ ok: false, reason: "Download timed out" });
    }, 60_000);

    let stdoutBuf = "";
    let errBuf = "";
    ytdlp.stdout.on("data", (chunk: Buffer) => { stdoutBuf += chunk.toString(); });
    ytdlp.stderr.on("data", (chunk: Buffer) => { errBuf += chunk.toString(); });

    ytdlp.on("close", (code: number | null) => {
      clearTimeout(timeout);
      const finalPath = stdoutBuf.trim().split("\n").pop()?.trim() ?? "";
      if (code === 0 && finalPath) {
        resolve({ ok: true, path: finalPath });
        return;
      }
      if (code === 0) {
        import("child_process").then(({ execSync }) => {
          try {
            const listed = execSync(`ls ${tmpBase}.* 2>/dev/null | head -1`).toString().trim();
            if (listed) resolve({ ok: true, path: listed });
            else resolve({ ok: false, reason: "yt-dlp produced no output file" });
          } catch { resolve({ ok: false, reason: "yt-dlp produced no output file" }); }
        });
        return;
      }
      const errLine = errBuf.split("\n").find((l) => l.includes("ERROR:")) ?? "";
      const reason = errLine.replace(/^ERROR:\s*\[youtube\]\s*[\w-]+:\s*/, "").trim() || `Exit ${code}`;
      Bun.spawn(["sh", "-c", `rm -f ${tmpBase}.* 2>/dev/null`]);
      resolve({ ok: false, reason });
    });
    ytdlp.on("error", (e: Error) => {
      clearTimeout(timeout);
      Bun.spawn(["sh", "-c", `rm -f ${tmpBase}.* 2>/dev/null`]);
      resolve({ ok: false, reason: e.message });
    });
  });

  if (!result.ok) {
    console.error(`[YouTube] download failed for ${videoId}: ${result.reason}`);
    const r = result.reason.toLowerCase();
    let userMsg = "This track couldn't be downloaded right now";
    if (r.includes("unavailable")) userMsg = "Video is unavailable";
    else if (r.includes("sign in") || r.includes("bot")) userMsg = "YouTube blocked this download — try again later";
    else if (r.includes("private")) userMsg = "This video is private";
    else if (r.includes("timed out")) userMsg = "Download timed out — try again";
    else if (r.includes("copyright") || r.includes("removed")) userMsg = "Video removed due to copyright";
    return c.json({ error: userMsg }, 502);
  }

  try {
    const file = Bun.file(result.path);
    if (file.size === 0) throw new Error("Downloaded file is empty");

    const buffer = await file.arrayBuffer();
    Bun.spawn(["rm", "-f", result.path]);

    const ext = result.path.split(".").pop()?.toLowerCase() ?? "m4a";
    const contentType = ext === "mp3" ? "audio/mpeg" : "audio/mp4";

    console.log(`[YouTube] download ${videoId}: ${buffer.byteLength} bytes (${ext})`);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.byteLength.toString(),
        "Content-Disposition": `attachment; filename="${videoId}.${ext}"`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    Bun.spawn(["rm", "-f", result.path]);
    console.error("[YouTube] serve error:", e instanceof Error ? e.message : e);
    return c.json({ error: "Download failed — please try again" }, 502);
  }
});

/**
 * GET /api/youtube/resolve/:videoId
 * Returns the direct CDN audio URL for use in downloads.
 */
youtubeRouter.get("/resolve/:videoId", async (c) => {
  const videoId = c.req.param("videoId");
  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return c.json({ error: "Invalid video ID" }, 400);
  }
  try {
    const url = await getAudioUrl(videoId);
    return c.json({ data: { url } });
  } catch (e) {
    return c.json({ error: "Failed to resolve audio URL" }, 502);
  }
});

/**
 * GET /api/youtube/warm/:videoId
 * Pre-resolves and caches the CDN URL for a video so subsequent /audio requests are instant.
 */
youtubeRouter.get("/warm/:videoId", async (c) => {
  const videoId = c.req.param("videoId");
  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return c.json({ error: "Invalid video ID" }, 400);
  }
  const already = !!getCachedUrl(videoId);
  if (!already) {
    getAudioUrl(videoId).catch(() => {});
  }
  return c.json({ data: { cached: already, warming: !already } });
});

/**
 * GET /api/youtube/search?q=...&maxResults=10
 */
youtubeRouter.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  const maxResults = Math.min(parseInt(c.req.query("maxResults") ?? "10", 10), 20);
  if (!q) return c.json({ error: "Missing q parameter" }, 400);

  try {
    const ytdlpResults = await searchYouTubeYtDlp(q, maxResults);
    if (ytdlpResults.length > 0) return c.json({ data: ytdlpResults });
  } catch (e) {
    console.error("[YouTube] yt-dlp search failed:", e);
  }

  try {
    const apiResults = await searchYouTube(q, maxResults);
    return c.json({ data: apiResults });
  } catch {
    return c.json({ data: [] });
  }
});

function searchYouTubeYtDlp(query: string, maxResults: number): Promise<Array<{
  videoId: string; title: string; channelName: string; thumbnailUrl: string; publishedAt: string; searchQuery: string;
}>> {
  return new Promise((resolve, reject) => {
    const fetchCount = Math.min(maxResults * 3, 50);
    const ytdlp = spawn(YTDLP, [
      `ytsearch${fetchCount}:${query}`,
      "--dump-json", "--flat-playlist", "--quiet", "--no-warnings",
    ]);
    const timeout = setTimeout(() => { ytdlp.kill("SIGKILL"); reject(new Error("yt-dlp timeout")); }, 20_000);
    let output = "";
    ytdlp.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    ytdlp.on("close", () => {
      clearTimeout(timeout);
      const tracks = output.trim().split("\n").filter(l => l.trim()).flatMap(line => {
        try {
          const j = JSON.parse(line);
          const videoId: string = j.id ?? "";
          if (!videoId) return [];
          const duration: number = j.duration ?? 0;
          if (duration > 480) return [];
          return [{
            videoId,
            title: j.title ?? "",
            channelName: j.uploader ?? j.channel ?? "",
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            publishedAt: "",
            searchQuery: query,
          }];
        } catch { return []; }
      }).slice(0, maxResults);
      resolve(tracks);
    });
    ytdlp.on("error", reject);
  });
}

/**
 * GET /api/youtube/info/:videoId
 */
youtubeRouter.get("/info/:videoId", async (c) => {
  const videoId = c.req.param("videoId");
  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return c.json({ error: "Invalid YouTube video ID" }, 400);
  }
  try {
    const info = await getVideoInfo(videoId);
    return c.json({ data: info });
  } catch (e) {
    console.error("[YouTube] info error:", e);
    return c.json({ error: "Failed to get video info" }, 502);
  }
});

function getVideoInfo(videoId: string): Promise<{ title: string; channel: string; thumbnail: string; duration: number }> {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn(YTDLP, [
      `https://www.youtube.com/watch?v=${videoId}`,
      "--print", "%(title)s",
      "--print", "%(uploader)s",
      "--print", "%(thumbnail)s",
      "--print", "%(duration)s",
      "--no-playlist",
      "--quiet",
      "--no-warnings",
    ]);
    let out = "";
    let err = "";
    ytdlp.stdout.on("data", (d) => { out += d.toString(); });
    ytdlp.stderr.on("data", (d) => { err += d.toString(); });
    ytdlp.on("close", (code) => {
      const lines = out.trim().split("\n");
      if (code === 0 && lines.length >= 3) {
        resolve({
          title: lines[0] ?? "Unknown Title",
          channel: lines[1] ?? "Unknown Artist",
          thumbnail: lines[2] ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          duration: parseInt(lines[3] ?? "0") || 0,
        });
      } else {
        reject(new Error(`yt-dlp info failed (${code}): ${err.slice(0, 200)}`));
      }
    });
    ytdlp.on("error", reject);
  });
}

/**
 * GET /api/youtube/playlist-tracks?listId=
 */
youtubeRouter.get("/playlist-tracks", async (c) => {
  const listId = c.req.query("listId")?.trim();
  if (!listId || !/^[a-zA-Z0-9_-]+$/.test(listId)) {
    return c.json({ error: "Invalid playlist ID" }, 400);
  }
  try {
    const tracks = await getPlaylistTracks(listId);
    return c.json({ data: tracks });
  } catch (e) {
    console.error("[YouTube] playlist-tracks error:", e);
    return c.json({ error: "Failed to fetch playlist" }, 502);
  }
});

function getPlaylistTracks(listId: string): Promise<Array<{ videoId: string; title: string; channel: string; thumbnail: string; duration: number }>> {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn(YTDLP, [
      `https://music.youtube.com/playlist?list=${listId}`,
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      "--quiet",
    ]);

    const timeout = setTimeout(() => {
      ytdlp.kill("SIGKILL");
      reject(new Error("yt-dlp timed out fetching playlist"));
    }, 60_000);

    let output = "";
    let errOutput = "";
    ytdlp.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    ytdlp.stderr.on("data", (chunk: Buffer) => { errOutput += chunk.toString(); });
    ytdlp.on("close", (code: number | null) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`yt-dlp failed (${code}): ${errOutput.slice(0, 300)}`));
        return;
      }
      const tracks = output
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          try {
            const j = JSON.parse(line);
            const id: string = j.id ?? "";
            if (!id) return null;
            const thumbnails: Array<{ url: string }> = j.thumbnails ?? [];
            const thumb =
              thumbnails.length > 0
                ? thumbnails[thumbnails.length - 1].url
                : `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
            return {
              videoId: id,
              title: (j.title as string) ?? "Unknown",
              channel: (j.channel ?? j.uploader ?? "Unknown") as string,
              thumbnail: thumb,
              duration: (j.duration as number) ?? 0,
            };
          } catch {
            return null;
          }
        })
        .filter((t): t is NonNullable<typeof t> => t !== null);
      resolve(tracks);
    });
    ytdlp.on("error", (e: Error) => { clearTimeout(timeout); reject(e); });
  });
}

youtubeRouter.get("/new-releases", async (c) => {
  const maxResults = Math.min(parseInt(c.req.query("maxResults") ?? "20", 10), 50);
  const results = await fetchNewReleases(maxResults);
  return c.json({ data: results });
});

youtubeRouter.get("/playlists", async (c) => {
  const results = await fetchCuratedPlaylists();
  return c.json({ data: results });
});

youtubeRouter.get("/quota", (c) => {
  const stats = getQuotaStats();
  const cacheSize = getSearchCacheSize();
  const purged = purgeExpiredSearchCache();
  return c.json({
    data: {
      quota: {
        activeKey: `${stats.keyIndex}/${stats.totalKeys}`,
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
