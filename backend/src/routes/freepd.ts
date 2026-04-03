/**
 * FreePD Routes
 *
 * Provides API endpoints for accessing FreePD royalty-free music catalog.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  fetchFreePDCatalog,
  getFreePDTrack,
  getFreePDTracks,
  searchFreePDTracks,
  refreshFreePDCatalog,
  toVYBEFormat,
  generatePlaceholderArtwork,
  getAvailableGenres,
  getAvailableMoods,
  getAvailableInstrumentProfiles,
} from '../services/freepd';
import type { FreePDGenre, FreePDMood, FreePDInstrumentProfile } from '../types/freepd';

const freepdRouter = new Hono();

// Validation schemas
const genreEnum = z.enum([
  'epic',
  'upbeat',
  'romantic',
  'horror',
  'world',
  'comedy',
  'electronic',
  'ambient',
  'action',
  'dramatic',
  'corporate',
  'children',
  'holiday',
  'other',
]);

const moodEnum = z.enum([
  'happy',
  'sad',
  'energetic',
  'calm',
  'intense',
  'mysterious',
  'uplifting',
  'dark',
  'playful',
  'peaceful',
]);

const instrumentProfileEnum = z.enum([
  'orchestral',
  'electronic',
  'acoustic',
  'hybrid',
  'piano',
  'guitar',
]);

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(['title', 'artist', 'duration', 'addedAt']).optional().default('title'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

const tracksQuerySchema = paginationSchema.extend({
  genre: genreEnum.optional(),
  moods: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',') : undefined)),
  instrumentProfile: instrumentProfileEnum.optional(),
  minDuration: z.coerce.number().int().min(0).optional(),
  maxDuration: z.coerce.number().int().min(0).optional(),
  minBpm: z.coerce.number().int().min(0).optional(),
  maxBpm: z.coerce.number().int().min(0).optional(),
  tags: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',') : undefined)),
});

const searchQuerySchema = paginationSchema.extend({
  q: z.string().min(1),
  genre: genreEnum.optional(),
  moods: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',') : undefined)),
  instrumentProfile: instrumentProfileEnum.optional(),
});

/**
 * GET /api/freepd/catalog
 * Returns the full FreePD catalog with metadata
 */
