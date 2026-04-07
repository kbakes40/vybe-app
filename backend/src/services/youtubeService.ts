/**
 * YouTube Integration Service
 * Uses YouTube Data API to search for music videos
 * Returns properly formatted DiscoverItems that open in YouTube app/web
 */

import type {
  YouTubeSearchResponse,
  YouTubeSearchItem,
  YouTubeDiscoverResult,
  DiscoverItem,
} from '../types/discover';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ─── Key Rotation ─────────────────────────────────────────────────────────────
// Load up to 5 API keys at startup; rotate when quota is exhausted or a key 403s.
const QUOTA_COST_SEARCH = 100;
const PROACTIVE_ROTATION_THRESHOLD = 9500; // switch key before hard limit

const API_KEYS: string[] = (
  [
    process.env.YOUTUBE_API_KEY_1,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3,
    process.env.YOUTUBE_API_KEY_4,
    process.env.YOUTUBE_API_KEY_5,
    // Fallback: legacy single key
    process.env.YOUTUBE_API_KEY,
  ] as (string | undefined)[]
).map(k => k?.trim())
.filter((k): k is string => typeof k === 'string' && k.length > 0);

// De-duplicate in case the same key is set under multiple vars
const UNIQUE_API_KEYS = [...new Set(API_KEYS)];

let activeKeyIndex = 0;

function getActiveKey(): string | null {
  return UNIQUE_API_KEYS[activeKeyIndex] ?? null;
}

function rotateKey(reason: string): boolean {
  if (activeKeyIndex + 1 >= UNIQUE_API_KEYS.length) {
    console.warn(`[YouTube] All ${UNIQUE_API_KEYS.length} key(s) exhausted. ${reason}`);
    return false;
  }
  activeKeyIndex++;
  console.log(`[YouTube] Using key ${activeKeyIndex + 1}/${UNIQUE_API_KEYS.length} — ${reason}`);
  return true;
}

// ─── Per-key Quota Tracking ───────────────────────────────────────────────────

interface QuotaStats {
  totalUnits: number;
  callCount: number;
  cacheHits: number;
  resetAt: number;
  keyIndex: number;
  totalKeys: number;
}

interface KeyStats {
  totalUnits: number;
  callCount: number;
  resetAt: number;
}

function getNextMidnightPT(): number {
  const now = new Date();
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pt.setHours(24, 0, 0, 0);
  return pt.getTime();
}

const keyStats: KeyStats[] = UNIQUE_API_KEYS.map(() => ({
  totalUnits: 0,
  callCount: 0,
  resetAt: getNextMidnightPT(),
}));

let globalCacheHits = 0;

function trackQuotaUsage(units: number, caller: string): void {
  const stats = keyStats[activeKeyIndex];
  if (!stats) return;

  const now = Date.now();
  if (now > stats.resetAt) {
    stats.totalUnits = 0;
    stats.callCount = 0;
    stats.resetAt = getNextMidnightPT();
    console.log(`[YouTube Quota] Key ${activeKeyIndex + 1} daily quota reset`);
  }

  stats.totalUnits += units;
  stats.callCount++;
  console.log(
    `[YouTube Quota] Key ${activeKeyIndex + 1}/${UNIQUE_API_KEYS.length} +${units} units (${caller}) | today: ${stats.totalUnits} units / ${stats.callCount} calls`
  );

  // Proactively rotate before hitting the hard limit
  if (stats.totalUnits >= PROACTIVE_ROTATION_THRESHOLD) {
    rotateKey(`key ${activeKeyIndex} reached ${stats.totalUnits} units`);
  }
}

export function getQuotaStats(): QuotaStats {
  const stats = keyStats[activeKeyIndex] ?? { totalUnits: 0, callCount: 0, resetAt: getNextMidnightPT() };
  return {
    totalUnits: stats.totalUnits,
    callCount: stats.callCount,
    cacheHits: globalCacheHits,
    resetAt: stats.resetAt,
    keyIndex: activeKeyIndex + 1,
    totalKeys: UNIQUE_API_KEYS.length,
  };
}

