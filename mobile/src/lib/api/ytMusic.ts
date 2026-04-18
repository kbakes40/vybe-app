import { api } from '@/lib/api/api';
import type { Track } from '@/types/music';
import { upgradeYoutubeThumbUrl, isLowResYoutubeThumbnail } from '@/lib/shadowPlaylistArtwork';
import { preResolveYoutubeVideoId } from '@/lib/youtubeResolvePreloadCache';
import { queueYoutubeAudioPrefetch } from '@/stores/prefetchStore';

/** Home + discover YT Music rails */
export const YT_MUSIC_HOME_LIMIT = 50;

export type YtmPlaylistTrack = {
  videoId: string;
  title: string;
  channelName: string;
  channelId?: string;
  thumbnailUrl: string;
  artwork?: string;
  publishedAt: string;
};

export async function ytmSearch(q: string, maxResults: number = YT_MUSIC_HOME_LIMIT) {
  return api.get<YtmPlaylistTrack[]>(
    `/api/youtube/search?q=${encodeURIComponent(q)}&maxResults=${maxResults}`,
  );
}

export const YTM_HOME_QUERIES = {
  newReleases: 'new music releases 2025 official audio full songs',
  topMusicVideos: 'top music videos 2025 vevo official hd',
  moodFocus: 'focus deep work instrumental concentration music',
  moodEnergy: 'high energy workout party anthems mix 2024',
  moodSleep: 'sleep calm ambient night relaxation music',
  globalTrending: 'youtube music trending hits worldwide popular songs',
} as const;

export function collectSeedArtists(
  tracks: Track[],
  maxArtists = 3,
): { seed: string; hasSeed: boolean } {
  const artists = [...new Set(tracks.map((t) => t.artist?.trim()).filter(Boolean))] as string[];
  const slice = artists.slice(0, maxArtists);
  return { seed: slice.join(' '), hasSeed: slice.length > 0 };
}

export function buildTasteSeedQuery(tracks: Track[], mode: 'home' | 'discover'): string {
  const { seed, hasSeed } = collectSeedArtists(tracks);
  if (!hasSeed) {
    return mode === 'home'
      ? 'trending music 2025 radio mix'
      : 'underground music deep cuts rare tracks non hits';
  }
  if (mode === 'home') return `${seed} radio mix similar artists 2025`;
  return `${seed} deep cuts b-sides rare tracks not hits album deep tracks`;
}

/** Personalized home rail from liked-song taste (50 results). */
export async function getHome(limit: number, seedTracks: Track[]) {
  const q = buildTasteSeedQuery(seedTracks, 'home');
  return ytmSearch(q, limit).catch(() => [] as YtmPlaylistTrack[]);
}

/** Discover / exploration rail from taste (50 results). */
export async function getDiscover(limit: number, seedTracks: Track[]) {
  const q = buildTasteSeedQuery(seedTracks, 'discover');
  return ytmSearch(q, limit).catch(() => [] as YtmPlaylistTrack[]);
}

export function getShadowRadarBlurb(hour: number): string {
  if (hour >= 5 && hour < 11) return 'Morning — chill & light';
  if (hour >= 11 && hour < 14) return 'Midday — bright momentum';
  if (hour >= 14 && hour < 18) return 'Afternoon — focused groove';
  if (hour >= 18 && hour < 22) return 'Evening — peak singalongs';
  if (hour >= 22 || hour < 1) return 'Late night — high voltage';
  return 'After hours — deep pulse';
}

export function buildShadowRadarQuery(hour: number, seedTracks: Track[]): string {
  const { seed, hasSeed } = collectSeedArtists(seedTracks, 2);
  let mood: string;
  if (hour >= 5 && hour < 11) mood = 'chill soft acoustic morning wake up music';
  else if (hour >= 11 && hour < 14) mood = 'sunny upbeat daytime pop energy';
  else if (hour >= 14 && hour < 18) mood = 'feel good afternoon focus groove';
  else if (hour >= 18 && hour < 22) mood = 'golden hour singalong vibes';
  else if (hour >= 22 || hour < 1) mood = 'late night high energy party hype anthems';
  else mood = 'after midnight moody bass night drive';
  const prefix = hasSeed ? `${seed} ` : '';
  return `${prefix}${mood} youtube music mix`.trim();
}

