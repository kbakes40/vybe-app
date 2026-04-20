/**
 * Client-side cache for GET /api/youtube/resolve/:videoId (direct CDN URL).
 * Mobile-only: avoids waiting on resolve on tap when pre-resolve already ran.
 * Supports vault auto-heal payloads (`healed` + SoundCloud metadata) — never cached.
 */

const TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { url: string; expires: number }>();
const inflight = new Map<string, Promise<YoutubeResolveEnvelope | null>>();

/** Bump when server changes CDN format preference (e.g. M4A before WebM for iOS). */
const RESOLVE_CACHE_VERSION = 'a2';

function resolveCacheKey(videoId: string): string {
  return `${RESOLVE_CACHE_VERSION}\t${videoId}`;
}

export type YoutubeHealMeta = {
  soundcloudUrl: string;
  scTrackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
};

export type YoutubeResolveEnvelope = {
  url: string;
  healedMeta?: YoutubeHealMeta;
  /** True when server used SoundCloud substitution for this resolve. */
  xHealed?: boolean;
};

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
  cache.delete(resolveCacheKey(videoId));
  const prefix = `${RESOLVE_CACHE_VERSION}\t${videoId}\t`;
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

/** Dev / recovery: drop all in-memory YouTube resolve entries. */
export function clearAllYoutubeResolveCaches(): void {
  cache.clear();
  inflight.clear();
}

export function getCachedYoutubeResolveUrl(videoId: string): string | null {
  const k = resolveCacheKey(videoId);
  const row = cache.get(k);
  if (!row || Date.now() > row.expires) {
    cache.delete(k);
    return null;
  }
  return row.url;
}

export function setCachedYoutubeResolveUrl(videoId: string, url: string): void {
  if (!videoId || !url.startsWith('http')) return;
  cache.set(resolveCacheKey(videoId), { url, expires: Date.now() + TTL_MS });
}

function parseResolveJson(
  j: unknown,
  headerHealed: boolean,
): YoutubeResolveEnvelope | null {
  const root = j as {
    data?: {
      url?: string;
      healed?: boolean;
      soundcloudUrl?: string;
      scTrackId?: string;
      title?: string;
      artist?: string;
      artwork?: string;
      duration?: number;
    };
  };
  const data = root.data;
  const url = typeof data?.url === 'string' ? data.url.trim() : '';
  if (!url.startsWith('http')) return null;

  const healed =
    !!data?.healed &&
    typeof data.soundcloudUrl === 'string' &&
    typeof data.scTrackId === 'string';
  if (healed) {
    return {
      url,
      xHealed: headerHealed || !!data.healed,
      healedMeta: {
        soundcloudUrl: data.soundcloudUrl!,
        scTrackId: data.scTrackId!,
        title: typeof data.title === 'string' ? data.title : '',
        artist: typeof data.artist === 'string' ? data.artist : '',
        artwork: typeof data.artwork === 'string' ? data.artwork : '',
        duration: typeof data.duration === 'number' ? data.duration : 0,
      },
    };
  }
  return { url, xHealed: headerHealed };
}

function resolveQueryString(fresh: boolean, soundcloudUrl?: string, soundcloudId?: string): string {
  const p = new URLSearchParams();
  if (fresh) p.set("fresh", "1");
  if (soundcloudUrl?.trim()) p.set("soundcloudUrl", soundcloudUrl.trim());
  if (soundcloudId?.trim()) p.set("soundcloudId", soundcloudId.trim());
  const s = p.toString();
  return s ? `?${s}` : "";
}

async function fetchResolveEnvelope(
  videoId: string,
  fresh: boolean,
  attempt = 0,
  soundcloudUrl?: string,
  soundcloudId?: string,
): Promise<YoutubeResolveEnvelope | null> {
  const base = backendBase();
  if (!base || !videoId) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 25_000);
  try {
    const qs = resolveQueryString(fresh, soundcloudUrl, soundcloudId);
    const res = await fetch(`${base}/api/youtube/resolve/${videoId}${qs}`, {
      signal: ac.signal,
      headers: YOUTUBE_RESOLVE_FETCH_HEADERS,
    });
    if (!res.ok) return null;
    const headerHealed = res.headers.get('X-Healed') === 'true';
    const j = await res.json();
    const env = parseResolveJson(j, headerHealed);
    if (env && !env.healedMeta) {
      setCachedYoutubeResolveUrl(videoId, env.url);
    }
    return env;
  } catch (e) {
    if (attempt < 1 && isRetriableResolveFetchError(e)) {
      await new Promise((r) => setTimeout(r, 350));
      return fetchResolveEnvelope(videoId, fresh, attempt + 1, soundcloudUrl, soundcloudId);
    }
  } finally {
    clearTimeout(t);
  }
  return null;
}