// ─── Search Result Cache ──────────────────────────────────────────────────────
// Caches per-query results for 24 hours to avoid burning quota on repeated queries

const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  results: YouTubeDiscoverResult[];
  expiresAt: number;
}

const searchCache = new Map<string, CacheEntry>();

function getCachedSearch(query: string, maxResults: number): YouTubeDiscoverResult[] | null {
  const key = `${query}::${maxResults}`;
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return entry.results;
}

function setCachedSearch(query: string, maxResults: number, results: YouTubeDiscoverResult[]): void {
  const key = `${query}::${maxResults}`;
  searchCache.set(key, { results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
}

/**
 * Returns current cache size (for diagnostics)
 */
export function getSearchCacheSize(): number {
  return searchCache.size;
}

/**
 * Clear expired entries from the cache (call periodically if needed)
 */
export function purgeExpiredSearchCache(): number {
  const now = Date.now();
  let purged = 0;
  for (const [key, entry] of searchCache.entries()) {
    if (now > entry.expiresAt) {
      searchCache.delete(key);
      purged++;
    }
  }
  return purged;
}

/**
 * Check if YouTube API is available
 */
export function isYouTubeApiAvailable(): boolean {
  return UNIQUE_API_KEYS.length > 0;
}

/**
 * Build search queries from user preferences
 */
export function buildSearchQueriesFromPreferences(preferences: {
  genres: string[];
  moods: string[];
  favoriteArtists: string[];
}): string[] {
  const queries: string[] = [];

  // Artist-based queries (most specific)
  for (const artist of preferences.favoriteArtists.slice(0, 3)) {
    queries.push(`${artist} music`);
    queries.push(`${artist} new song`);
  }

  // Genre + mood combinations
  for (const genre of preferences.genres.slice(0, 3)) {
    queries.push(`${genre} music 2024`);
    queries.push(`best ${genre} songs`);

    for (const mood of preferences.moods.slice(0, 2)) {
      queries.push(`${mood} ${genre} music`);
    }
  }

  // Mood-based queries
  for (const mood of preferences.moods.slice(0, 3)) {
    queries.push(`${mood} music playlist`);
    queries.push(`${mood} vibes music`);
  }

  // Trending/discovery queries
  queries.push('new music releases');
  queries.push('trending music');
  queries.push('underground music gems');

  return queries;
}

/**
 * Search YouTube for music videos
 */
export async function searchYouTube(
  query: string,
  maxResults: number = 10
): Promise<YouTubeDiscoverResult[]> {
  if (UNIQUE_API_KEYS.length === 0) {
    console.warn('[YouTube] No API keys configured, skipping search');
    return [];
  }

  // Check cache first
  const cached = getCachedSearch(query, maxResults);
  if (cached) {
    globalCacheHits++;
    console.log(`[YouTube Cache] HIT for "${query}" (saved ${QUOTA_COST_SEARCH} units)`);
    return cached;
  }

  // Try with current key, rotate on 403 quotaExceeded and retry once per key
  while (activeKeyIndex < UNIQUE_API_KEYS.length) {
    const apiKey = getActiveKey();
    if (!apiKey) break;

    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoCategoryId: '10',
      q: query,
      maxResults: maxResults.toString(),
      key: apiKey,
      safeSearch: 'moderate',
    });

    try {
      const response = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);

      if (response.status === 403) {
        const body = await response.text();
        if (body.includes('quotaExceeded') || body.includes('dailyLimitExceeded')) {
          const rotated = rotateKey(`403 quotaExceeded on key ${activeKeyIndex + 1}`);
          if (!rotated) return getCachedSearch(query, maxResults) ?? [];
          continue; // retry with new key
        }
        console.error(`[YouTube] 403 not quota-related: ${body}`);
        return [];
      }

      if (!response.ok) {
        console.error(`[YouTube] Search failed: ${response.status}`);
        return [];
      }

      trackQuotaUsage(QUOTA_COST_SEARCH, `search("${query}")`);

      const data = await response.json() as YouTubeSearchResponse;
      const results = data.items
        .filter((item): item is YouTubeSearchItem & { id: { videoId: string } } =>
          Boolean(item.id.videoId)
        )
        .map(item => ({
          videoId: item.id.videoId,
          title: decodeHtmlEntities(item.snippet.title),
          channelName: decodeHtmlEntities(item.snippet.channelTitle),
          thumbnailUrl: item.snippet.thumbnails.high?.url ||
                        item.snippet.thumbnails.medium?.url ||
                        item.snippet.thumbnails.default.url,
          publishedAt: item.snippet.publishedAt,
          searchQuery: query,
        }));

      setCachedSearch(query, maxResults, results);
      return results;
    } catch (error) {
      console.error('[YouTube] Search error:', error);
      return [];
    }
  }

  return getCachedSearch(query, maxResults) ?? [];
}

