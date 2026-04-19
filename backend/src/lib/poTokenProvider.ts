/**
 * PO Token provider client for yt-dlp.
 *
 * YouTube's 2026 anti-bot wall enforces "Proof of Origin" (PO) tokens at
 * the CDN layer for many tracks. yt-dlp can hand the token through to the
 * `googlevideo.com` URL signature so the CDN actually serves bytes.
 *
 * Tokens are minted by a sidecar HTTP service (e.g. `bgutil-pot-provider`
 * deployed as a separate Railway service). We cache per-videoId tokens for
 * 4h since they're tied to the video's `gvs` (Google Video Server) context
 * and remain valid for the same lifetime as the CDN URL.
 *
 * Set `POT_PROVIDER_URL` to enable. If unset, all calls return null and
 * the caller falls back to the cookie-less ios/tv path that works for
 * un-flagged tracks.
 */

const POT_PROVIDER_URL = (process.env.POT_PROVIDER_URL ?? "").trim().replace(/\/+$/, "");
const POT_PROVIDER_TIMEOUT_MS = 4_000;
const POT_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export interface PoTokenBundle {
  /** The PO token to pass to yt-dlp via --extractor-args po_token=... */
  poToken: string;
  /** YouTube visitor data; sometimes returned alongside the PO token. */
  visitorData?: string;
  /** When this bundle expires (ms since epoch). */
  expiresAt: number;
}

interface CacheEntry {
  bundle: PoTokenBundle;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<PoTokenBundle | null>>();

export function isPoTokenProviderConfigured(): boolean {
  return POT_PROVIDER_URL.length > 0;
}

/**
 * Fetch a PO token bundle for the given videoId.
 *
 * Returns null if:
 * - `POT_PROVIDER_URL` is not configured
 * - The provider responds with an error
 * - The provider times out (4s)
 *
 * On null, callers should fall back to their cookie-less retry path.
 */
export async function getPoTokenForVideo(videoId: string): Promise<PoTokenBundle | null> {
  if (!isPoTokenProviderConfigured()) return null;

  const cached = cache.get(videoId);
  if (cached && Date.now() < cached.bundle.expiresAt) {
    return cached.bundle;
  }

  let pending = inflight.get(videoId);
  if (pending) return pending;

  pending = (async (): Promise<PoTokenBundle | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POT_PROVIDER_TIMEOUT_MS);
    try {
      const url = `${POT_PROVIDER_URL}/get_pot?content_binding=${encodeURIComponent(videoId)}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        console.warn(`[POT] provider HTTP ${res.status} for ${videoId}`);
        return null;
      }
      const json = (await res.json()) as { po_token?: string; poToken?: string; visitor_data?: string; visitorData?: string };
      const poToken = json.po_token ?? json.poToken;
      if (!poToken) {
        console.warn(`[POT] provider returned no token for ${videoId}`);
        return null;
      }
      const bundle: PoTokenBundle = {
        poToken,
        visitorData: json.visitor_data ?? json.visitorData,
        expiresAt: Date.now() + POT_CACHE_TTL_MS,
      };
      cache.set(videoId, { bundle, fetchedAt: Date.now() });
      return bundle;
    } catch (e: any) {
      const reason = e?.name === "AbortError" ? "timeout" : (e?.message ?? String(e));
      console.warn(`[POT] provider fetch failed for ${videoId}: ${reason}`);
      return null;
    } finally {
      clearTimeout(timer);
      inflight.delete(videoId);
    }
  })();

  inflight.set(videoId, pending);
  return pending;
}

/**
 * Build the `--extractor-args` value for a yt-dlp invocation, optionally
 * including `po_token` and `visitor_data` when a token bundle is present.
 *
 * Format reference (yt-dlp --extractor-args youtube:):
 *   player_client=<list>
 *   po_token=<context>.<client>+<token>     (e.g. web.gvs+ABC...)
 *   visitor_data=<base64>
 *   formats=missing_pot                      (include PO-flagged formats)
 */
export function buildYoutubeExtractorArgs(opts: {
  client: string;
  bundle?: PoTokenBundle | null;
  /** Include `formats=missing_pot` so non-PO clients still get formats. */
  includeMissingPot?: boolean;
}): string {
  const parts = [`player_client=${opts.client}`];
  if (opts.bundle?.poToken) {
    // We bind the token to the gvs (Google Video Server) context for the
    // requested client — that's what unlocks CDN byte serving.
    parts.push(`po_token=${opts.client}.gvs+${opts.bundle.poToken}`);
    if (opts.bundle.visitorData) {
      parts.push(`visitor_data=${opts.bundle.visitorData}`);
    }
  } else if (opts.includeMissingPot !== false) {
    parts.push("formats=missing_pot");
  }
  return `youtube:${parts.join(";")}`;
}

/** Diagnostic snapshot for /api/youtube/_diag. */
export function getPoTokenProviderStatus() {
  return {
    configured: isPoTokenProviderConfigured(),
    providerUrl: POT_PROVIDER_URL ? `${POT_PROVIDER_URL.slice(0, 32)}…` : null,
    cacheSize: cache.size,
    inflightCount: inflight.size,
  };
}
