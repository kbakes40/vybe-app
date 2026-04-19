import { Hono } from "hono";
import YTDlpWrap from "yt-dlp-wrap";
import path from "path";
import os from "os";
import {
  cookieArgsForYtdlp,
  buildYoutubeUpstreamFetchHeaders,
  ensureYoutubeCookiesFile,
} from "../lib/youtubeCookies";
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

/**
 * Browser User-Agent injected into every yt-dlp call.
 *
 * YouTube's anti-bot system fingerprints requests using UA + cookies + the
 * player_client. When we present the cookies of a real signed-in `web`
 * browser session, YouTube also expects a matching desktop Chrome UA. Sending
 * yt-dlp's default UA here is what triggers many of the
 * "Sign in to confirm you're not a bot" / "Requested format is not available"
 * failures we hit on the Railway egress IP.
 */
const YTDLP_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Common yt-dlp args for every call: browser UA + cert relaxation + cookies. */
function commonYtdlpArgs(): string[] {
  return [
    "--user-agent",
    YTDLP_BROWSER_UA,
    "--no-check-certificate",
    ...cookieArgsForYtdlp(),
  ];
}

// Download the standalone yt-dlp binary on startup.
// yt-dlp_linux is self-contained — no python3 required at runtime.
(async () => {
  try {
    const fs = await import("fs");
    if (fs.existsSync(YTDLP_BINARY_PATH)) {
      console.log("[yt-dlp] binary already present at", YTDLP_BINARY_PATH);
    } else {
      console.log("[yt-dlp] downloading standalone binary...");
      const url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      fs.writeFileSync(YTDLP_BINARY_PATH, Buffer.from(buf), { mode: 0o755 });
      console.log("[yt-dlp] binary downloaded to", YTDLP_BINARY_PATH);
    }
  } catch (e: any) {
    console.error("[yt-dlp] startup error:", e.message);
  }
})();

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

/** Match download route — YouTube blocks datacenter IPs on some clients only.
 *  Fast tier races in parallel (fastest wins, losers aborted).
 *  Slow tier is a sequential fallback if every fast client fails. */
/**
 * Player client racing tiers.
 *
 * When cookies are configured (`YOUTUBE_COOKIES`) the `web` client is the most
 * authentic — browser cookies were extracted from a `web` session, so YouTube's
 * bot-detection treats `web` as the signed-in surface. We promote `web` to the
 * fast tier in that case. Without cookies we keep the original mobile-first
 * order which is more resilient to anonymous bot blocks.
 */
function getFastClients(): readonly string[] {
  const hasCookies = cookieArgsForYtdlp().length > 0;
  return hasCookies
    ? (["web", "ios", "tv_embedded"] as const)
    : (["tv_embedded", "ios", "android"] as const);
}
function getSlowClients(): readonly string[] {
  const hasCookies = cookieArgsForYtdlp().length > 0;
  return hasCookies
    ? (["mweb", "android"] as const)
    : (["web", "mweb"] as const);
}
const YTDLP_RESOLVE_FAST_TIMEOUT_MS = 10_000;
const YTDLP_RESOLVE_SLOW_TIMEOUT_MS = 15_000;

/** Run yt-dlp --get-url for a single player_client and return the CDN URL. */
function tryResolveWithClient(
  videoId: string,
  client: string,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): { promise: Promise<string>; abort: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  const promise = ytDlp
    .execPromise(
      [
        `https://www.youtube.com/watch?v=${videoId}`,
        "-f",
        // Bias to iOS-native m4a/aac first; keep loose fallbacks so we don't
        // hit "Requested format is not available" on weirder uploads.
        "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best/bestaudio*/best*",
        "--get-url",
        "--no-playlist",
        "--no-warnings",
        "--quiet",
        "--socket-timeout",
        "8",
        "--extractor-args",
        `youtube:player_client=${client}`,
        "--js-runtimes",
        "node",
        ...commonYtdlpArgs(),
      ],
      {},
      controller.signal,
    )
    .then((output) => {
      clearTimeout(timer);
      const url = output.trim().split("\n")[0]?.trim() ?? "";
      if (!url.startsWith("http")) throw new Error("yt-dlp returned non-URL output");
      return url;
    })
    .catch((e: any) => {
      clearTimeout(timer);
      throw new Error(e?.message ?? String(e));
    });

  return { promise, abort: () => controller.abort() };
}

/**
 * Resolve a YouTube videoId to a direct CDN audio URL using yt-dlp.
 * Phase 1: race the 3 most reliable clients in parallel (first URL wins,
 *          the other child processes are aborted immediately).
 * Phase 2: if every fast client fails, fall back to web/mweb sequentially.
 */
