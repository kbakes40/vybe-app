/**
 * YouTube Integration Service
 * Uses YouTube Data API to search for music videos
 * Returns properly formatted DiscoverItems that open in YouTube app/web
 */

import { env } from '../env';
import type {
  YouTubeSearchResponse,
  YouTubeSearchItem,
  YouTubeDiscoverResult,
  DiscoverItem,
} from '../types/discover';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ─── Quota Tracking ──────────────────────────────────────────────────────────
// YouTube Data API v3 costs: search.list (part=snippet) = 100 units per call
const QUOTA_COST_SEARCH = 100;

interface QuotaStats {
  totalUnits: number;
  callCount: number;
  cacheHits: number;
  resetAt: number; // epoch ms when daily quota resets (midnight PT)
}

const quotaStats: QuotaStats = {
  totalUnits: 0,
  callCount: 0,
  cacheHits: 0,
  resetAt: getNextMidnightPT(),
};

function getNextMidnightPT(): number {
  // YouTube quota resets midnight Pacific Time
  const now = new Date();
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pt.setHours(24, 0, 0, 0);
  return pt.getTime();
}

function trackQuotaUsage(units: number, caller: string): void {
  const now = Date.now();
  if (now > quotaStats.resetAt) {
    quotaStats.totalUnits = 0;
    quotaStats.callCount = 0;
    quotaStats.cacheHits = 0;
    quotaStats.resetAt = getNextMidnightPT();
    console.log('[YouTube Quota] Daily quota reset');
  }
  quotaStats.totalUnits += units;
  quotaStats.callCount++;
  console.log(
    `[YouTube Quota] +${units} units (${caller}) | today: ${quotaStats.totalUnits} units / ${quotaStats.callCount} calls | ${quotaStats.cacheHits} cache hits saved`
  );
}

export function getQuotaStats(): QuotaStats {
  return { ...quotaStats };
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
  return Boolean(env.YOUTUBE_API_KEY);
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
  if (!env.YOUTUBE_API_KEY) {
    console.warn('[YouTube] API key not configured, skipping search');
    return [];
  }

  // Check cache first
  const cached = getCachedSearch(query, maxResults);
  if (cached) {
    quotaStats.cacheHits++;
    console.log(`[YouTube Cache] HIT for "${query}" (saved ${QUOTA_COST_SEARCH} units)`);
    return cached;
  }

  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10', // Music category
    q: query,
    maxResults: maxResults.toString(),
    key: env.YOUTUBE_API_KEY,
    safeSearch: 'moderate',
  });

  try {
    const response = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[YouTube] Search failed: ${response.status} ${errorText}`);
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
  if (!env.YOUTUBE_API_KEY) {
    console.warn('[YouTube] API key not configured, skipping personalized search');
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