/**
 * Search YouTube with multiple queries and merge results
 */
export async function searchYouTubeMultiple(
  queries: string[],
  resultsPerQuery: number = 5
): Promise<YouTubeDiscoverResult[]> {
  const allResults: YouTubeDiscoverResult[] = [];
  const seenVideoIds = new Set<string>();

  // Run searches in parallel (max 5 at a time to avoid rate limiting)
  const batchSize = 5;
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(query => searchYouTube(query, resultsPerQuery))
    );

    for (const results of batchResults) {
      for (const result of results) {
        if (!seenVideoIds.has(result.videoId)) {
          seenVideoIds.add(result.videoId);
          allResults.push(result);
        }
      }
    }
  }

  return allResults;
}

/**
 * Convert YouTube search result to DiscoverItem format
 */
export function youtubeResultToDiscoverItem(result: YouTubeDiscoverResult): Omit<DiscoverItem, 'id' | 'createdAt'> {
  const webUrl = `https://www.youtube.com/watch?v=${result.videoId}`;
  const deepLinkUrl = `youtube://watch?v=${result.videoId}`;

  return {
    sourcePlatform: 'YOUTUBE',
    title: result.title,
    creatorName: result.channelName,
    thumbnailUrl: result.thumbnailUrl,
    externalUrl: webUrl,
    deepLinkUrl: deepLinkUrl,
    searchQuery: result.searchQuery,
    publishedAt: result.publishedAt,
  };
}

/**
 * Search for trending music on YouTube
 */
export async function getTrendingMusic(maxResults: number = 20): Promise<YouTubeDiscoverResult[]> {
  const trendingQueries = [
    'trending music 2024',
    'new music releases this week',
    'viral songs 2024',
    'top hits music',
  ];

  return searchYouTubeMultiple(trendingQueries, Math.ceil(maxResults / trendingQueries.length));
}

/**
 * Search for music similar to user's clicks/saves
 */
export async function getSimilarMusic(
  clickedItems: { title: string; creatorName: string }[],
  maxResults: number = 15
): Promise<YouTubeDiscoverResult[]> {
  if (clickedItems.length === 0) {
    return [];
  }

  // Build queries from clicked items
  const queries = clickedItems.slice(0, 5).flatMap(item => [
    `${item.creatorName} music`,
    `songs like ${item.title}`,
    `${item.creatorName} similar artists`,
  ]);

  return searchYouTubeMultiple(queries, Math.ceil(maxResults / queries.length));
}

/**
 * Search for hidden gems (less popular but quality content)
 */
export async function getHiddenGems(
  preferences: { genres: string[]; moods: string[] },
  maxResults: number = 15
): Promise<YouTubeDiscoverResult[]> {
  const queries: string[] = [];

  for (const genre of preferences.genres.slice(0, 2)) {
    queries.push(`underrated ${genre} artists`);
    queries.push(`underground ${genre} music`);
    queries.push(`indie ${genre} songs`);
  }

  for (const mood of preferences.moods.slice(0, 2)) {
    queries.push(`hidden gem ${mood} music`);
  }

  queries.push('underrated songs you need to hear');
  queries.push('hidden gem artists');

  return searchYouTubeMultiple(queries, Math.ceil(maxResults / queries.length));
}