async function resolveAudioUrl(videoId: string): Promise<string> {
  const fastClients = getFastClients();
  const slowClients = getSlowClients();

  const attempts = fastClients.map((client) => {
    const { promise, abort } = tryResolveWithClient(
      videoId,
      client,
      YTDLP_RESOLVE_FAST_TIMEOUT_MS,
    );
    return {
      client,
      abort,
      promise: promise.then((url) => ({ client, url })),
    };
  });

  try {
    const winner = await Promise.any(attempts.map((a) => a.promise));
    for (const a of attempts) {
      if (a.client !== winner.client) a.abort();
    }
    if (winner.client !== fastClients[0]) {
      console.log(`[yt-dlp] resolve ${videoId}: fast-race won by player_client=${winner.client}`);
    }
    return winner.url;
  } catch (e) {
    const fastErr = e instanceof AggregateError
      ? e.errors.map((er: any) => (er?.message ?? String(er)).split("\n")[0]).join(" | ")
      : String(e);
    console.warn(`[yt-dlp] resolve ${videoId}: fast tier exhausted — ${fastErr.slice(0, 240)}`);
  }

  let lastMsg = "";
  for (const client of slowClients) {
    try {
      const { promise } = tryResolveWithClient(
        videoId,
        client,
        YTDLP_RESOLVE_SLOW_TIMEOUT_MS,
      );
      const url = await promise;
      console.log(`[yt-dlp] resolve ${videoId}: slow fallback ok with player_client=${client}`);
      return url;
    } catch (e: any) {
      lastMsg = e.message ?? String(e);
      console.warn(
        `[yt-dlp] resolve ${videoId} slow client=${client}:`,
        lastMsg.split("\n")[0]?.slice(0, 160),
      );
    }
  }

  console.error("[yt-dlp] resolveAudioUrl exhausted all clients:", lastMsg.split("\n")[0]);
  throw new Error(`yt-dlp failed: ${lastMsg}`);
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

  const rangeHeader = c.req.header("Range");
  const MAX_AUDIO_PROXY_ATTEMPTS = 3;
  let upstream: Response | null = null;
  let lastDirectUrl = "";
  let lastError: string | null = null;

  for (let attempt = 0; attempt < MAX_AUDIO_PROXY_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      urlCache.delete(videoId);
      ensureYoutubeCookiesFile();
      console.warn(`[YouTube] audio proxy retry ${attempt}/${MAX_AUDIO_PROXY_ATTEMPTS - 1} for ${videoId}`);
    }

    let directUrl: string;
    try {
      directUrl = await getAudioUrl(videoId);
      lastDirectUrl = directUrl;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = msg;
      console.error("[YouTube] Failed to resolve CDN URL:", e);
      continue;
    }

    const upstreamHeaders = buildYoutubeUpstreamFetchHeaders(directUrl, { rangeHeader });
    const cdnAbort = new AbortController();
    const cdnTimeout = setTimeout(() => cdnAbort.abort(), 45_000);
    let res: Response;
    try {
      res = await fetch(directUrl, { headers: upstreamHeaders, signal: cdnAbort.signal });
    } catch (e: unknown) {
      clearTimeout(cdnTimeout);
      const msg = e instanceof Error ? e.message : String(e);
      lastError = msg;
      console.error("[YouTube] CDN fetch failed:", e);
      continue;
    }
    clearTimeout(cdnTimeout);

    upstream = res;
    if (res.ok) break;

    const retryable =
      res.status === 403 ||
      res.status === 404 ||
      res.status === 429 ||
      res.status === 502 ||
      res.status === 503;
    lastError = `HTTP ${res.status}`;
    if (!retryable) break;
  }

  if (!upstream || !upstream.ok) {
    console.error("[YouTube] audio proxy exhausted retries", {
      videoId,
      lastDirectUrl: lastDirectUrl ? `${lastDirectUrl.slice(0, 64)}…` : "",
      lastError,
    });
    return c.json({ error: lastError ?? "Failed to fetch audio from CDN" }, 502);
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
        "-f", "bestaudio[ext=m4a]/bestaudio[acodec=aac]/bestaudio/best/bestaudio*/best*",
        "--no-playlist",
        "-o", tmpTemplate,
        "--no-warnings",
        "--no-part",
        "--print", "after_move:filepath",
        "--extractor-args", `youtube:player_client=${client}`,
        "--js-runtimes", "node",
        ...commonYtdlpArgs(),
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

/** ytsearch on Railway needs cookies + rotating clients; otherwise we fall through to Data API and burn invalid keys. */
const YTDLP_SEARCH_CLIENTS = ["web", "tv_embedded", "ios", "android", "mweb"] as const;

function parseYtsearchJsonLines(
  output: string,
  maxResults: number,
  searchQuery: string,
): Array<{
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
  searchQuery: string;
}> {
  return output
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .flatMap((line) => {
      try {
        const j = JSON.parse(line) as Record<string, unknown>;
        let videoId = typeof j.id === "string" ? j.id : "";
        if (!videoId && typeof j.url === "string") {
          const m = j.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
          if (m) videoId = m[1];
        }
        if (!videoId || !/^[a-zA-Z0-9_-]{6,32}$/.test(videoId)) return [];
        const duration = typeof j.duration === "number" ? j.duration : 0;
        if (duration > 480) return [];
        return [
          {
            videoId,
            title: String(j.title ?? ""),
            channelName: String(j.uploader ?? j.channel ?? j.uploader_id ?? ""),
            thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            publishedAt: "",
            searchQuery,
          },
        ];
      } catch {
        return [];
      }
    })
    .slice(0, maxResults);
}

async function searchYouTubeYtDlp(query: string, maxResults: number): Promise<Array<{
  videoId: string; title: string; channelName: string; thumbnailUrl: string; publishedAt: string; searchQuery: string;
}>> {
  const safeQuery = query.replace(/[\r\n\0]/g, " ").trim().slice(0, 200);
  if (!safeQuery) return [];

  const fetchCount = Math.min(Math.max(maxResults * 3, 15), 50);
  let lastErr = "";

  for (const client of YTDLP_SEARCH_CLIENTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const output = await ytDlp.execPromise(
        [
          `ytsearch${fetchCount}:${safeQuery}`,
          "--dump-json",
          "--flat-playlist",
          "--quiet",
          "--no-warnings",
          "--extractor-args",
          `youtube:player_client=${client}`,
          "--js-runtimes",
          "node",
          ...commonYtdlpArgs(),
        ],
        {},
        controller.signal,
      );
      clearTimeout(timer);
      const rows = parseYtsearchJsonLines(output, maxResults, safeQuery);
      if (rows.length > 0) {
        if (client !== YTDLP_SEARCH_CLIENTS[0]) {
          console.log(`[yt-dlp] search "${safeQuery.slice(0, 40)}…" ok with player_client=${client} (${rows.length} results)`);
        }
        return rows;
      }
    } catch (e: any) {
      clearTimeout(timer);
      lastErr = e.message ?? String(e);
      console.warn(
        `[yt-dlp] search client=${client}:`,
        lastErr.split("\n")[0]?.slice(0, 160),
      );
    }
  }

  if (lastErr) console.error("[yt-dlp] search exhausted all clients:", lastErr.split("\n")[0]?.slice(0, 200));
  return [];
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
  "ios",
  "android",
  "web_safari",
  "mweb",
  "tv_embedded",
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
        ...commonYtdlpArgs(),
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

/** List-view row: minimal fields for clients (id + playback URL). */
function toPlaylistTrackSlim(t: {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
}) {
  const id = t.videoId;
  return {
    id,
    title: t.title,
    artist: t.channel,
    artwork: t.thumbnail,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
    duration: Math.floor(Number(t.duration)) || 0,
  };
}

/**
 * GET /api/youtube/playlist-tracks?listId=
 */
youtubeRouter.get("/playlist-tracks", async (c) => {
  const listId = c.req.query("listId")?.trim();
  if (!listId || !/^[a-zA-Z0-9_-]+$/.test(listId)) {
    return c.json({ error: "Invalid playlist ID" }, 400);
  }

  const cacheHeaders = () => {
    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  };

  // 1. Prefer the YouTube Data API v3.
  if (isYouTubeApiAvailable()) {
    const apiTracks = await getPlaylistTracksViaApi(listId);
    if (apiTracks && apiTracks.length > 0) {
      cacheHeaders();
      return c.json({ data: apiTracks.map(toPlaylistTrackSlim) });
    }
    console.warn("[YouTube] API playlist fallback — empty or unavailable, trying yt-dlp");
  }

  // 2. Fall back to yt-dlp.
  try {
    const tracks = await getPlaylistTracks(listId);
    cacheHeaders();
    return c.json({ data: tracks.map(toPlaylistTrackSlim) });
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
      ...commonYtdlpArgs(),
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
