import { api } from './api';
import {
  FreePDTrack,
  FreePDCatalogResponse,
  FreePDSearchParams,
  FreePDCategory,
} from '@/types/freepd';

/**
 * Response type for genres endpoint
 */
interface FreePDGenresResponse {
  genres: { name: string; count: number }[];
  moods: string[];
}

/**
 * Response type for paginated tracks
 */
interface FreePDTracksResponse {
  tracks: FreePDTrack[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Fetches the complete FreePD catalog
 * Use sparingly - prefer paginated fetchFreePDTracks for large catalogs
 */
export async function fetchFreePDCatalog(): Promise<FreePDCatalogResponse> {
  return api.get<FreePDCatalogResponse>('/api/freepd/catalog');
}

/**
 * Fetches paginated tracks from FreePD
 */
export async function fetchFreePDTracks(
  params: FreePDSearchParams = {}
): Promise<FreePDTracksResponse> {
  const searchParams = new URLSearchParams();

  if (params.query) searchParams.set('query', params.query);
  if (params.category) searchParams.set('category', params.category);
  if (params.categories?.length) {
    searchParams.set('categories', params.categories.join(','));
  }
  if (params.mood) searchParams.set('mood', params.mood);
  if (params.moods?.length) {
    searchParams.set('moods', params.moods.join(','));
  }
  if (params.minDuration !== undefined) {
    searchParams.set('minDuration', String(params.minDuration));
  }
  if (params.maxDuration !== undefined) {
    searchParams.set('maxDuration', String(params.maxDuration));
  }
  if (params.minBpm !== undefined) {
    searchParams.set('minBpm', String(params.minBpm));
  }
  if (params.maxBpm !== undefined) {
    searchParams.set('maxBpm', String(params.maxBpm));
  }
  if (params.musicalKey) searchParams.set('musicalKey', params.musicalKey);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  if (params.page !== undefined) searchParams.set('page', String(params.page));
  if (params.pageSize !== undefined) {
    searchParams.set('pageSize', String(params.pageSize));
  }

  const queryString = searchParams.toString();
  const url = queryString ? `/api/freepd/tracks?${queryString}` : '/api/freepd/tracks';

  return api.get<FreePDTracksResponse>(url);
}

/**
 * Fetches a single track by ID
 */
export async function fetchFreePDTrack(id: string): Promise<FreePDTrack | null> {
  try {
    return api.get<FreePDTrack>(`/api/freepd/tracks/${encodeURIComponent(id)}`);
  } catch (error) {
    console.warn('[FreePD] Error fetching track:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Searches FreePD tracks with query and optional filters
 */
export async function searchFreePDTracks(
  query: string,
  filters?: Partial<FreePDSearchParams>
): Promise<FreePDTracksResponse> {
  return fetchFreePDTracks({
    query,
    ...filters,
  });
}

/**
 * Fetches available genres and moods from FreePD
 */
export async function fetchFreePDGenres(): Promise<FreePDGenresResponse> {
  return api.get<FreePDGenresResponse>('/api/freepd/genres');
}

/**
 * Forces a refresh of the FreePD catalog cache on the server
 */
export async function refreshFreePDCatalog(): Promise<{
  success: boolean;
  tracksUpdated: number;
  lastUpdated: string;
}> {
  return api.post<{
    success: boolean;
    tracksUpdated: number;
    lastUpdated: string;
  }>('/api/freepd/refresh', {});
}

/**
 * Fetches tracks by genre/category
 */
export async function fetchFreePDTracksByGenre(
  genre: FreePDCategory,
  page = 1,
  pageSize = 20
): Promise<FreePDTracksResponse> {
  return fetchFreePDTracks({
    category: genre,
    page,
    pageSize,
  });
}

/**
 * Fetches tracks by mood
 */
export async function fetchFreePDTracksByMood(
  mood: string,
  page = 1,
  pageSize = 20
): Promise<FreePDTracksResponse> {
  return fetchFreePDTracks({
    mood,
    page,
    pageSize,
  });
}
