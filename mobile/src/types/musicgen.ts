import { Track } from './music';

/**
 * MusicGen moods available for filtering
 * Must match backend MusicGenMood type in backend/src/types/musicgen.ts
 */
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

/**
 * MusicGen genres available for filtering
 * Must match backend MusicGenGenre type in backend/src/types/musicgen.ts
 */
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

/**
 * MusicGen-specific track interface
 * VYBE Originals - AI-generated music catalog powered by Meta MusicGen
 * NOTE: source is 'vybe' for PlaybackController compatibility (backend returns 'musicgen')
 */
export interface MusicGenTrack extends Track {
  source: 'vybe';
  // MusicGen-specific fields
  musicgenId: string; // MusicGen catalog ID (e.g., 'mg-001')
  genres: MusicGenGenre[]; // Genre tags
  moods: MusicGenMood[]; // Mood tags
  isFeatured: boolean; // Whether track is featured
  description?: string; // AI-generated description
  // All MusicGen tracks are AI-generated and freely available
  downloadable: true;
  downloadUrl: string;
  isStreamable: true;
}

/**
 * Album grouping for MusicGen tracks
 */
export interface MusicGenAlbum {
  id: string;
  name: string;
  trackCount: number;
}

/**
 * Response from MusicGen status API
 */
export interface MusicGenStatusResponse {
  available: boolean;
  totalTracks: number;
}

/**
 * Response from MusicGen catalog API
 */
export interface MusicGenCatalogResponse {
  tracks: MusicGenTrack[];
  featuredTracks: MusicGenTrack[];
  totalTracks: number;
  albums: MusicGenAlbum[];
  moods: MusicGenMood[];
  genres: MusicGenGenre[];
}

/**
 * Response from paginated tracks API
 */
export interface MusicGenTracksResponse {
  tracks: MusicGenTrack[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Parameters for fetching MusicGen tracks
 */
export interface MusicGenSearchParams {
  mood?: MusicGenMood;
  genre?: MusicGenGenre;
  album?: string;
  featured?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * Raw backend track format (before transformation)
 * Backend returns source: 'musicgen', which we transform to 'vybe'
 */
export interface RawMusicGenTrack {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  artwork: string; // Relative path like '/api/musicgen/artwork/mg-001'
  duration: number;
  isLiked: boolean;
  source: 'musicgen'; // Backend source
  musicgenId: string;
  audioUrl: string;
  downloadable: boolean;
  downloadUrl: string;
  genres: string[];
  moods: string[];
  isFeatured: boolean;
  bpm?: number;
  description?: string;
}

/**
 * Raw backend catalog response
 */
export interface RawMusicGenCatalogResponse {
  tracks: RawMusicGenTrack[];
  featuredTracks: RawMusicGenTrack[];
  totalTracks: number;
  albums: MusicGenAlbum[];
  moods: string[];
  genres: string[];
}

/**
 * Raw backend tracks response (paginated)
 */
export interface RawMusicGenTracksResponse {
  tracks: RawMusicGenTrack[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
