import { Hono } from "hono";
import type { Context } from "hono";
import { randomUUID } from "node:crypto";

const bandcampRouter = new Hono();

/** Preview streams are only ever served from bcbits — block open proxies. */
const BCBITS_HOST_RE = /^([a-z0-9-]+\.)?bcbits\.com$/i;

const UPSTREAM_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const SESSION_TTL_MS = 20 * 60 * 1000;
type Session = { streamUrl: string; ref: string; exp: number };
const sessions = new Map<string, Session>();

function gcSessions() {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (v.exp < now) sessions.delete(k);
  }
}

function sanitizeBandcampReferer(raw: string): { referer: string; origin: string } {
  const fallback = { referer: "https://bandcamp.com/", origin: "https://bandcamp.com" };
  try {
    const u = new URL(raw.trim());
    if (!/^([a-z0-9-]+\.)?bandcamp\.com$/i.test(u.hostname)) return fallback;
    const path = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
    const referer = `${u.origin}${path}`;
    return { referer, origin: u.origin };
  } catch {
    return fallback;
  }
}

function parseAllowedStreamUrl(urlParam: string): URL | { err: Response } {
  if (!urlParam?.trim()) {
    return { err: Response.json({ error: { message: "Missing url", code: "MISSING_URL" } }, { status: 400 }) };
  }
  let streamUrl: URL;
  try {
    streamUrl = new URL(urlParam.trim());
  } catch {
    return { err: Response.json({ error: { message: "Invalid url", code: "BAD_URL" } }, { status: 400 }) };
  }
  if (streamUrl.protocol !== "https:") {
    return { err: Response.json({ error: { message: "HTTPS only", code: "BAD_SCHEME" } }, { status: 400 }) };
  }
  if (!BCBITS_HOST_RE.test(streamUrl.hostname)) {
    return { err: Response.json({ error: { message: "Host not allowed", code: "FORBIDDEN_HOST" } }, { status: 403 }) };
  }
  return streamUrl;
}

/**
 * POST /api/bandcamp/session
 * Body: { "url": "<bcbits https>", "ref": "<bandcamp album url>" }
 * Returns { "token": "<uuid>" } — use GET /api/bandcamp/stream/:token for playback when the
 * query-string proxy URL would exceed mobile URL limits.
 */
bandcampRouter.post("/session", async (c) => {
  gcSessions();
  let body: { url?: string; ref?: string };
  try {
    body = (await c.req.json()) as { url?: string; ref?: string };
  } catch {
    return c.json({ error: { message: "Invalid JSON", code: "BAD_JSON" } }, 400);
  }
  const parsed = parseAllowedStreamUrl(body.url ?? "");
  if ("err" in parsed) return parsed.err;
  const refParam = typeof body.ref === "string" && body.ref.trim() ? body.ref.trim() : "https://bandcamp.com/";
  const token = randomUUID();
  sessions.set(token, { streamUrl: parsed.toString(), ref: refParam, exp: Date.now() + SESSION_TTL_MS });
  return c.json({ token });
});

/**
 * GET /api/bandcamp/stream/:token
 * Same proxy as /audio but stream URL was registered via POST /session.
 */
bandcampRouter.get("/stream/:token", async (c) => {
  gcSessions();
  const token = c.req.param("token");
  const sess = sessions.get(token);
  if (!sess || sess.exp < Date.now()) {
    return c.json({ error: { message: "Invalid or expired session", code: "BAD_TOKEN" } }, 404);
  }
  let streamUrl: URL;
  try {
    streamUrl = new URL(sess.streamUrl);
  } catch {
    sessions.delete(token);
    return c.json({ error: { message: "Bad session url", code: "BAD_SESSION" } }, 500);
  }
  if (!BCBITS_HOST_RE.test(streamUrl.hostname)) {
    sessions.delete(token);
    return c.json({ error: { message: "Host not allowed", code: "FORBIDDEN_HOST" } }, 403);
  }
  return forwardBandcampStream(c, streamUrl, sess.ref);
});

/**
 * GET /api/bandcamp/audio?url=<stream>&ref=<album page>
 * Proxies Bandcamp preview MP3 with Range — iOS AVPlayer expects 206 + Content-Range.
 */
bandcampRouter.get("/audio", async (c) => {
  const urlParam = c.req.query("url") ?? "";
  const parsed = parseAllowedStreamUrl(urlParam);
  if ("err" in parsed) return parsed.err;
  const refParam = c.req.query("ref") ?? "https://bandcamp.com/";
  return forwardBandcampStream(c, parsed, refParam);
});

async function forwardBandcampStream(c: Context, streamUrl: URL, refParam: string) {
  const { referer, origin } = sanitizeBandcampReferer(refParam);

  const rangeHeader = c.req.header("Range");
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": UPSTREAM_UA,
    Referer: referer,
    Origin: origin,
    Accept: "*/*",
  };
  if (rangeHeader) upstreamHeaders.Range = rangeHeader;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 28_000);
  let upstream: Response;
  try {
    upstream = await fetch(streamUrl.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      redirect: "follow",
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : "fetch failed";
    console.error("[Bandcamp] audio fetch error:", msg);
    return Response.json({ error: { message: msg, code: "UPSTREAM_FETCH" } }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok && upstream.status !== 206) {
    console.warn("[Bandcamp] audio upstream", upstream.status, streamUrl.hostname);
    return Response.json(
      { error: { message: `Upstream HTTP ${upstream.status}`, code: "UPSTREAM_STATUS" } },
      { status: 502 },
    );
  }

  if (!upstream.body) {
    return Response.json({ error: { message: "Empty upstream body", code: "EMPTY" } }, { status: 502 });
  }

  const contentType = upstream.headers.get("Content-Type") ?? "audio/mpeg";
  const baseHdr: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
    "X-Accel-Buffering": "no",
  };

  const cl = upstream.headers.get("Content-Length");
  const cr = upstream.headers.get("Content-Range");
  const ar = upstream.headers.get("Accept-Ranges");

  /** expo-av often stalls on chunked MP3 with no Content-Length — buffer previews (small). */
  const MAX_BUFFER = 16 * 1024 * 1024;
  const shouldBuffer =
    upstream.status === 200 && !cl && !rangeHeader && typeof upstream.body?.getReader === "function";

  if (shouldBuffer) {
    try {
      const buf = await new Response(upstream.body).arrayBuffer();
      if (buf.byteLength === 0) {
        return Response.json({ error: { message: "Empty audio", code: "EMPTY" } }, { status: 502 });
      }
      if (buf.byteLength > MAX_BUFFER) {
        return Response.json({ error: { message: "Audio too large", code: "TOO_LARGE" } }, { status: 413 });
      }
      return new Response(buf, {
        status: 200,
        headers: {
          ...baseHdr,
          "Content-Length": String(buf.byteLength),
          "Accept-Ranges": "bytes",
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "buffer failed";
      console.error("[Bandcamp] buffer error:", msg);
      return Response.json({ error: { message: msg, code: "BUFFER" } }, { status: 502 });
    }
  }

  const out = { ...baseHdr };
  if (cl) out["Content-Length"] = cl;
  if (cr) out["Content-Range"] = cr;
  if (ar) out["Accept-Ranges"] = ar;
  else if (upstream.status === 200 && cl) out["Accept-Ranges"] = "bytes";

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export { bandcampRouter };