/** Hour-aware “what’s next” rail (default 20 tracks). */
export async function getShadowRadar(limit: number, seedTracks: Track[], hour?: number) {
  const h = hour ?? new Date().getHours();
  const q = buildShadowRadarQuery(h, seedTracks);
  return ytmSearch(q, limit).catch(() => [] as YtmPlaylistTrack[]);
}

export function normalizeYtmThumb(row: YtmPlaylistTrack): YtmPlaylistTrack {
  const a = upgradeYoutubeThumbUrl(row.artwork || row.thumbnailUrl);
  const b = upgradeYoutubeThumbUrl(row.thumbnailUrl);
  const thumb =
    a && !isLowResYoutubeThumbnail(a)
      ? a
      : b && !isLowResYoutubeThumbnail(b)
        ? b
        : a || b || row.thumbnailUrl;
  return { ...row, thumbnailUrl: thumb };
}

export function ytmTracksToQueueTracks(rows: YtmPlaylistTrack[]): Track[] {
  return rows.map((t) => {
    const n = normalizeYtmThumb(t);
    return {
      id: `ytm-${n.videoId}`,
      title: n.title,
      artist: n.channelName,
      artistId: '',
      album: '',
      albumId: '',
      artwork: n.artwork?.trim() || n.thumbnailUrl,
      duration: 0,
      isLiked: false,
      source: 'youtube_music' as const,
      audioUrl: '',
      youtubeMusicId: n.videoId,
    };
  });
}

export async function prewarmYtmFeed(rows: YtmPlaylistTrack[] | null | undefined, maxIds = 14): Promise<void> {
  if (!rows?.length) return;
  const slice = rows.slice(0, maxIds);
  for (const t of slice) {
    if (t.videoId) preResolveYoutubeVideoId(t.videoId);
  }
  await queueYoutubeAudioPrefetch(ytmTracksToQueueTracks(slice));
}

function emptyBundle() {
  return {
    personalized: [] as YtmPlaylistTrack[],
    newReleases: [] as YtmPlaylistTrack[],
    topMusicVideos: [] as YtmPlaylistTrack[],
    moodFocus: [] as YtmPlaylistTrack[],
    moodEnergy: [] as YtmPlaylistTrack[],
    moodSleep: [] as YtmPlaylistTrack[],
  };
}

function pickSettled(
  r: PromiseSettledResult<YtmPlaylistTrack[] | null | undefined>,
): YtmPlaylistTrack[] {
  if (r.status !== 'fulfilled' || !r.value) return [];
  return r.value;
}

/**
 * Parallel home bundle; uses liked taste when available, else `fallbackPersonalizedQuery`
 * (e.g. listening-history query). All inner requests use `Promise.allSettled`.
 */
export async function fetchYtmHomeBundle(seedTracks: Track[], fallbackPersonalizedQuery: string) {
  const primary = buildTasteSeedQuery(seedTracks, 'home');
  const personalizedQ =
    primary === 'trending music 2025 radio mix'
      ? fallbackPersonalizedQuery
      : primary;

  const settled = await Promise.allSettled([
    ytmSearch(personalizedQ, YT_MUSIC_HOME_LIMIT),
    ytmSearch(YTM_HOME_QUERIES.newReleases, YT_MUSIC_HOME_LIMIT),
    ytmSearch(YTM_HOME_QUERIES.topMusicVideos, YT_MUSIC_HOME_LIMIT),
    ytmSearch(YTM_HOME_QUERIES.moodFocus, YT_MUSIC_HOME_LIMIT),
    ytmSearch(YTM_HOME_QUERIES.moodEnergy, YT_MUSIC_HOME_LIMIT),
    ytmSearch(YTM_HOME_QUERIES.moodSleep, YT_MUSIC_HOME_LIMIT),
  ]);

  return {
    personalized: pickSettled(settled[0]),
    newReleases: pickSettled(settled[1]),
    topMusicVideos: pickSettled(settled[2]),
    moodFocus: pickSettled(settled[3]),
    moodEnergy: pickSettled(settled[4]),
    moodSleep: pickSettled(settled[5]),
  };
}

/** Safe unpack when the whole bundle call rejects. */
export function safeYtmBundle(
  r: PromiseSettledResult<Awaited<ReturnType<typeof fetchYtmHomeBundle>>>,
) {
  return r.status === 'fulfilled' ? r.value : emptyBundle();
}
