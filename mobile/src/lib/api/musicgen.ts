import { api } from './api';
import {
  MusicGenTrack,
  MusicGenCatalogResponse,
  MusicGenTracksResponse,
  MusicGenStatusResponse,
  MusicGenSearchParams,
  MusicGenMood,
  MusicGenGenre,
  MusicGenAlbum,
  RawMusicGenTrack,
  RawMusicGenTracksResponse,
} from '@/types/musicgen';

const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;

/**
 * Transforms a raw backend track to mobile-compatible format
 * - Converts source from 'musicgen' to 'vybe' for PlaybackController
 * - Converts relative artwork URLs to full URLs
 */
function transformTrack(raw: RawMusicGenTrack): MusicGenTrack {
  return {
    ...raw,
    source: 'vybe', // Transform for PlaybackController compatibility
    artwork: raw.artwork.startsWith('http')
      ? raw.artwork
      : `${baseUrl}${raw.artwork}`,
    genres: raw.genres as MusicGenGenre[],
    moods: raw.moods as MusicGenMood[],
    downloadable: true,
    isStreamable: true,
  };
}

/**
 * Transforms an array of raw tracks
 */
function transformTracks(rawTracks: RawMusicGenTrack[]): MusicGenTrack[] {
  return rawTracks.map(transformTrack);
}

/**
 * Checks if MusicGen service is available
 */
export async function fetchMusicGenStatus(): Promise<MusicGenStatusResponse> {
  return api.get<MusicGenStatusResponse>('/api/musicgen/status');
}

/**
 * Raw catalog metadata response from backend (no tracks array)
 */
interface RawCatalogMetadataResponse {
  totalTracks: number;
  moodCounts: Record<string, number>;
  genreCounts: Record<string, number>;
  albumCounts: Record<string, number>;
  featuredTracks: RawMusicGenTrack[];
  lastUpdated: string;
  version: string;
  availableMoods: string[];
  availableGenres: string[];
  availableAlbums: string[];
}

/**
 * Fetches the complete MusicGen catalog with featured tracks
 * Note: Backend catalog endpoint only returns metadata + featured tracks,
 * so we fetch all tracks separately via /tracks endpoint
 */
export async function fetchMusicGenCatalog(): Promise<MusicGenCatalogResponse> {
  // Fetch catalog metadata and all tracks in parallel
  const [catalogMeta, tracksResponse] = await Promise.all([
    api.get<RawCatalogMetadataResponse>('/api/musicgen/catalog'),
    api.get<{ tracks: RawMusicGenTrack[]; pagination: { total: number } }>(
      '/api/musicgen/tracks?limit=100'
    ),
  ]);

  // Handle case where catalogMeta might be undefined or incomplete
  const availableAlbums = catalogMeta?.availableAlbums || [];
  const albumCounts = catalogMeta?.albumCounts || {};

  // Build albums array from albumCounts
  const albums: MusicGenAlbum[] = availableAlbums.map((name) => ({
    id: name.toLowerCase().replace(/\s+/g, '-').replace(/\./g, ''),
    name,
    trackCount: albumCounts[name] || 0,
  }));

  return {
    tracks: transformTracks(tracksResponse?.tracks || []),
    featuredTracks: transformTracks(catalogMeta?.featuredTracks || []),
    totalTracks: catalogMeta?.totalTracks || 0,
    albums,
    moods: (catalogMeta?.availableMoods || []) as MusicGenMood[],
    genres: (catalogMeta?.availableGenres || []) as MusicGenGenre[],
  };
}

/**
 * Fetches paginated tracks with optional filters
 */
export async function fetchMusicGenTracks(
  params: MusicGenSearchParams = {}
): Promise<MusicGenTracksResponse> {
  const searchParams = new URLSearchParams();

  if (params.mood) searchParams.set('mood', params.mood);
  if (params.genre) searchParams.set('genre', params.genre);
  if (params.album) searchParams.set('album', params.album);
  if (params.featured !== undefined) {
    searchParams.set('featured', String(params.featured));
  }
  if (params.page !== undefined) searchParams.set('page', String(params.page));
  if (params.pageSize !== undefined) {
    searchParams.set('pageSize', String(params.pageSize));
  }

  const queryString = searchParams.toString();
  const url = queryString
    ? `/api/musicgen/tracks?${queryString}`
    : '/api/musicgen/tracks';

  const raw = await api.get<RawMusicGenTracksResponse>(url);

  return {
    tracks: transformTracks(raw.tracks),
    total: raw.total,
    page: raw.page,
    pageSize: raw.pageSize,
    hasMore: raw.hasMore,
  };
}

/**
 * Fetches featured tracks only
 */
export async function fetchMusicGenFeatured(): Promise<MusicGenTrack[]> {
  const raw = await api.get<RawMusicGenTrack[]>('/api/musicgen/featured');
  return transformTracks(raw);
}

/**
 * Fetches tracks filtered by mood
 */
export async function fetchMusicGenTracksByMood(
  mood: MusicGenMood,
  page = 1,
  pageSize = 20
): Promise<MusicGenTracksResponse> {
  const raw = await api.get<RawMusicGenTracksResponse>(
    `/api/musicgen/mood/${encodeURIComponent(mood)}?page=${page}&pageSize=${pageSize}`
  );

  return {
    tracks: transformTracks(raw.tracks),
    total: raw.total,
    page: raw.page,
    pageSize: raw.pageSize,
    hasMore: raw.hasMore,
  };
}

/**
 * Fetches tracks filtered by genre
 */
export async function fetchMusicGenTracksByGenre(
  genre: MusicGenGenre,
  page = 1,
  pageSize = 20
): Promise<MusicGenTracksResponse> {
  const raw = await api.get<RawMusicGenTracksResponse>(
    `/api/musicgen/genre/${encodeURIComponent(genre)}?page=${page}&pageSize=${pageSize}`
  );

  return {
    tracks: transformTracks(raw.tracks),
    total: raw.total,
    page: raw.page,
    pageSize: raw.pageSize,
    hasMore: raw.hasMore,
  };
}

/**
 * Gets the full artwork URL for a MusicGen track
 */
export function getMusicGenArtworkUrl(musicgenId: string): string {
  return `${baseUrl}/api/musicgen/artwork/${encodeURIComponent(musicgenId)}`;
}
