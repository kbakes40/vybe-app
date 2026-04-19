import fs from "fs";
import os from "os";
import path from "path";

/** yt-dlp `--cookies` path (Netscape format). */
export const YTDLP_COOKIES_PATH = path.join(os.tmpdir(), "youtube-cookies.txt");

/** Domains we forward cookies for when proxying googlevideo / YouTube CDN. */
const YOUTUBE_COOKIE_RELATED_SUFFIXES = [
  "youtube.com",
  "googlevideo.com",
  "ytimg.com",
  "ggpht.com",
  "google.com",
];

function hostMatchesCookieDomain(hostname: string, cookieDomain: string): boolean {
  const raw = cookieDomain.trim().toLowerCase();
  if (!raw || raw.startsWith("#")) return false;
  const host = hostname.toLowerCase();
  const bare = raw.startsWith(".") ? raw.slice(1) : raw;
  return host === bare || host.endsWith(`.${bare}`);
}

function hostnameNeedsYoutubeCookies(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return YOUTUBE_COOKIE_RELATED_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}

/**
 * Build a `Cookie` header value from the Netscape cookie file for the given host
 * (googlevideo, youtube CDN, etc.). Used by the `/api/youtube/audio` proxy so
 * upstream requests authenticate like a signed-in browser.
 */
export function buildCookieHeaderForYoutubeUpstream(targetHostname: string): string {
  ensureYoutubeCookiesFile();
  try {
    if (!fs.existsSync(YTDLP_COOKIES_PATH)) return "";
    if (!hostnameNeedsYoutubeCookies(targetHostname)) return "";
    const text = fs.readFileSync(YTDLP_COOKIES_PATH, "utf-8");
    const pairs: string[] = [];
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const parts = line.split("\t");
      if (parts.length < 7) continue;
      let domain = parts[0] ?? "";
      if (domain.startsWith("#HttpOnly_")) domain = domain.slice("#HttpOnly_".length);
      if (!hostMatchesCookieDomain(targetHostname, domain)) continue;
      const name = parts[5];
      const value = parts[6];
      if (!name) continue;
      pairs.push(`${name}=${value}`);
    }
    return pairs.join("; ");
  } catch {
    return "";
  }
}

/** Browser-like headers for fetching YouTube CDN / media URLs through our proxy. */
export function buildYoutubeUpstreamFetchHeaders(
  directUrl: string,
  opts?: { rangeHeader?: string | undefined },
): Record<string, string> {
  let hostname = "";
  try {
    hostname = new URL(directUrl).hostname;
  } catch {
    return {};
  }
  const cookie = buildCookieHeaderForYoutubeUpstream(hostname);
  const h: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://www.youtube.com/",
    Origin: "https://www.youtube.com",
  };
  if (opts?.rangeHeader) h.Range = opts.rangeHeader;
  if (cookie) h.Cookie = cookie;
  return h;
}

let warnedMissing = false;

/**
 * Writes `youtube-cookies.txt` from env for yt-dlp.
 * Set **`YOUTUBE_COOKIES`** or **`YOUTUBE_COOKIES_BASE64`** to the **base64** of your `youtube-cookies.txt` file.
 */
export function ensureYoutubeCookiesFile(): boolean {
  const b64 = (process.env.YOUTUBE_COOKIES ?? process.env.YOUTUBE_COOKIES_BASE64 ?? "").trim();
  if (!b64) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        "[yt-dlp] YOUTUBE_COOKIES / YOUTUBE_COOKIES_BASE64 not set — private / age-gated YouTube may fail",
      );
    }
    return false;
  }
  try {
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    fs.writeFileSync(YTDLP_COOKIES_PATH, decoded, { encoding: "utf-8" });
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[yt-dlp] failed to write cookies file:", msg);
    return false;
  }
}

/** Args appended to yt-dlp when the cookie file exists. */
export function cookieArgsForYtdlp(): string[] {
  ensureYoutubeCookiesFile();
  try {
    return fs.existsSync(YTDLP_COOKIES_PATH) ? ["--cookies", YTDLP_COOKIES_PATH] : [];
  } catch {
    return [];
  }
}