// ─── Curated Playlists ───────────────────────────────────────────────────────

const CURATED_PLAYLIST_IDS = [
  'RDCLAK5uy_m7EF_vYZXBhXNuduyXmhT00DYapc8cobs',
  'RDCLAK5uy_nZiG9ehz_MQoWQxY5yElsLHCcG0tv9PRg',
  'RDCLAK5uy_kZFOUXnpa_oJMql3vYc-jq6yVxwqhdkrM',
  'RDCLAK5uy_mv1P2oVguxLCIDXavV-jcDG1lQyukfSpo',
  'RDCLAK5uy_kP2172rQNb3KFXz880xp6M98R_ME5CIKA',
  'RDCLAK5uy_k4QxtdDiyPtN17wezA186nbXuqO36QOiU',
  'RDCLAK5uy_kw2wIlEv9llILhO0qoMTLsBBhmjzuibAc',
  'OLAK5uy_nE_yXCZeQMMpkcszZD3v9oiY8DnuKmaAw',
  'RDCLAK5uy_k6PkYWus1Mt-aKrbb0Ne8SkA2BgAk1Yy4',
];

export interface PlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
}

export interface CuratedPlaylistResult {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  tracks: PlaylistTrack[];
}

interface YouTubePlaylistItemsResponse {
  items: Array<{
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails: {
        default: { url: string };
        medium?: { url: string };
        high?: { url: string };
        maxres?: { url: string };
      };
      publishedAt: string;
      resourceId: { videoId: string };
    };
  }>;
}

interface YouTubePlaylistsMetaResponse {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      thumbnails: {
        default: { url: string };
        medium?: { url: string };
        high?: { url: string };
        maxres?: { url: string };
      };
    };
  }>;
}

let curatedPlaylistsCache: { results: CuratedPlaylistResult[]; expiresAt: number } | null = null;

/**
 * Fetch tracks from a single YouTube playlist
 */
