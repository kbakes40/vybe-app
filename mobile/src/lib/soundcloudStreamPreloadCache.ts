/**
 * Client cache for GET /api/soundcloud/stream-url (direct HLS/progressive URL for AVPlayer).
 */

/** INSTANT_STEALTH — successful stream URLs stay warm for replays within the hour. */
const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { url: string; expires: number }>();
const inflight = new Map<string, Promise<string | null>>();

function backendBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
}

export function getCachedSoundcloudStreamUrl(trackPageUrl: string): string | null {
  const row = cache.get(trackPageUrl);
  if (!row || Date.now() > row.expires) {
    cache.delete(trackPageUrl);
    return null;
  }
  return row.url;
}

export function setCachedSoundcloudStreamUrl(trackPageUrl: string, url: string): void {
  if (!trackPageUrl || !url.startsWith('http')) return;
  cache.set(trackPageUrl, { url, expires: Date.now() + TTL_MS });
}

async function fetchStreamUrl(trackPageUrl: string): Promise<string | null> {
  const base = backendBase();
  if (!base || !trackPageUrl) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 22_000);
  try {
    const res = await fetch(
      `${base}/api/soundcloud/stream-url?url=${encodeURIComponent(trackPageUrl)}`,
      { signal: ac.signal },
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { url?: string } };
    const url = j.data?.url;
    if (url && url.startsWith('http')) {
      setCachedSoundcloudStreamUrl(trackPageUrl, url);
      return url;
    }
  } catch {
    /* ignore */
  } finally {
    clearTimeout(t);
  }
  return null;
}

function startFetch(trackPageUrl: string): Promise<string | null> {
  const hit = getCachedSoundcloudStreamUrl(trackPageUrl);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(trackPageUrl);
  if (p) return p;
  p = fetchStreamUrl(trackPageUrl).finally(() => {
    inflight.delete(trackPageUrl);
  });
  inflight.set(trackPageUrl, p);
  return p;
}

/** Fire-and-forget resolve for next-up / search warming. */
export function preResolveSoundcloudStreamUrl(trackPageUrl: string): void {
  const base = backendBase();
  if (!base || !trackPageUrl) return;
  if (getCachedSoundcloudStreamUrl(trackPageUrl)) return;
  void startFetch(trackPageUrl);
}

export async function resolveSoundcloudStreamUrlForPlayback(trackPageUrl: string): Promise<string | null> {
  const base = backendBase();
  if (!base || !trackPageUrl) return null;
  return startFetch(trackPageUrl);
}

export async function resolveSoundcloudStreamUrlWithBudget(
  trackPageUrl: string,
  budgetMs: number,
): Promise<string | null> {
  const base = backendBase();
  if (!base || !trackPageUrl) return null;
  const hit = getCachedSoundcloudStreamUrl(trackPageUrl);
  if (hit) return hit;
  return Promise.race([
    startFetch(trackPageUrl),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), budgetMs);
    }),
  ]);
}
