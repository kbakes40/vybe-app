import { createMMKVCache } from '@/lib/mmkv-cache';
import type { Track } from '@/types/music';

export interface GenreCacheEntry {
  ytMusic: Track[];
  youtube: Track[];
  soundcloud: Track[];
  timestamp: number;
}

export const GENRE_CACHE_TTL = 10 * 60 * 1000;

export const genreCache = new Map<string, GenreCacheEntry>();

/** Restored on cold start via `selectedGenre` in Search. */
export let lastSelectedGenre: string | null = null;

export function setLastSelectedGenre(g: string | null) {
  lastSelectedGenre = g;
}

const searchMMKV = createMMKVCache('vybe-search');
export const GENRE_MMKV_PREFIX = 'genre:';

export function isGenreCacheFresh(entry: GenreCacheEntry) {
  return Date.now() - entry.timestamp < GENRE_CACHE_TTL;
}

export function hydrateGenreFromDisk(genre: string): GenreCacheEntry | null {
  if (genreCache.has(genre)) return genreCache.get(genre) ?? null;
  const hit = searchMMKV.get<GenreCacheEntry>(`${GENRE_MMKV_PREFIX}${genre}`, GENRE_CACHE_TTL);
  if (!hit || hit.isStale) return null;
  genreCache.set(genre, hit.value);
  return hit.value;
}

export function tryCommitGenreCache(genre: string, partial: Partial<GenreCacheEntry>) {
  if (
    partial.ytMusic !== undefined &&
    partial.youtube !== undefined &&
    partial.soundcloud !== undefined
  ) {
    const entry: GenreCacheEntry = {
      ytMusic: partial.ytMusic,
      youtube: partial.youtube,
      soundcloud: partial.soundcloud,
      timestamp: Date.now(),
    };
    genreCache.set(genre, entry);
    searchMMKV.set(`${GENRE_MMKV_PREFIX}${genre}`, entry);
  }
}

// Curated query strings per genre — tuned for discovery quality.
export const GENRE_QUERIES: Record<string, { ytMusic: string; youtube: string; soundcloud: string }> = {
  Pop: {
    ytMusic: 'top pop hits 2025',
    youtube: 'pop music video official',
    soundcloud: 'pop hits',
  },
  'Hip-Hop': {
    ytMusic: 'top hip hop hits 2025',
    youtube: 'hip hop music video official',
    soundcloud: 'hip hop new',
  },
  'Hip Hop': {
    ytMusic: 'top hip hop hits 2025',
    youtube: 'hip hop music video official',
    soundcloud: 'hip hop new',
  },
  Electronic: {
    ytMusic: 'top electronic tracks 2025',
    youtube: 'electronic music video',
    soundcloud: 'electronic edm',
  },
  'R&B': {
    ytMusic: 'top rnb hits 2025',
    youtube: 'rnb music video official',
    soundcloud: 'rnb new',
  },
  Rock: {
    ytMusic: 'top rock hits 2025',
    youtube: 'rock music video official',
    soundcloud: 'rock indie',
  },
  Jazz: {
    ytMusic: 'best jazz tracks',
    youtube: 'jazz live performance',
    soundcloud: 'jazz fusion',
  },
  Classical: {
    ytMusic: 'best classical pieces',
    youtube: 'classical music performance',
    soundcloud: 'classical piano',
  },
  'Lo-Fi': {
    ytMusic: 'lofi hip hop beats',
    youtube: 'lofi chill beats',
    soundcloud: 'lofi chill',
  },
  'AI Sounds': {
    ytMusic: 'ai generated music',
    youtube: 'ai music showcase',
    soundcloud: 'ai generated',
  },
  Throwbacks: {
    ytMusic: 'throwback hits 2000s 2010s',
    youtube: 'throwback music video official',
    soundcloud: 'throwback classics',
  },
};

export function genreQueries(genre: string) {
  return (
    GENRE_QUERIES[genre] ?? {
      ytMusic: `top ${genre} hits 2025`,
      youtube: `${genre} music video official`,
      soundcloud: `${genre} new`,
    }
  );
}
