/**
 * Simple in-memory TTL cache. Follows the same Map pattern used elsewhere in
 * this codebase (see routes/youtube.ts urlCache, routes/spotify.ts search cache).
 * Lives in module scope so it survives request lifecycles and clears on restart.
 *
 *   const cache = createCache<Thing>(60 * 60 * 1000); // 1h TTL
 *   const hit = cache.get(key);
 *   if (hit) return hit;
 *   const fresh = await compute();
 *   cache.set(key, fresh);
 */
export interface MemoryCache<T> {
  get(key: string): T | null;
  set(key: string, value: T): void;
  has(key: string): boolean;
}

export function createCache<T>(ttlMs: number): MemoryCache<T> {
  const store = new Map<string, { value: T; expires: number }>();

  function get(key: string): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() >= entry.expires) {
      store.delete(key);
      return null;
    }
    return entry.value;
  }

  function set(key: string, value: T): void {
    store.set(key, { value, expires: Date.now() + ttlMs });
  }

  function has(key: string): boolean {
    return get(key) !== null;
  }

  return { get, set, has };
}

/**
 * Build a stable cache key for search-style endpoints.
 * Lowercases the query so "Pop" and "pop" hit the same entry.
 */
export function searchCacheKey(
  endpoint: string,
  q: string,
  maxResults: number | undefined
): string {
  return `${endpoint}:${q.toLowerCase().trim()}:${maxResults ?? "default"}`;
}

/**
 * Standard cache-control header for CDN/edge reuse on cacheable endpoints.
 * 1h fresh, up to 24h stale-while-revalidate.
 */
export const CACHEABLE_HEADERS = {
  "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
} as const;
