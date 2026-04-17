/**
 * Client-side cache for GET /api/youtube/resolve/:videoId (direct CDN URL).
 * Mobile-only: avoids waiting on resolve on tap when pre-resolve already ran.
 */

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { url: string; expires: number }>();
const inflight = new Map<string, Promise<string | null>>();

function backendBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
}

export function getCachedYoutubeResolveUrl(videoId: string): string | null {
  const row = cache.get(videoId);
  if (!row || Date.now() > row.expires) {
    cache.delete(videoId);
    return null;
  }
  return row.url;
}

export function setCachedYoutubeResolveUrl(videoId: string, url: string): void {
  if (!videoId || !url.startsWith('http')) return;
  cache.set(videoId, { url, expires: Date.now() + TTL_MS });
}

/**
 * Retry policy for /api/youtube/resolve/:videoId:
 * - Up to 3 attempts total (initial + 2 retries).
 * - Retry only on network failure / abort / 5xx.
 * - 403 and other 4xx are terminal: the backend already gave up on this
 *   video, so the caller falls back to the `/audio` proxy path instead.
 * - Backoff: 400ms, 900ms (with small jitter).
 */
const RESOLVE_MAX_ATTEMPTS = 3;
const RESOLVE_BASE_BACKOFF_MS = 400;

function computeBackoffMs(attempt: number): number {
  const base = RESOLVE_BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 120);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptResolveFetch(
  base: string,
  videoId: string,
): Promise<
  | { kind: 'ok'; url: string }
  | { kind: 'terminal'; status: number }
  | { kind: 'retryable'; reason: 'network' | 'server'; status?: number }
> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25_000);
  try {
    const res = await fetch(`${base}/api/youtube/resolve/${videoId}`, {
      signal: ac.signal,
    });
    if (res.ok) {
      try {
        const j = (await res.json()) as { data?: { url?: string } };
        const url = j.data?.url;
        if (url && url.startsWith('http')) {
          return { kind: 'ok', url };
        }
        return { kind: 'terminal', status: res.status };
      } catch {
        return { kind: 'terminal', status: res.status };
      }
    }
    if (res.status >= 500) {
      return { kind: 'retryable', reason: 'server', status: res.status };
    }
    return { kind: 'terminal', status: res.status };
  } catch {
    return { kind: 'retryable', reason: 'network' };
  } finally {
    clearTimeout(t);
  }
}

async function fetchResolveUrl(videoId: string): Promise<string | null> {
  const base = backendBase();
  if (!base || !videoId) return null;

  for (let attempt = 1; attempt <= RESOLVE_MAX_ATTEMPTS; attempt++) {
    const result = await attemptResolveFetch(base, videoId);
    if (result.kind === 'ok') {
      setCachedYoutubeResolveUrl(videoId, result.url);
      return result.url;
    }
    if (result.kind === 'terminal') {
      return null;
    }
    if (attempt < RESOLVE_MAX_ATTEMPTS) {
      await sleep(computeBackoffMs(attempt));
    }
  }
  return null;
}

/**
 * Single in-flight resolve per videoId (shared by preload + await-on-play).
 */
function startResolveFetch(videoId: string): Promise<string | null> {
  const hit = getCachedYoutubeResolveUrl(videoId);
  if (hit) return Promise.resolve(hit);

  let p = inflight.get(videoId);
  if (p) return p;

  p = fetchResolveUrl(videoId).finally(() => {
    inflight.delete(videoId);
  });
  inflight.set(videoId, p);
  return p;
}

/**
 * Fire-and-forget: populate cache from existing Railway resolve endpoint.
 */
export function preResolveYoutubeVideoId(videoId: string): void {
  const base = backendBase();
  if (!base || !videoId) return;
  if (getCachedYoutubeResolveUrl(videoId)) return;
  void startResolveFetch(videoId);
}

/**
 * Await CDN URL for playback (uses cache, shares network with preResolve).
 * Returns null if resolve fails — caller should fall back to proxy URL.
 */
export async function resolveYoutubeUrlForPlayback(videoId: string): Promise<string | null> {
  const base = backendBase();
  if (!base || !videoId) return null;
  return startResolveFetch(videoId);
}

/**
 * Like resolveYoutubeUrlForPlayback but returns null if not ready within `budgetMs`
 * (so playback can fall back to /audio proxy without waiting on a slow yt-dlp).
 */
export async function resolveYoutubeUrlForPlaybackWithBudget(
  videoId: string,
  budgetMs: number,
): Promise<string | null> {
  const base = backendBase();
  if (!base || !videoId) return null;
  const hit = getCachedYoutubeResolveUrl(videoId);
  if (hit) return hit;
  return Promise.race([
    startResolveFetch(videoId),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), budgetMs);
    }),
  ]);
}