export async function fetchPlaylistTracks(playlistId: string): Promise<PlaylistTrack[]> {
  const apiKey = getActiveKey();
  if (!apiKey) return [];

  const params = new URLSearchParams({
    part: 'snippet',
    playlistId,
    maxResults: '20',
    key: apiKey,
  });

  try {
    const response = await fetch(`${YOUTUBE_API_BASE}/playlistItems?${params}`);
    if (!response.ok) return [];

    const data = await response.json() as YouTubePlaylistItemsResponse;
    return data.items
      .filter(item => item.snippet?.resourceId?.videoId)
      .map(item => {
        const thumb = item.snippet.thumbnails;
        return {
          videoId: item.snippet.resourceId.videoId,
          title: decodeHtmlEntities(item.snippet.title),
          channelName: decodeHtmlEntities(item.snippet.channelTitle),
          thumbnailUrl: thumb.maxres?.url ?? thumb.high?.url ?? thumb.medium?.url ?? thumb.default.url,
          publishedAt: item.snippet.publishedAt,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Fetch all 5 curated playlists with their tracks (cached 24 hours)
 */
export async function fetchCuratedPlaylists(): Promise<CuratedPlaylistResult[]> {
  const apiKey = getActiveKey();
  if (!apiKey) return [];

  if (curatedPlaylistsCache && Date.now() < curatedPlaylistsCache.expiresAt) {
    return curatedPlaylistsCache.results;
  }

  // Fetch playlist metadata (names + thumbnails) in one call
  const metaParams = new URLSearchParams({
    part: 'snippet',
    id: CURATED_PLAYLIST_IDS.join(','),
    key: apiKey,
  });

  const playlistMeta = new Map<string, { name: string; thumbnailUrl: string }>();
  try {
    const metaRes = await fetch(`${YOUTUBE_API_BASE}/playlists?${metaParams}`);
    if (metaRes.ok) {
      const metaData = await metaRes.json() as YouTubePlaylistsMetaResponse;
      for (const item of metaData.items) {
        const t = item.snippet.thumbnails;
        playlistMeta.set(item.id, {
          name: decodeHtmlEntities(item.snippet.title),
          thumbnailUrl: t.maxres?.url ?? t.high?.url ?? t.medium?.url ?? t.default.url,
        });
      }
    }
  } catch {}

  // Fetch tracks for all playlists in parallel
  const results = await Promise.all(
    CURATED_PLAYLIST_IDS.map(async (playlistId) => {
      const tracks = await fetchPlaylistTracks(playlistId);
      const meta = playlistMeta.get(playlistId);
      return {
        playlistId,
        name: meta?.name ?? 'Curated Playlist',
        thumbnailUrl: meta?.thumbnailUrl ?? tracks[0]?.thumbnailUrl ?? '',
        tracks,
      };
    })
  );

  curatedPlaylistsCache = { results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS };
  return results;
}

// ─── New Releases (Trending Music) ───────────────────────────────────────────

interface YouTubeVideoItem {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: {
      default: { url: string };
      medium?: { url: string };
      high?: { url: string };
      maxres?: { url: string };
    };
    publishedAt: string;
  };
  statistics?: { viewCount?: string };
}

interface YouTubeVideosResponse {
  items: YouTubeVideoItem[];
}

export interface NewReleaseResult {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: string;
}

let newReleasesCache: { results: NewReleaseResult[]; expiresAt: number } | null = null;

/**
 * Fetch trending music via videos.list?chart=mostPopular — costs 0 quota units.
 */
export async function fetchNewReleases(maxResults = 20): Promise<NewReleaseResult[]> {
  const apiKey = getActiveKey();
  if (!apiKey) return [];

  if (newReleasesCache && Date.now() < newReleasesCache.expiresAt) {
    globalCacheHits++;
    return newReleasesCache.results;
  }

  const params = new URLSearchParams({
    part: "snippet,statistics",
    chart: "mostPopular",
    videoCategoryId: "10",
    maxResults: String(maxResults),
    regionCode: "US",
    key: apiKey,
  });

  try {
    const response = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);
    if (!response.ok) return [];

    const data = await response.json() as YouTubeVideosResponse;
    const results: NewReleaseResult[] = data.items.map(item => ({
      videoId: item.id,
      title: decodeHtmlEntities(item.snippet.title),
      channelName: decodeHtmlEntities(item.snippet.channelTitle),
      thumbnailUrl:
        item.snippet.thumbnails.maxres?.url ??
        item.snippet.thumbnails.high?.url ??
        item.snippet.thumbnails.medium?.url ??
        item.snippet.thumbnails.default.url,
      publishedAt: item.snippet.publishedAt,
      viewCount: item.statistics?.viewCount ?? "0",
    }));

    newReleasesCache = { results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS };
    return results;
  } catch {
    return [];
  }
}

/**
 * Decode HTML entities in text (YouTube returns encoded titles)
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
  };

  return text.replace(/&[#\w]+;/g, match => entities[match] || match);
}

/**
 * Search YouTube with per-user personalized queries
 * Filters out hidden creators and enforces diversity
 */
export async function searchYouTubePersonalized(
  queries: string[],
  hiddenCreators: Set<string>,
  maxResults: number = 15
): Promise<YouTubeDiscoverResult[]> {
  if (!getActiveKey()) {
    console.warn('[YouTube] No API keys available, skipping personalized search');
    return [];
  }

  if (queries.length === 0) {
    console.warn('[YouTube] No queries provided for personalized search');
    return [];
  }

  // Calculate results per query to stay within maxResults
  const resultsPerQuery = Math.max(2, Math.ceil(maxResults / queries.length));

  // Search with all queries
  const allResults = await searchYouTubeMultiple(queries, resultsPerQuery);

  // Filter out hidden creators
  const filteredResults = allResults.filter(result => {
    const creatorKey = result.channelName.toLowerCase();
    return !hiddenCreators.has(creatorKey);
  });

  console.log(`[YouTube] Personalized search: ${queries.length} queries, ${allResults.length} raw results, ${filteredResults.length} after filtering hidden creators`);

  return filteredResults.slice(0, maxResults);
}
