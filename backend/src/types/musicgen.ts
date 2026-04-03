/**
 * MusicGen Types
 *
 * Types for VYBE Originals - AI-generated music catalog powered by Meta MusicGen.
 * This is a mock catalog of pre-generated tracks for the VYBE app.
 */

/** Mood categories for MusicGen tracks */
export type MusicGenMood =
  | 'chill'
  | 'lofi'
  | 'focus'
  | 'productivity'
  | 'ambient'
  | 'cinematic'
  | 'late_night'
  | 'dreamy'
  | 'energetic'
  | 'uplifting'
  | 'melancholic'
  | 'ethereal'
  | 'groovy'
  | 'meditative';

/** Genre categories for MusicGen tracks */
export type MusicGenGenre =
  | 'electronic'
  | 'ambient'
  | 'lo-fi'
  | 'chillhop'
  | 'synthwave'
  | 'downtempo'
  | 'cinematic'
  | 'jazz'
  | 'classical'
  | 'world'
  | 'experimental';

/** Album names for VYBE Originals catalog */
export type MusicGenAlbum =
  | 'AI Sessions Vol. 1'
  | 'AI Sessions Vol. 2'
  | 'AI Sessions Vol. 3'
  | 'Late Night Frequencies'
  | 'Focus Flow'
  | 'Ambient Horizons'
  | 'Cinematic Journeys'
  | 'Lo-Fi Dreams';

/**
 * Represents a single MusicGen track
 */
export interface MusicGenTrack {
  /** Unique identifier for the track */
  id: string;

  /** Track title */
  title: string;

  /** Artist name (always "VYBE Studio" for MusicGen) */
  artist: string;

  /** Artist ID */
  artistId: string;

  /** Album name */
  album: MusicGenAlbum;

  /** Album ID */
  albumId: string;

  /** Duration in seconds */
  duration: number;

  /** Direct audio URL for playback */
  audioUrl: string;

  /** Artwork URL (SVG endpoint) */
  artworkUrl: string;

  /** Mood tags for filtering */
  moodTags: MusicGenMood[];

  /** Genre tags for filtering */
  genreTags: MusicGenGenre[];

  /** Whether this is a featured track */
  isFeatured: boolean;

  /** Track source identifier */
  source: 'musicgen';

  /** BPM (beats per minute) */
  bpm?: number;

  /** Track description */
  description?: string;

  /** Date the track was added */
  addedAt: string;

  /** Generation prompt (for reference) */
  generationPrompt?: string;
}

/**
 * VYBE-normalized track format for MusicGen tracks
 * Compatible with the mobile Track interface
 */
export interface VYBEMusicGenTrack {
  /** Unique ID in VYBE format */
  id: string;

  /** Track title */
  title: string;

  /** Artist name */
  artist: string;

  /** Artist ID */
  artistId: string;

  /** Album name */
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
  source: 'musicgen';

  /** MusicGen track ID */
  musicgenId: string;

  /** Direct audio URL for playback */
  audioUrl: string;

  /** Whether downloads are enabled */
  downloadable: boolean;

  /** Download URL */
  downloadUrl: string;

  /** Genre tags */
  genres: MusicGenGenre[];

  /** Mood tags */
  moods: MusicGenMood[];

  /** Whether this is a featured track */
  isFeatured: boolean;

  /** BPM */
  bpm?: number;

  /** Track description */
  description?: string;
}

/**
 * The full MusicGen catalog
 */
export interface MusicGenCatalog {
  /** All tracks in the catalog */
  tracks: MusicGenTrack[];

  /** Featured tracks */
  featuredTracks: MusicGenTrack[];

  /** Total number of tracks */
  totalTracks: number;

  /** Available moods with counts */
  moodCounts: Record<MusicGenMood, number>;

  /** Available genres with counts */
  genreCounts: Record<MusicGenGenre, number>;

  /** Available albums with counts */
  albumCounts: Record<MusicGenAlbum, number>;

  /** When the catalog was last updated */
  lastUpdated: string;

  /** Version of the catalog */
  version: string;
}

/**
 * Parameters for filtering MusicGen tracks
 */
export interface MusicGenFilterParams {
  /** Filter by mood */
  mood?: MusicGenMood;

  /** Filter by genre */
  genre?: MusicGenGenre;

  /** Filter by album */
  album?: MusicGenAlbum;

  /** Filter to featured only */
  featured?: boolean;
}

/**
 * Pagination parameters for listing tracks
 */
export interface MusicGenPaginationParams {
  /** Page number (1-indexed) */
  page?: number;

  /** Number of items per page */
  limit?: number;

  /** Sort field */
  sortBy?: 'title' | 'duration' | 'addedAt' | 'bpm';

  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Paginated response for MusicGen tracks
 */
export interface MusicGenPaginatedResponse {
  /** Tracks for the current page */
  tracks: VYBEMusicGenTrack[];

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
 * MusicGen service status
 */
export interface MusicGenStatus {
  /** Whether the service is available */
  available: boolean;

  /** Service version */
  version: string;

  /** Total tracks available */
  totalTracks: number;

  /** Last catalog update */
  lastUpdated: string;
}
