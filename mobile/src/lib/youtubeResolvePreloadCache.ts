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

/** Mobile Safari-style client — helps Railway / edge paths that mirror YouTube expectations. */
const YOUTUBE_RESOLVE_FETCH_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};

function isRetriableResolveFetchError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes('NSURLError') ||
    msg.includes('Network request failed') ||
    msg.includes('Failed to fetch') ||
    msg.includes('Load failed') ||
    msg.includes('network error') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT')
  );
}

export function invalidateYoutubeResolveCache(videoId: string): void {
  if (!videoId) return;
  cache.delete(videoId);
  inflight.delete(videoId);
}

/** Dev / recovery: drop all in-memory YouTube resolve entries. */
export function clearAllYoutubeResolveCaches(): void {
  cache.clear();
  inflight.clear();
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

async function fetchResolveUrl(videoId: string, attempt = 0): Promise<string | null> {
  const base = backendBase();
  if (!base || !videoId) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25_000);
  try {
    const res = await fetch(`${base}/api/youtube/resolve/${videoId}`, {
      signal: ac.signal,
      headers: YOUTUBE_RESOLVE_FETCH_HEADERS,
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { url?: string } };
    const url = j.data?.url;
    if (url && url.startsWith('http')) {
      setCachedYoutubeResolveUrl(videoId, url);
      return url;
    }
  } catch (e) {
    if (attempt < 1 && isRetriableResolveFetchError(e)) {
      await new Promise((r) => setTimeout(r, 350));
      return fetchResolveUrl(videoId, attempt + 1);
    }
  } finally {
    clearTimeout(t);
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
    if (inflight.get(videoId) === p) inflight.delete(videoId);
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
