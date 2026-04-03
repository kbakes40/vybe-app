/**
 * SoundCloud Service
 * Builds search handoff URLs for SoundCloud (no API needed)
 * Creates DiscoverItems that open SoundCloud search directly
 */

import type { DiscoverItem, SoundCloudDiscoverResult } from '../types/discover';

// Generic SoundCloud placeholder thumbnail
const SOUNDCLOUD_THUMBNAIL = 'https://a-v2.sndcdn.com/assets/images/sc-icons/ios-a62dfc8fe7.png';

/**
 * Build a SoundCloud search URL
 * Uses tracks filter to show only playable tracks, not playlists/users
 */
export function buildSoundCloudSearchUrl(query: string): string {
  const encodedQuery = encodeURIComponent(query);
  // Use /search/sounds to filter to tracks only
  return `https://soundcloud.com/search/sounds?q=${encodedQuery}`;
}

/**
 * Build a SoundCloud deep link URL for the app
 */
export function buildSoundCloudDeepLink(query: string): string {
  const encodedQuery = encodeURIComponent(query);
  // SoundCloud app deep link format for search
  return `soundcloud://search?q=${encodedQuery}`;
}

/**
 * Build search queries from user preferences for SoundCloud
 * SoundCloud tends to have more underground/indie content
 */
export function buildSoundCloudQueries(preferences: {
  genres: string[];
  moods: string[];
  favoriteArtists: string[];
}): string[] {
  const queries: string[] = [];

  // Artist-based queries
  for (const artist of preferences.favoriteArtists.slice(0, 3)) {
    queries.push(artist);
    queries.push(`${artist} remix`);
  }

  // Genre queries - SoundCloud has strong electronic/indie presence
  for (const genre of preferences.genres.slice(0, 3)) {
    queries.push(`${genre}`);
    queries.push(`${genre} mix`);
    queries.push(`${genre} underground`);
  }

  // Mood-based queries
  for (const mood of preferences.moods.slice(0, 2)) {
    queries.push(`${mood} beats`);
    queries.push(`${mood} vibes`);
  }

  // Discovery queries specific to SoundCloud strengths
  queries.push('lofi hip hop');
  queries.push('chill beats');
  queries.push('underground beats');
  queries.push('indie electronic');

  return queries;
}

/**
 * Create a SoundCloud discover result from a search query
 */
export function createSoundCloudResult(query: string): SoundCloudDiscoverResult {
  // Create a user-friendly title from the search query
  const formattedTitle = formatSearchTitle(query);

  return {
    searchQuery: query,
    title: formattedTitle,
    creatorName: 'Tap to search SoundCloud',
    thumbnailUrl: SOUNDCLOUD_THUMBNAIL,
  };
}

/**
 * Convert SoundCloud result to DiscoverItem format
 */
export function soundcloudResultToDiscoverItem(
  result: SoundCloudDiscoverResult
): Omit<DiscoverItem, 'id' | 'createdAt'> {
  return {
    sourcePlatform: 'SOUNDCLOUD',
    title: result.title,
    creatorName: result.creatorName,
    thumbnailUrl: result.thumbnailUrl,
    externalUrl: buildSoundCloudSearchUrl(result.searchQuery),
    deepLinkUrl: buildSoundCloudDeepLink(result.searchQuery),
    searchQuery: result.searchQuery,
    publishedAt: null, // SoundCloud search doesn't have a publish date
  };
}

/**
 * Generate SoundCloud discover items from preferences
 */
export function generateSoundCloudItems(
  preferences: {
    genres: string[];
    moods: string[];
    favoriteArtists: string[];
  },
  maxItems: number = 10
): Array<Omit<DiscoverItem, 'id' | 'createdAt'>> {
  const queries = buildSoundCloudQueries(preferences);

  // Take unique queries up to maxItems
  const uniqueQueries = [...new Set(queries)].slice(0, maxItems);

  return uniqueQueries.map(query => {
    const result = createSoundCloudResult(query);
    return soundcloudResultToDiscoverItem(result);
  });
}

/**
 * Generate trending SoundCloud search items
 */
export function generateTrendingSoundCloudItems(): Array<Omit<DiscoverItem, 'id' | 'createdAt'>> {
  const trendingQueries = [
    'trending',
    'new music',
    'charts',
    'hot tracks',
    'popular',
  ];

  return trendingQueries.map(query => {
    const result = createSoundCloudResult(query);
    return soundcloudResultToDiscoverItem(result);
  });
}

/**
 * Generate hidden gems SoundCloud search items
 */
export function generateHiddenGemsSoundCloudItems(
  genres: string[]
): Array<Omit<DiscoverItem, 'id' | 'createdAt'>> {
  const queries: string[] = [];

  for (const genre of genres.slice(0, 3)) {
    queries.push(`underground ${genre}`);
    queries.push(`indie ${genre}`);
  }

  queries.push('hidden gems');
  queries.push('undiscovered artists');
  queries.push('bedroom producer');

  return queries.map(query => {
    const result = createSoundCloudResult(query);
    return soundcloudResultToDiscoverItem(result);
  });
}

/**
 * Format a search query into a user-friendly title
 */
function formatSearchTitle(query: string): string {
  // Capitalize first letter of each word
  const title = query
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return title;
}

/**
 * Generate SoundCloud items from personalized queries
 * Filters out hidden creators and creates varied titles
 */
export function generatePersonalizedSoundCloudItems(
  queries: string[],
  hiddenCreators: Set<string>,
  maxItems: number = 10
): Array<Omit<DiscoverItem, 'id' | 'createdAt'>> {
  if (queries.length === 0) {
    console.warn('[SoundCloud] No queries provided for personalized generation');
    return [];
  }

  // Take unique queries
  const uniqueQueries = [...new Set(queries)].slice(0, maxItems * 2); // Get more than needed to account for filtering

  const items: Array<Omit<DiscoverItem, 'id' | 'createdAt'>> = [];

  for (const query of uniqueQueries) {
    if (items.length >= maxItems) break;

    const result = createSoundCloudResult(query);

    // Check if the query contains a hidden creator name
    const queryLower = query.toLowerCase();
    let isHidden = false;

    for (const hiddenCreator of hiddenCreators) {
      if (queryLower.includes(hiddenCreator)) {
        isHidden = true;
        break;
      }
    }

    if (!isHidden) {
      items.push(soundcloudResultToDiscoverItem(result));
    }
  }

  console.log(`[SoundCloud] Personalized generation: ${queries.length} queries, ${items.length} items created`);

  return items;
}
