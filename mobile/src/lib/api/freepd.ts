import { api } from './api';
import {
  FreePDTrack,
  FreePDCatalogMeta,
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
export interface FreePDTracksResponse {
  tracks: FreePDTrack[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Raw shape from GET /api/freepd/tracks */
interface FreePDTracksApiPayload {
  tracks: FreePDTrack[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

function normalizeTracksResponse(payload: FreePDTracksApiPayload): FreePDTracksResponse {
  const { tracks, pagination } = payload;
  return {
    tracks,
    total: pagination.total,
    page: pagination.page,
    pageSize: pagination.limit,
    hasMore: pagination.hasNextPage,
  };
}

/**
 * Catalog metadata only (no track list)
 */
export async function fetchFreePDCatalogMeta(): Promise<FreePDCatalogMeta> {
  return api.get<FreePDCatalogMeta>('/api/freepd/catalog');
}

/**
 * Fetches every FreePD track page from the API (limit 100 per request).
 */
export async function fetchAllFreePDTracks(
  onProgress?: (loaded: number, total: number) => void
): Promise<FreePDTrack[]> {
  const pageSize = 100;
  const all: FreePDTrack[] = [];
  let page = 1;
  let hasMore = true;
  let total = 0;

  while (hasMore) {
    const res = await fetchFreePDTracks({ page, pageSize });
    if (page === 1) total = res.total;
    all.push(...res.tracks);
    onProgress?.(all.length, total);
    hasMore = res.hasMore && res.tracks.length > 0;
    page += 1;
    if (page > 1000) break;
  }

  return all;
}

/**
 * Fetches paginated tracks from FreePD
 */
export async function fetchFreePDTracks(
  params: FreePDSearchParams = {}
): Promise<FreePDTracksResponse> {
  const searchParams = new URLSearchParams();

  if (params.query) searchParams.set('query', params.query);
  if (params.category) searchParams.set('genre', params.category);
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
    searchParams.set('limit', String(params.pageSize));
  }

  const queryString = searchParams.toString();
  const url = queryString ? `/api/freepd/tracks?${queryString}` : '/api/freepd/tracks';

  const raw = await api.get<FreePDTracksApiPayload>(url);
  return normalizeTracksResponse(raw);
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
 * Searches FreePD tracks (GET /api/freepd/search)
 */
export async function searchFreePDTracks(
  query: string,
  filters?: Partial<FreePDSearchParams>
): Promise<FreePDTracksResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('q', query);
  if (filters?.page !== undefined) searchParams.set('page', String(filters.page));
  if (filters?.pageSize !== undefined) searchParams.set('limit', String(filters.pageSize));
  if (filters?.category) searchParams.set('genre', filters.category);
  if (filters?.moods?.length) searchParams.set('moods', filters.moods.join(','));
  const qs = searchParams.toString();
  const raw = await api.get<FreePDTracksApiPayload>(`/api/freepd/search?${qs}`);
  return normalizeTracksResponse(raw);
}

/**
 * Fetches available genres (with counts) and mood names from FreePD
 */
export async function fetchFreePDGenres(): Promise<FreePDGenresResponse> {
  const [genreRows, moodRows] = await Promise.all([
    api.get<Array<{ id: string; name: string; trackCount: number }>>('/api/freepd/genres'),
    api.get<Array<{ id: string; name: string }>>('/api/freepd/moods'),
  ]);
  return {
    genres: (genreRows ?? []).map((g) => ({ name: g.name, count: g.trackCount })),
    moods: (moodRows ?? []).map((m) => m.name),
  };
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
