import { Track } from './music';

/**
 * FreePD-specific track interface
 * FreePD provides royalty-free music in the public domain
 */
export interface FreePDTrack extends Track {
  source: 'freepd';
  // FreePD-specific fields
  freePdId: string; // FreePD catalog ID
  freePdCategory: FreePDCategory; // Category in FreePD catalog
  freePdArtistPage?: string; // Link to artist's page on FreePD
  originalFileName?: string; // Original file name from FreePD
  // All FreePD tracks are public domain
  licenseName: 'Public Domain' | 'CC0';
  licenseUrl: string;
  attributionRequired: false;
  isDownloadable: true;
  isStreamable: true;
}

/**
 * FreePD catalog categories
 */
export type FreePDCategory =
  | 'electronic'
  | 'ambient'
  | 'cinematic'
  | 'orchestral'
  | 'rock'
  | 'pop'
  | 'jazz'
  | 'world'
  | 'comedy'
  | 'horror'
  | 'romantic'
  | 'upbeat'
  | 'mellow'
  | 'epic'
  | 'other';

/**
 * Metadata from GET /api/freepd/catalog (tracks come from paginated /tracks)
 */
export interface FreePDCatalogMeta {
  totalTracks: number;
  genreCounts?: Record<string, number>;
  lastUpdated?: string;
  version?: string;
  availableGenres?: string[];
  availableMoods?: string[];
  availableInstrumentProfiles?: string[];
}

/** @deprecated Use FreePDCatalogMeta + paginated tracks; kept for persisted cache shape */
export interface FreePDCatalogResponse {
  success: boolean;
  tracks: FreePDTrack[];
  totalCount: number;
  page: number;
  pageSize: number;
  categories: FreePDCategory[];
  lastUpdated?: string;
}

/**
 * Parameters for searching FreePD catalog
 */
export interface FreePDSearchParams {
  query?: string; // Search query (title, artist)
  category?: FreePDCategory; // Filter by category
  categories?: FreePDCategory[]; // Filter by multiple categories
  mood?: string; // Filter by mood tag
  moods?: string[]; // Filter by multiple mood tags
  minDuration?: number; // Minimum duration in seconds
  maxDuration?: number; // Maximum duration in seconds
  minBpm?: number; // Minimum BPM
  maxBpm?: number; // Maximum BPM
  musicalKey?: string; // Filter by musical key
  sortBy?: 'title' | 'artist' | 'duration' | 'bpm' | 'releaseYear' | 'popularity';
  sortOrder?: 'asc' | 'desc';
  page?: number; // Page number (1-indexed)
  pageSize?: number; // Number of results per page
}
