/**
 * FreePD Types
 *
 * FreePD provides royalty-free music for content creators.
 * Since FreePD doesn't have a public API, we use mock data for now.
 */

/** Genre categories available on FreePD */
export type FreePDGenre =
  | 'epic'
  | 'upbeat'
  | 'romantic'
  | 'horror'
  | 'world'
  | 'comedy'
  | 'electronic'
  | 'ambient'
  | 'action'
  | 'dramatic'
  | 'corporate'
  | 'children'
  | 'holiday'
  | 'other';

/** Mood tags for FreePD tracks */
export type FreePDMood =
  | 'happy'
  | 'sad'
  | 'energetic'
  | 'calm'
  | 'intense'
  | 'mysterious'
  | 'uplifting'
  | 'dark'
  | 'playful'
  | 'peaceful';

/** Instrument profile for FreePD tracks */
export type FreePDInstrumentProfile =
  | 'orchestral'
  | 'electronic'
  | 'acoustic'
  | 'hybrid'
  | 'piano'
  | 'guitar';

/**
 * Represents a single track from FreePD
 */
export interface FreePDTrack {
  /** Unique identifier for the track */
  id: string;

  /** Track title */
  title: string;

  /** Artist/composer name */
  artist: string;

  /** Artist ID for linking */
  artistId: string;

  /** Genre category */
  genre: FreePDGenre;

  /** Duration in seconds */
  duration: number;

  /** Mood tags */
  moods: FreePDMood[];

  /** Instrument profile */
  instrumentProfile: FreePDInstrumentProfile;

  /** URL to the track artwork (placeholder or generated) */
  artworkUrl: string;

  /** URL to download/stream the track */
  audioUrl: string;

  /** URL to the FreePD page for this track */
  sourceUrl: string;

  /** Whether the track is downloadable (always true for FreePD) */
  downloadable: boolean;

  /** Track source identifier */
  source: 'freepd';

  /** Date the track was added to the catalog */
  addedAt: string;

  /** BPM (beats per minute) if known */
  bpm?: number;

  /** Tags for search and categorization */
  tags: string[];
}

/**
 * The full FreePD catalog
 */
export interface FreePDCatalog {
  /** All tracks in the catalog */
  tracks: FreePDTrack[];

  /** Total number of tracks */
  totalTracks: number;

  /** Available genres with track counts */
  genreCounts: Record<FreePDGenre, number>;

  /** When the catalog was last updated */
  lastUpdated: string;

  /** Version of the catalog */
  version: string;
}

/**
 * Result of importing/refreshing the FreePD catalog
 */
export interface FreePDImportResult {
  /** Whether the import was successful */
  success: boolean;

  /** Number of tracks imported */
  tracksImported: number;

  /** Number of tracks updated */
  tracksUpdated: number;

  /** Number of tracks that failed to import */
  tracksFailed: number;

  /** Error messages if any */
  errors: string[];

  /** When the import started */
  startedAt: string;

  /** When the import completed */
  completedAt: string;

  /** Duration of the import in milliseconds */
  durationMs: number;
}

/**
 * Parameters for searching FreePD tracks
 */
export interface FreePDSearchParams {
  /** Search query for title/artist */
  query?: string;

  /** Filter by genre */
  genre?: FreePDGenre;

  /** Filter by moods (any match) */
  moods?: FreePDMood[];

  /** Filter by instrument profile */
  instrumentProfile?: FreePDInstrumentProfile;

  /** Minimum duration in seconds */
  minDuration?: number;

  /** Maximum duration in seconds */
  maxDuration?: number;

  /** Minimum BPM */
  minBpm?: number;

  /** Maximum BPM */
  maxBpm?: number;

  /** Filter by tags (any match) */
  tags?: string[];
}

/**
 * Pagination parameters for listing tracks
 */
export interface FreePDPaginationParams {
  /** Page number (1-indexed) */
  page?: number;

  /** Number of items per page */
  limit?: number;

  /** Sort field */
  sortBy?: 'title' | 'artist' | 'duration' | 'addedAt';

  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response for FreePD tracks
 */
export interface FreePDPaginatedResponse {
  /** Tracks for the current page */
  tracks: FreePDTrack[];

  /** Total number of tracks matching the filters */
  total: number;

  /** Current page number */
  page: number;

  /** Items per page */
  limit: number;

  /** Total number of pages */
  totalPages: number;

  /** Whether there is a next page */
  hasNextPage: boolean;

  /** Whether there is a previous page */
  hasPreviousPage: boolean;
}

/**
 * VYBE-normalized track format for FreePD tracks
 */
export interface VYBEFreePDTrack {
  /** Unique ID in VYBE format */
  id: string;

  /** Track title */
  title: string;

  /** Artist name */
  artist: string;

  /** Artist ID */
  artistId: string;

  /** Album (FreePD collection/genre) */
  album: string;

  /** Album ID */
  albumId: string;

  /** Artwork URL */
  artwork: string;

  /** Duration in seconds */
  duration: number;

  /** Whether the user has liked this track */
  isLiked: boolean;

  /** Source identifier */
  source: 'freepd';

  /** FreePD track ID */
  freepdId: string;

  /** URL to the FreePD page */
  freepdUrl: string;

  /** Direct audio URL for playback */
  audioUrl: string;

  /** Whether downloads are enabled (always true for FreePD) */
  downloadable: boolean;

  /** Download URL */
  downloadUrl: string;

  /** Genre */
  genre: FreePDGenre;

  /** Mood tags */
  moods: FreePDMood[];
}