freepdRouter.get('/catalog', async (c) => {
  try {
    const catalog = await fetchFreePDCatalog();

    return c.json({
      data: {
        totalTracks: catalog.totalTracks,
        genreCounts: catalog.genreCounts,
        lastUpdated: catalog.lastUpdated,
        version: catalog.version,
        availableGenres: getAvailableGenres(),
        availableMoods: getAvailableMoods(),
        availableInstrumentProfiles: getAvailableInstrumentProfiles(),
      },
    });
  } catch (error) {
    console.error('FreePD catalog error:', error);
    return c.json(
      { error: { message: 'Failed to fetch catalog', code: 'CATALOG_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/freepd/tracks
 * Returns paginated tracks with optional filters
 */
freepdRouter.get('/tracks', zValidator('query', tracksQuerySchema), async (c) => {
  try {
    const params = c.req.valid('query');

    const result = await getFreePDTracks({
      page: params.page,
      limit: params.limit,
      sortBy: params.sortBy,
      sortOrder: params.sortOrder,
      genre: params.genre as FreePDGenre | undefined,
      moods: params.moods as FreePDMood[] | undefined,
      instrumentProfile: params.instrumentProfile as FreePDInstrumentProfile | undefined,
      minDuration: params.minDuration,
      maxDuration: params.maxDuration,
      minBpm: params.minBpm,
      maxBpm: params.maxBpm,
      tags: params.tags,
    });

    // Convert tracks to VYBE format
    const vybeTracks = result.tracks.map(toVYBEFormat);

    return c.json({
      data: {
        tracks: vybeTracks,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
          hasNextPage: result.hasNextPage,
          hasPreviousPage: result.hasPreviousPage,
        },
      },
    });
  } catch (error) {
    console.error('FreePD tracks error:', error);
    return c.json(
      { error: { message: 'Failed to fetch tracks', code: 'TRACKS_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/freepd/tracks/:id
 * Returns a single track by ID
 */
freepdRouter.get('/tracks/:id', async (c) => {
  try {
    const trackId = c.req.param('id');

    // Handle both full ID (freepd-fpd-001) and short ID (fpd-001)
    const normalizedId = trackId.startsWith('freepd-')
      ? trackId.replace('freepd-', '')
      : trackId;

    const track = await getFreePDTrack(normalizedId);

    if (!track) {
      return c.json(
        { error: { message: 'Track not found', code: 'TRACK_NOT_FOUND' } },
        404
      );
    }

    const vybeTrack = toVYBEFormat(track);

    return c.json({ data: vybeTrack });
  } catch (error) {
    console.error('FreePD track error:', error);
    return c.json(
      { error: { message: 'Failed to fetch track', code: 'TRACK_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/freepd/artwork/:id
 * Generates and returns placeholder artwork SVG for a track
 */
freepdRouter.get('/artwork/:id', async (c) => {
  try {
    const trackId = c.req.param('id');

    // Handle both full ID (freepd-fpd-001) and short ID (fpd-001)
    const normalizedId = trackId.startsWith('freepd-')
      ? trackId.replace('freepd-', '')
      : trackId;

    const track = await getFreePDTrack(normalizedId);

    // Generate artwork even if track not found (use defaults)
    const genre = track?.genre || 'other';
    const title = track?.title || 'FreePD Track';

    const svg = generatePlaceholderArtwork(normalizedId, genre, title);

    c.header('Content-Type', 'image/svg+xml');
    c.header('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

    return c.body(svg);
  } catch (error) {
    console.error('FreePD artwork error:', error);

    // Return a default artwork on error
    const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <rect width="500" height="500" fill="#4a4e69"/>
  <text x="250" y="260" font-family="Arial, sans-serif" font-size="48" fill="#9a8c98" text-anchor="middle">FreePD</text>
</svg>`;

    c.header('Content-Type', 'image/svg+xml');
    return c.body(defaultSvg);
  }
});

/**
 * GET /api/freepd/search
 * Search FreePD tracks by query string
 */
freepdRouter.get('/search', zValidator('query', searchQuerySchema), async (c) => {
  try {
    const params = c.req.valid('query');

    const result = await searchFreePDTracks(params.q, {
      genre: params.genre as FreePDGenre | undefined,
      moods: params.moods as FreePDMood[] | undefined,
      instrumentProfile: params.instrumentProfile as FreePDInstrumentProfile | undefined,
    });

    // Apply pagination
    const page = params.page;
    const limit = params.limit;
    const offset = (page - 1) * limit;
    const paginatedTracks = result.tracks.slice(offset, offset + limit);

    // Convert tracks to VYBE format
    const vybeTracks = paginatedTracks.map(toVYBEFormat);

    return c.json({
      data: {
        tracks: vybeTracks,
        query: params.q,
        pagination: {
          total: result.total,
          page,
          limit,
          totalPages: Math.ceil(result.total / limit),
          hasNextPage: offset + limit < result.total,
          hasPreviousPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('FreePD search error:', error);
    return c.json(
      { error: { message: 'Search failed', code: 'SEARCH_ERROR' } },
      500
    );
  }
});

/**
 * POST /api/freepd/refresh
 * Triggers a catalog refresh
 * In production, this would re-scrape FreePD for new tracks
 */
freepdRouter.post('/refresh', async (c) => {
  try {
    const result = await refreshFreePDCatalog();

    if (!result.success) {
      return c.json(
        {
          error: {
            message: 'Catalog refresh failed',
            code: 'REFRESH_FAILED',
            details: result.errors,
          },
        },
        500
      );
    }

    return c.json({
      data: {
        success: true,
        tracksImported: result.tracksImported,
        tracksUpdated: result.tracksUpdated,
        durationMs: result.durationMs,
        completedAt: result.completedAt,
      },
    });
  } catch (error) {
    console.error('FreePD refresh error:', error);
    return c.json(
      { error: { message: 'Refresh failed', code: 'REFRESH_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/freepd/genres
 * Returns available genres with track counts
 */
freepdRouter.get('/genres', async (c) => {
  try {
    const catalog = await fetchFreePDCatalog();

    const genres = getAvailableGenres().map((genre) => ({
      id: genre,
      name: genre.charAt(0).toUpperCase() + genre.slice(1),
      trackCount: catalog.genreCounts[genre] || 0,
    }));

    return c.json({ data: genres });
  } catch (error) {
    console.error('FreePD genres error:', error);
    return c.json(
      { error: { message: 'Failed to fetch genres', code: 'GENRES_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/freepd/moods
 * Returns available moods
 */
freepdRouter.get('/moods', (c) => {
  const moods = getAvailableMoods().map((mood) => ({
    id: mood,
    name: mood.charAt(0).toUpperCase() + mood.slice(1),
  }));

  return c.json({ data: moods });
});

/**
 * GET /api/freepd/instruments
 * Returns available instrument profiles
 */
freepdRouter.get('/instruments', (c) => {
  const instruments = getAvailableInstrumentProfiles().map((profile) => ({
    id: profile,
    name: profile.charAt(0).toUpperCase() + profile.slice(1),
  }));

  return c.json({ data: instruments });
});

export { freepdRouter };
