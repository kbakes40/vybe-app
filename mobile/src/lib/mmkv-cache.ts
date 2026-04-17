import { MMKV } from 'react-native-mmkv';

/**
 * Thin "last-known-good" disk cache over MMKV.
 *
 * Usage:
 *   const cache = createMMKVCache('vybe-home');
 *   const hit = cache.get<MyType>('key', 24 * 60 * 60 * 1000);
 *   if (hit) {
 *     // seed state; hit.isStale tells you whether a refresh is still needed
 *   }
 *   // later after a successful fetch:
 *   cache.set('key', value);
 *
 * All reads/writes are wrapped in try/catch so a JSON error or storage
 * failure can never crash the screen — the cache is a best-effort tier on
 * top of the existing in-memory caches and stores.
 */

export interface MMKVCacheHit<T> {
  value: T;
  timestamp: number;
  /** true when the entry is older than the TTL passed to get() */
  isStale: boolean;
}

interface StoredEnvelope<T> {
  value: T;
  timestamp: number;
}

export interface MMKVCache {
  get: <T>(key: string, ttlMs: number) => MMKVCacheHit<T> | null;
  set: <T>(key: string, value: T) => void;
  remove: (key: string) => void;
}

export function createMMKVCache(id: string): MMKVCache {
  const storage = new MMKV({ id });

  return {
    get<T>(key: string, ttlMs: number): MMKVCacheHit<T> | null {
      try {
        const raw = storage.getString(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredEnvelope<T>;
        if (!parsed || typeof parsed.timestamp !== 'number') return null;
        const age = Date.now() - parsed.timestamp;
        return {
          value: parsed.value,
          timestamp: parsed.timestamp,
          isStale: age > ttlMs,
        };
      } catch {
        return null;
      }
    },
    set<T>(key: string, value: T): void {
      try {
        const envelope: StoredEnvelope<T> = { value, timestamp: Date.now() };
        storage.set(key, JSON.stringify(envelope));
      } catch {
        // silent — cache is best-effort
      }
    },
    remove(key: string): void {
      try {
        storage.delete(key);
      } catch {
        // silent
      }
    },
  };
}

// ── TTL constants — shared across screens ────────────────────────────────────
export const TTL = {
  /** 24h — curated playlists, mixes, Spotify-bridged lists, discover sections */
  CURATED: 24 * 60 * 60 * 1000,
  /** 1h — genre searches on home/discover */
  GENRE: 60 * 60 * 1000,
  /** 10min — search tab genre results (matches existing in-memory Map) */
  SEARCH: 10 * 60 * 1000,
} as const;
