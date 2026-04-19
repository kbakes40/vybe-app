/**
 * Route shield middleware: prevents Hono routes from ever returning a 502 to
 * the client when the upstream stalls or throws. Two layers of protection:
 *
 *  1. **Hard deadline** — every request gets a per-route timeout. If the
 *     handler doesn't resolve in time, we synthesize a stable JSON envelope
 *     using the route's `stableFallback` factory.
 *  2. **Last-known-good cache** — when the handler succeeds with a useful
 *     payload we snapshot it. If a future request times out OR the handler
 *     throws, we serve the snapshot first and fall back to `stableFallback`
 *     only when no snapshot exists.
 *
 * Used for /api/soundcloud/* and /api/discovery/* — these endpoints feed the
 * Home / Search / Discover rails and a 502 from them turns the entire app
 * into cyan skeletons. Better to serve last-known-good or an empty array.
 */
import type { Context, MiddlewareHandler } from "hono";

export interface RouteShieldOptions {
  /** Hard deadline in ms before we synthesize a fallback response. */
  timeoutMs: number;
  /**
   * Build the body to return when neither a fresh response nor a cached
   * snapshot exists. MUST return JSON-serializable data; the shield wraps it
   * as `{ data: <stableFallback()> }` to match the app's API envelope.
   */
  stableFallback: (c: Context) => unknown;
  /**
   * Optional cache key (defaults to `${method} ${path}?${search}`). Override
   * this to share snapshots across query-string variants if useful.
   */
  cacheKey?: (c: Context) => string;
  /** TTL for last-known-good snapshots, default 5 minutes. */
  snapshotTtlMs?: number;
}

interface Snapshot {
  body: string;
  contentType: string;
  status: number;
  expires: number;
}

const snapshots = new Map<string, Snapshot>();

function defaultKey(c: Context): string {
  const u = new URL(c.req.url);
  return `${c.req.method} ${u.pathname}${u.search}`;
}

function envelope(data: unknown): string {
  return JSON.stringify({ data });
}

/**
 * Create a middleware that shields a Hono route group from upstream timeouts
 * and exceptions. Apply with `app.use("/api/soundcloud/*", routeShield(...))`
 * BEFORE mounting the actual router.
 */
export function routeShield(opts: RouteShieldOptions): MiddlewareHandler {
  const ttl = opts.snapshotTtlMs ?? 5 * 60 * 1000;
  const keyOf = opts.cacheKey ?? defaultKey;

  return async (c, next) => {
    const key = keyOf(c);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;
    const handlerPromise = (async () => {
      try {
        await next();
      } catch (err) {
        // Re-throw so the outer race sees it; we'll catch below.
        throw err;
      }
    })();

    const timeoutPromise = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => {
        timedOut = true;
        resolve("timeout");
      }, opts.timeoutMs);
    });

    let outcome: "ok" | "timeout" | "error" = "ok";
    let caughtError: unknown = null;

    try {
      const winner = await Promise.race([
        handlerPromise.then(() => "ok" as const),
        timeoutPromise,
      ]);
      outcome = winner;
    } catch (err) {
      outcome = "error";
      caughtError = err;
    } finally {
      if (timer) clearTimeout(timer);
    }

    // Path A — handler finished within deadline. Snapshot if it's a healthy
    // 2xx JSON response so future timeouts can serve last-known-good.
    if (outcome === "ok" && !timedOut) {
      const res = c.res;
      if (res && res.status >= 200 && res.status < 300) {
        try {
          const cloned = res.clone();
          const ct = cloned.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            const body = await cloned.text();
            // Don't snapshot empty/null payloads — they aren't useful as
            // fallbacks and would mask transient blank responses forever.
            if (body && body.length > 2 && body !== '{"data":null}' && body !== '{"data":[]}') {
              snapshots.set(key, {
                body,
                contentType: ct,
                status: res.status,
                expires: Date.now() + ttl,
              });
            }
          }
        } catch {
          // Snapshotting is best-effort; never block the response.
        }
      }
      return;
    }

    // Path B — handler timed out OR threw. Serve last-known-good if we have
    // one, otherwise synthesize a stable empty envelope. Either way, this is
    // the route's NEW response — overwrite c.res.
    const cached = snapshots.get(key);
    if (cached && cached.expires > Date.now()) {
      console.log(
        `[route-shield] ${outcome} on ${key} → serving cached snapshot (age ${Math.round((Date.now() - (cached.expires - ttl)) / 1000)}s)`,
      );
      c.res = new Response(cached.body, {
        status: cached.status,
        headers: {
          "content-type": cached.contentType,
          "x-vybe-shield": "snapshot",
        },
      });
      return;
    }

    let fallbackBody: string;
    try {
      fallbackBody = envelope(opts.stableFallback(c));
    } catch (err) {
      console.error("[route-shield] stableFallback threw:", err);
      fallbackBody = envelope([]);
    }

    if (outcome === "error") {
      console.error(`[route-shield] handler threw on ${key}:`, caughtError);
    } else {
      console.log(`[route-shield] timeout (${opts.timeoutMs}ms) on ${key} → stable fallback`);
    }

    c.res = new Response(fallbackBody, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-vybe-shield": outcome === "timeout" ? "timeout-fallback" : "error-fallback",
      },
    });
  };
}
