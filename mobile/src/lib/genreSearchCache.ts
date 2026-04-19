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

/**
 * Top-5 genres warmed at app launch so tapping any of them feels instant.
 * Skipped if a fresh disk cache already exists for the genre — we never want
 * to redundantly hammer the network during cold start.
 */
export const PREWARM_GENRES = ['Pop', 'Hip-Hop', 'Electronic', 'R&B', 'Lo-Fi'] as const;

let prewarmStarted = false;

/**
 * Fire-and-forget background warmer for the top genres. Idempotent — calling
 * twice within a session is a no-op. Safe to invoke from app startup; failures
 * are swallowed so a 502 from the backend never blocks the main thread or
 * surfaces an error.
 *
 * The actual fetch logic lives in `useGenreSearch`, but during prewarm we
 * call the same backend endpoints directly and stuff the result into the same
 * MMKV cache key shape, so the genre detail screen reads it instantly when
 * the user taps the tile.
 */
export async function prewarmTopGenres(api: {
  get: <T>(path: string) => Promise<T | null | undefined>;
}): Promise<void> {
  if (prewarmStarted) return;
  prewarmStarted = true;

  for (const g of PREWARM_GENRES) {
    const cached = hydrateGenreFromDisk(g);
    if (cached) continue;

    const queries = genreQueries(g);

    void Promise.allSettled([
      api
        .get<{ videoId: string; title: string; channelName: string; thumbnailUrl?: string; artwork?: string }[]>(
          `/api/youtube/search?q=${encodeURIComponent(queries.ytMusic)}&maxResults=15`,
        )
        .catch(() => null),
      api
        .get<{ videoId: string; title: string; channelName: string; thumbnailUrl?: string; artwork?: string }[]>(
          `/api/youtube/search?q=${encodeURIComponent(queries.youtube)}&maxResults=12`,
        )
        .catch(() => null),
      api
        .get<{ trackId: string; title: string; artist: string; artwork?: string; duration: number; soundcloudUrl: string }[]>(
          `/api/soundcloud/search?q=${encodeURIComponent(queries.soundcloud)}&maxResults=15`,
        )
        .catch(() => null),
    ]).then((results) => {
      const ytm = results[0].status === 'fulfilled' ? results[0].value : null;
      const yt = results[1].status === 'fulfilled' ? results[1].value : null;
      const sc = results[2].status === 'fulfilled' ? results[2].value : null;

      const ytMusic: Track[] = (ytm ?? []).map((t) => ({
        id: `ytm-${t.videoId}`,
        title: t.title,
        artist: t.channelName,
        artwork: t.artwork || t.thumbnailUrl || '',
        source: 'youtube_music' as const,
        youtubeMusicId: t.videoId,
        audioUrl: '',
        artistId: '',
        album: '',
        albumId: '',
        isLiked: false,
        duration: 0,
      }));
      const youtube: Track[] = (yt ?? []).map((t) => ({
        id: `yt-${t.videoId}`,
        title: t.title,
        artist: t.channelName,
        artwork: t.artwork || t.thumbnailUrl || '',
        source: 'youtube' as const,
        youtubeId: t.videoId,
        audioUrl: '',
        artistId: '',
        album: '',
        albumId: '',
        isLiked: false,
        duration: 0,
      }));
      const soundcloud: Track[] = (sc ?? []).map((t) => ({
        id: `sc-${t.trackId}`,
        title: t.title,
        artist: t.artist,
        artwork: t.artwork || '',
        source: 'soundcloud' as const,
        soundcloudUrl: t.soundcloudUrl,
        audioUrl: '',
        artistId: '',
        album: '',
        albumId: '',
        isLiked: false,
        duration: t.duration,
      }));

      // Only commit when at least one source returned rows — avoids
      // overwriting any future fetch with a useless empty cache.
      if (ytMusic.length === 0 && youtube.length === 0 && soundcloud.length === 0) return;

      tryCommitGenreCache(g, { ytMusic, youtube, soundcloud });
    });
  }
}
