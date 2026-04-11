/**
 * Discover Feature Types
 * External music recommendations from YouTube/SoundCloud
 */

// Source platforms for discover items
export type SourcePlatform = 'YOUTUBE' | 'SOUNDCLOUD';

// Event types for tracking user interactions
export type DiscoverEventType = 'impression' | 'open' | 'save' | 'hide';

// Section identifiers for the discover feed
export type DiscoverSectionId =
  | 'new_today'
  | 'trending'
  | 'similar_to_clicks'
  | 'hidden_gems'
  | 'vybe_beats';

/**
 * Unified DiscoverItem interface
 * Represents an external music recommendation that opens in YouTube/SoundCloud
 */
export interface DiscoverItem {
  id: string;
  sourcePlatform: SourcePlatform;
  title: string;
  creatorName: string;
  thumbnailUrl: string;
  externalUrl: string;      // Web URL to open in browser
  deepLinkUrl: string;      // App deep link (youtube://..., soundcloud://...)
  searchQuery: string;      // The search query that found this item
  publishedAt: string | null;
  createdAt: string;
}

/**
 * Discover feed section with items
 */
export interface DiscoverSection {
  id: DiscoverSectionId;
  title: string;
  subtitle: string;
  items: DiscoverItem[];
  refreshedAt: string;
}

/**
 * Complete discover feed response
 */
export interface DiscoverFeed {
  sections: DiscoverSection[];
  lastRefreshedAt: string;
  nextRefreshAt: string;    // When the feed should be refreshed
}

/**
 * User preferences for discover recommendations
 */
export interface DiscoverPreferences {
  genres: string[];
  moods: string[];
  favoriteArtists: string[];
  eraPreference: string | null;
  onboardingDone: boolean;
}

/**
 * Request to save user preferences
 */
export interface SavePreferencesInput {
  genres?: string[];
  moods?: string[];
  favoriteArtists?: string[];
  eraPreference?: string;
}

/**
 * Request to track a discover event
 */
export interface TrackEventInput {
  discoverItemId: string;
  eventType: DiscoverEventType;
  sectionId?: string;
  position?: number;
}

/**
 * YouTube API search result item
 */
export interface YouTubeSearchItem {
  id: {
    kind: string;
    videoId?: string;
    channelId?: string;
    playlistId?: string;
  };
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    thumbnails: {
      default: { url: string; width: number; height: number };
      medium: { url: string; width: number; height: number };
      high: { url: string; width: number; height: number };
    };
    channelTitle: string;
    liveBroadcastContent: string;
  };
}

/**
 * YouTube API search response
 */
export interface YouTubeSearchResponse {
  kind: string;
  etag: string;
  nextPageToken?: string;
  prevPageToken?: string;
  regionCode: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
  items: YouTubeSearchItem[];
}

/**
 * Internal representation of a YouTube video for discover
 */
export interface YouTubeDiscoverResult {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
  searchQuery: string;
}

/**
 * SoundCloud search handoff item
 * Since we don't use the SoundCloud API, we build search URLs
 */
export interface SoundCloudDiscoverResult {
  searchQuery: string;
  title: string;          // Generated title based on search
  creatorName: string;    // "SoundCloud Search"
  thumbnailUrl: string;   // Generic SoundCloud thumbnail
}

/**
 * Feed generation context for caching
 */
export interface FeedGenerationContext {
  searchQueries: string[];
  preferences: {
    genres: string[];
    moods: string[];
    favoriteArtists: string[];
  };
  timestamp: string;
}

/**
 * Cache entry for feed section
 */
export interface FeedCacheEntry {
  sectionId: DiscoverSectionId;
  itemIds: string[];
  generatedAt: string;
  expiresAt: string;
  context: FeedGenerationContext;
}
