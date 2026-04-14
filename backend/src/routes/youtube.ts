import { Hono } from "hono";
import YTDlpWrap from "yt-dlp-wrap";
import path from "path";
import os from "os";
import {
  getQuotaStats,
  getSearchCacheSize,
  purgeExpiredSearchCache,
  fetchNewReleases,
  fetchCuratedPlaylists,
  searchYouTube,
  getVideoInfoViaApi,
  getPlaylistTracksViaApi,
  isYouTubeApiAvailable,
} from "../services/youtubeService";

const youtubeRouter = new Hono();

const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{6,32}$/;
const YTDLP_BINARY_PATH = path.join(os.tmpdir(), "yt-dlp");
const ytDlp = new YTDlpWrap(YTDLP_BINARY_PATH);
const YTDLP_COOKIES_PATH = path.join(os.tmpdir(), "youtube-cookies.txt");

// Download the standalone yt-dlp binary on startup.
// yt-dlp_linux is self-contained — no python3 required at runtime.
(async () => {
  try {
    const fs = await import("fs");
    if (fs.existsSync(YTDLP_BINARY_PATH)) {
      console.log("[yt-dlp] binary already present at", YTDLP_BINARY_PATH);
    } else {
      console.log("[yt-dlp] downloading standalone binary...");
      // Pin to 2026.03.17 — the version that was "latest" when the working
      // Railway deploy d7e78237 was built. Newer yt-dlp releases introduced
      // an EJS signature-solver requirement that breaks downloads on Railway.
      const url = "https://github.com/yt-dlp/yt-dlp/releases/download/2026.03.17/yt-dlp_linux";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      fs.writeFileSync(YTDLP_BINARY_PATH, Buffer.from(buf), { mode: 0o755 });
      console.log("[yt-dlp] binary downloaded to", YTDLP_BINARY_PATH);
    }
    const cookiesB64 = process.env.YOUTUBE_COOKIES;
    if (cookiesB64) {
      fs.writeFileSync(YTDLP_COOKIES_PATH, Buffer.from(cookiesB64, "base64").toString("utf-8"));
      console.log("[yt-dlp] cookies written to", YTDLP_COOKIES_PATH);
    } else {
      console.warn("[yt-dlp] YOUTUBE_COOKIES not set — YouTube may block requests");
    }
  } catch (e: any) {
    console.error("[yt-dlp] startup error:", e.message);
  }
})();

