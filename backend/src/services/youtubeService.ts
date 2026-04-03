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

    const data = await response.json() as YouTubeSearchResponse;

    return data.items
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