function inflightKey(videoId: string, fresh: boolean, soundcloudUrl?: string, soundcloudId?: string): string {
  return `${RESOLVE_CACHE_VERSION}\t${videoId}\t${fresh ? '1' : '0'}\t${soundcloudUrl ?? ''}\t${soundcloudId ?? ''}`;
}

function startResolveFetchEnvelope(
  videoId: string,
  fresh: boolean,
  soundcloudUrl?: string,
  soundcloudId?: string,
): Promise<YoutubeResolveEnvelope | null> {
  if (!fresh && !soundcloudUrl?.trim()) {
    const hit = getCachedYoutubeResolveUrl(videoId);
    if (hit) return Promise.resolve({ url: hit });
  }

  const k = inflightKey(videoId, fresh, soundcloudUrl, soundcloudId);
  let p = inflight.get(k);
  if (p) return p;

  p = fetchResolveEnvelope(videoId, fresh, 0, soundcloudUrl, soundcloudId).finally(() => {
    if (inflight.get(k) === p) inflight.delete(k);
  });
  inflight.set(k, p);
  return p;
}

/**
 * Fresh resolve (cache-busted) — used after vault playback errors to pick up server-side heal.
 */
export async function fetchYoutubeHealResolveEnvelope(
  videoId: string,
): Promise<YoutubeResolveEnvelope | null> {
  invalidateYoutubeResolveCache(videoId);
  return startResolveFetchEnvelope(videoId, true);
}

/**
 * Fire-and-forget: populate cache from existing Railway resolve endpoint.
 */
export function preResolveYoutubeVideoId(
  videoId: string,
  soundcloudUrl?: string,
  soundcloudId?: string,
): void {
  const base = backendBase();
  if (!base || !videoId) return;
  if (!soundcloudUrl?.trim() && getCachedYoutubeResolveUrl(videoId)) return;
  void startResolveFetchEnvelope(videoId, false, soundcloudUrl, soundcloudId);
}

/**
 * Await CDN URL for playback (uses cache, shares network with preResolve).
 * Returns null if resolve fails — caller should fall back to proxy URL.
 */
export async function resolveYoutubeUrlForPlayback(videoId: string): Promise<string | null> {
  const base = backendBase();
  if (!base || !videoId) return null;
  const env = await startResolveFetchEnvelope(videoId, false);
  return env?.url ?? null;
}

/**
 * Like resolveYoutubeUrlForPlayback but returns null if not ready within `budgetMs`
 * (so playback can fall back to /audio proxy without waiting on a slow yt-dlp).
 */
export async function resolveYoutubeUrlForPlaybackWithBudget(
  videoId: string,
  budgetMs: number,
  opts?: { fresh?: boolean; soundcloudUrl?: string; soundcloudId?: string },
): Promise<string | null> {
  const base = backendBase();
  if (!base || !videoId) return null;
  const fresh = opts?.fresh ?? false;
  const scUrl = opts?.soundcloudUrl;
  const scId = opts?.soundcloudId;
  if (!fresh && !scUrl?.trim()) {
    const hit = getCachedYoutubeResolveUrl(videoId);
    if (hit) return hit;
  }
  return Promise.race([
    startResolveFetchEnvelope(videoId, fresh, scUrl, scId),
    new Promise<YoutubeResolveEnvelope | null>((resolve) => {
      setTimeout(() => resolve(null), budgetMs);
    }),
  ]).then((e) => e?.url ?? null);
}

/**
 * Full resolve envelope within budget (includes heal metadata when server healed).
 */
export async function resolveYoutubeEnvelopeForPlaybackWithBudget(
  videoId: string,
  budgetMs: number,
  opts?: { fresh?: boolean; soundcloudUrl?: string; soundcloudId?: string },
): Promise<YoutubeResolveEnvelope | null> {
  const base = backendBase();
  if (!base || !videoId) return null;
  const fresh = opts?.fresh ?? false;
  const scUrl = opts?.soundcloudUrl;
  const scId = opts?.soundcloudId;
  if (!fresh && !scUrl?.trim()) {
    const hit = getCachedYoutubeResolveUrl(videoId);
    if (hit) return { url: hit };
  }
  return Promise.race([
    startResolveFetchEnvelope(videoId, fresh, scUrl, scId),
    new Promise<YoutubeResolveEnvelope | null>((resolve) => {
      setTimeout(() => resolve(null), budgetMs);
    }),
  ]);
}