// Returns cookie args if the cookie file was written, otherwise empty array
function cookieArgs(): string[] {
  try {
    const fs = require("fs");
    return fs.existsSync(YTDLP_COOKIES_PATH) ? ["--cookies", YTDLP_COOKIES_PATH] : [];
  } catch { return []; }
}

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
async function resolveAudioUrl(videoId: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const output = await ytDlp.execPromise([
      `https://www.youtube.com/watch?v=${videoId}`,
      "-f", "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio",
      "--get-url",
      "--no-playlist",
      "--quiet",
      "--extractor-args", "youtube:player_client=tv_embedded",
      "--js-runtimes", "node",
      ...cookieArgs(),
    ], {}, controller.signal);
    clearTimeout(timer);
    const url = output.trim().split("\n")[0];
    if (!url.startsWith("http")) throw new Error(`yt-dlp returned invalid URL`);
    return url;
  } catch (e: any) {
    clearTimeout(timer);
    console.error("[yt-dlp] resolveAudioUrl error:", e.message);
    throw new Error(`yt-dlp failed: ${e.message}`);
  }
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

  // Try multiple player_clients in order — YouTube's bot detection blocks
  // individual clients intermittently, so if ios fails we fall through to
  // tv → web → android. This dramatically improves download reliability.
  const PLAYER_CLIENTS = ["tv_embedded", "ios", "web", "android"] as const;

  const tryClient = async (client: string): Promise<{ ok: true; path: string } | { ok: false; reason: string }> => {
    // Clean up any partial files from a previous attempt so the --print
    // output only reports the file this attempt created.
    Bun.spawn(["sh", "-c", `rm -f ${tmpBase}.* 2>/dev/null`]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const output = await ytDlp.execPromise([
        `https://www.youtube.com/watch?v=${videoId}`,
        "-f", "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio",
        "--no-playlist",
        "-o", tmpTemplate,
        "--no-warnings",
        "--no-part",
        "--print", "after_move:filepath",
        "--extractor-args", `youtube:player_client=${client}`,
        "--js-runtimes", "node",
        ...cookieArgs(),
      ], {}, controller.signal);
      clearTimeout(timer);
      const finalPath = output.trim().split("\n").pop()?.trim() ?? "";
      if (finalPath) return { ok: true, path: finalPath };
      return { ok: false, reason: "yt-dlp produced no output file" };
    } catch (e: any) {
      clearTimeout(timer);
      const msg: string = e.message ?? "";
      if (msg.includes("aborted")) return { ok: false, reason: "Download timed out" };
      const errLine = msg.split("\n").find((l: string) => l.includes("ERROR:")) ?? "";
      const reason = errLine.replace(/^ERROR:\s*\[youtube\]\s*[\w-]+:\s*/, "").trim() || msg.slice(0, 200);
      return { ok: false, reason };
    }
  };

  let result: { ok: true; path: string } | { ok: false; reason: string } = {
    ok: false,
    reason: "no player clients tried",
  };
  const attempts: string[] = [];
  for (const client of PLAYER_CLIENTS) {
    const attempt = await tryClient(client);
    if (attempt.ok) {
      result = attempt;
      if (attempts.length > 0) {
        console.log(`[YouTube] download ${videoId}: succeeded with ${client} after ${attempts.join(", ")} failed`);
      }
      break;
    }
    attempts.push(`${client} (${attempt.reason.slice(0, 60)})`);
    result = attempt;
    // Don't bother trying other clients for errors that are permanent
    // for this video (private / unavailable / copyright removed).
    const r = attempt.reason.toLowerCase();
    if (r.includes("private") || r.includes("copyright") || r.includes("removed") || r.includes("unavailable")) {
      break;
    }
  }

  // Final cleanup in case we bailed out mid-attempt.
  if (!result.ok) {
    Bun.spawn(["sh", "-c", `rm -f ${tmpBase}.* 2>/dev/null`]);
  }

  if (!result.ok) {
    console.error(`[YouTube] download failed for ${videoId} after trying ${attempts.length} clients: ${result.reason}`);
    const r = result.reason.toLowerCase();
    let userMsg = "This track couldn't be downloaded right now";
    if (r.includes("unavailable")) userMsg = "Video is unavailable";
    else if (r.includes("sign in") || r.includes("bot")) userMsg = "YouTube blocked this download — try again later";
    else if (r.includes("private")) userMsg = "This video is private";
    else if (r.includes("timed out")) userMsg = "Download timed out — try again";
    else if (r.includes("copyright") || r.includes("removed")) userMsg = "Video removed due to copyright";
    else if (r.includes("format") || r.includes("no video")) userMsg = "No compatible audio format found";
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

async function searchYouTubeYtDlp(query: string, maxResults: number): Promise<Array<{
  videoId: string; title: string; channelName: string; thumbnailUrl: string; publishedAt: string; searchQuery: string;
}>> {
  const fetchCount = Math.min(maxResults * 3, 50);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let output: string;
  try {
    output = await ytDlp.execPromise([
      `ytsearch${fetchCount}:${query}`,
      "--dump-json", "--flat-playlist", "--quiet", "--no-warnings",
    ], {}, controller.signal);
    clearTimeout(timer);
  } catch (e: any) {
    clearTimeout(timer);
    throw new Error(`yt-dlp search failed: ${e.message}`);
  }
  return output.trim().split("\n").filter(l => l.trim()).flatMap(line => {
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
}

/**
 * GET /api/youtube/info/:videoId
 */
youtubeRouter.get("/info/:videoId", async (c) => {
  const videoId = c.req.param("videoId");
  if (!videoId || !VIDEO_ID_RE.test(videoId)) {
    return c.json({ error: "Invalid YouTube video ID" }, 400);
  }

  // 1. Prefer the YouTube Data API — it's not subject to the bot-detection
  //    challenge that yt-dlp hits on datacenter IPs.
  if (isYouTubeApiAvailable()) {
    const apiInfo = await getVideoInfoViaApi(videoId);
    if (apiInfo) return c.json({ data: apiInfo });
    console.warn("[YouTube] API fallback — video not found or API unavailable, trying yt-dlp");
  }

  // 2. Fall back to yt-dlp, trying multiple player clients since YouTube
  //    blocks some of them with "Sign in to confirm you're not a bot".
  try {
    const info = await getVideoInfo(videoId);
    return c.json({ data: info });
  } catch (e) {
    console.error("[YouTube] info error:", e);
    const msg = e instanceof Error ? e.message : "Failed to get video info";
    return c.json({ error: msg }, 502);
  }
});

const YT_DLP_CLIENT_FALLBACKS = [
  "tv_embedded",
  "ios",
  "android",
  "web_safari",
  "mweb",
];

async function getVideoInfo(videoId: string): Promise<{ title: string; channel: string; thumbnail: string; duration: number }> {
  const baseArgs = [
    `https://www.youtube.com/watch?v=${videoId}`,
    "--print", "%(title)s",
    "--print", "%(uploader)s",
    "--print", "%(thumbnail)s",
    "--print", "%(duration)s",
    "--no-playlist",
    "--quiet",
    "--no-warnings",
  ];

  let lastError: Error | null = null;
  for (const client of YT_DLP_CLIENT_FALLBACKS) {
    try {
      const output = await ytDlp.execPromise([
        ...baseArgs,
        "--extractor-args", `youtube:player_client=${client}`,
        "--js-runtimes", "node",
        ...cookieArgs(),
      ]);
      const lines = output.trim().split("\n");
      if (lines.length < 3) throw new Error(`yt-dlp info returned insufficient output`);
      return {
        title: lines[0] ?? "Unknown Title",
        channel: lines[1] ?? "Unknown Artist",
        thumbnail: lines[2] ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        duration: parseInt(lines[3] ?? "0") || 0,
      };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(`[yt-dlp] info client=${client} failed:`, lastError.message.split("\n")[0]);
    }
  }
  throw lastError ?? new Error("yt-dlp info failed for all player clients");
}

/**
 * GET /api/youtube/playlist-tracks?listId=
 */
youtubeRouter.get("/playlist-tracks", async (c) => {
  const listId = c.req.query("listId")?.trim();
  if (!listId || !/^[a-zA-Z0-9_-]+$/.test(listId)) {
    return c.json({ error: "Invalid playlist ID" }, 400);
  }

  // 1. Prefer the YouTube Data API v3.
  if (isYouTubeApiAvailable()) {
    const apiTracks = await getPlaylistTracksViaApi(listId);
    if (apiTracks && apiTracks.length > 0) {
      return c.json({ data: apiTracks });
    }
    console.warn("[YouTube] API playlist fallback — empty or unavailable, trying yt-dlp");
  }

  // 2. Fall back to yt-dlp.
  try {
    const tracks = await getPlaylistTracks(listId);
    return c.json({ data: tracks });
  } catch (e) {
    console.error("[YouTube] playlist-tracks error:", e);
    const msg = e instanceof Error ? e.message : "Failed to fetch playlist";
    return c.json({ error: msg }, 502);
  }
});

async function getPlaylistTracks(listId: string): Promise<Array<{ videoId: string; title: string; channel: string; thumbnail: string; duration: number }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let output: string;
  try {
    output = await ytDlp.execPromise([
      `https://music.youtube.com/playlist?list=${listId}`,
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      "--quiet",
    ], {}, controller.signal);
    clearTimeout(timer);
  } catch (e: any) {
    clearTimeout(timer);
    throw new Error(`yt-dlp playlist failed: ${e.message}`);
  }
  return output
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
