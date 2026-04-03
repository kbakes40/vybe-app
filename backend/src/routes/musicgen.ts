/**
 * MusicGen Routes
 *
 * API endpoints for VYBE Originals - AI-generated music catalog.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  getMusicGenCatalog,
  getTrack,
  getTracksByMood,
  getTracksByGenre,
  getFeaturedTracks,
  getTracks,
  generateArtworkSvg,
  getStatus,
  toVYBEFormat,
  getAvailableMoods,
  getAvailableGenres,
  getAvailableAlbums,
} from '../services/musicgenService';
import type { MusicGenMood, MusicGenGenre, MusicGenAlbum } from '../types/musicgen';

const musicgenRouter = new Hono();

// Validation schemas
const moodEnum = z.enum([
  'chill',
  'lofi',
  'focus',
  'productivity',
  'ambient',
  'cinematic',
  'late_night',
  'dreamy',
  'energetic',
  'uplifting',
  'melancholic',
  'ethereal',
  'groovy',
  'meditative',
]);

const genreEnum = z.enum([
  'electronic',
  'ambient',
  'lo-fi',
  'chillhop',
  'synthwave',
  'downtempo',
  'cinematic',
  'jazz',
  'classical',
  'world',
  'experimental',
]);

const albumEnum = z.enum([
  'AI Sessions Vol. 1',
  'AI Sessions Vol. 2',
  'AI Sessions Vol. 3',
  'Late Night Frequencies',
  'Focus Flow',
  'Ambient Horizons',
  'Cinematic Journeys',
  'Lo-Fi Dreams',
]);

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  sortBy: z.enum(['title', 'duration', 'addedAt', 'bpm']).optional().default('title'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

const tracksQuerySchema = paginationSchema.extend({
  mood: moodEnum.optional(),
  genre: genreEnum.optional(),
  album: albumEnum.optional(),
  featured: z
    .string()
    .optional()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
});

/**
 * GET /api/musicgen/status
 * Returns service status (always available for mock catalog)
 */
musicgenRouter.get('/status', async (c) => {
  try {
    const status = await getStatus();
    return c.json({ data: status });
  } catch (error) {
    console.error('MusicGen status error:', error);
    return c.json(
      { error: { message: 'Failed to get status', code: 'STATUS_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/musicgen/catalog
 * Returns the full catalog metadata with available filters
 */
musicgenRouter.get('/catalog', async (c) => {
  try {
    const catalog = await getMusicGenCatalog();

    // Get featured tracks in VYBE format
    const featuredTracks = catalog.featuredTracks.map(toVYBEFormat);

    return c.json({
      data: {
        totalTracks: catalog.totalTracks,
        moodCounts: catalog.moodCounts,
        genreCounts: catalog.genreCounts,
        albumCounts: catalog.albumCounts,
        featuredTracks,
        lastUpdated: catalog.lastUpdated,
        version: catalog.version,
        availableMoods: getAvailableMoods(),
        availableGenres: getAvailableGenres(),
        availableAlbums: getAvailableAlbums(),
      },
    });
  } catch (error) {
    console.error('MusicGen catalog error:', error);
    return c.json(
      { error: { message: 'Failed to fetch catalog', code: 'CATALOG_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/musicgen/tracks
 * Returns paginated tracks with optional filters (mood, genre, album, featured)
 */
musicgenRouter.get('/tracks', zValidator('query', tracksQuerySchema), async (c) => {
  try {
    const params = c.req.valid('query');

    const result = await getTracks(
      {
        mood: params.mood as MusicGenMood | undefined,
        genre: params.genre as MusicGenGenre | undefined,
        album: params.album as MusicGenAlbum | undefined,
        featured: params.featured,
      },
      {
        page: params.page,
        limit: params.limit,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      }
    );

    return c.json({
      data: {
        tracks: result.tracks,
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
    console.error('MusicGen tracks error:', error);
    return c.json(
      { error: { message: 'Failed to fetch tracks', code: 'TRACKS_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/musicgen/tracks/:id
 * Returns a single track by ID
 */
musicgenRouter.get('/tracks/:id', async (c) => {
  try {
    const trackId = c.req.param('id');
    const track = await getTrack(trackId);

    if (!track) {
      return c.json(
        { error: { message: 'Track not found', code: 'TRACK_NOT_FOUND' } },
        404
      );
    }

    const vybeTrack = toVYBEFormat(track);
    return c.json({ data: vybeTrack });
  } catch (error) {
    console.error('MusicGen track error:', error);
    return c.json(
      { error: { message: 'Failed to fetch track', code: 'TRACK_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/musicgen/artwork/:id
 * Generates and returns SVG artwork for a track
 */
musicgenRouter.get('/artwork/:id', async (c) => {
  try {
    const trackId = c.req.param('id');

    // Handle both full ID (musicgen-mg-001) and short ID (mg-001)
    const normalizedId = trackId.startsWith('musicgen-')
      ? trackId.replace('musicgen-', '')
      : trackId;

    const track = await getTrack(normalizedId);

    // Generate artwork even if track not found (use defaults)
    const title = track?.title || 'VYBE Track';
    const moods = track?.moodTags || [];

    const svg = generateArtworkSvg(normalizedId, title, moods);

    c.header('Content-Type', 'image/svg+xml');
    c.header('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

    return c.body(svg);
  } catch (error) {
    console.error('MusicGen artwork error:', error);

    // Return a default artwork on error
    const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <rect width="500" height="500" fill="#1a365d"/>
  <text x="250" y="240" font-family="Arial, sans-serif" font-size="32" fill="#63b3ed" text-anchor="middle">VYBE Studio</text>
  <text x="250" y="280" font-family="Arial, sans-serif" font-size="18" fill="#63b3ed" text-anchor="middle" opacity="0.7">AI Generated</text>
</svg>`;

    c.header('Content-Type', 'image/svg+xml');
    return c.body(defaultSvg);
  }
});

/**
 * GET /api/musicgen/moods
 * Returns available moods with track counts
 */
musicgenRouter.get('/moods', async (c) => {
  try {
    const catalog = await getMusicGenCatalog();
    const moods = getAvailableMoods().map((mood) => ({
      id: mood,
      name: mood
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
      trackCount: catalog.moodCounts[mood] || 0,
    }));

    return c.json({ data: moods });
  } catch (error) {
    console.error('MusicGen moods error:', error);
    return c.json(
      { error: { message: 'Failed to fetch moods', code: 'MOODS_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/musicgen/genres
 * Returns available genres with track counts
 */
musicgenRouter.get('/genres', async (c) => {
  try {
    const catalog = await getMusicGenCatalog();
    const genres = getAvailableGenres().map((genre) => ({
      id: genre,
      name: genre
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('-'),
      trackCount: catalog.genreCounts[genre] || 0,
    }));

    return c.json({ data: genres });
  } catch (error) {
    console.error('MusicGen genres error:', error);
    return c.json(
      { error: { message: 'Failed to fetch genres', code: 'GENRES_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/musicgen/albums
 * Returns available albums with track counts
 */
musicgenRouter.get('/albums', async (c) => {
  try {
    const catalog = await getMusicGenCatalog();
    const albums = getAvailableAlbums().map((album) => ({
      id: album.toLowerCase().replace(/\s+/g, '-').replace(/\./g, ''),
      name: album,
      trackCount: catalog.albumCounts[album] || 0,
    }));

    return c.json({ data: albums });
  } catch (error) {
    console.error('MusicGen albums error:', error);
    return c.json(
      { error: { message: 'Failed to fetch albums', code: 'ALBUMS_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/musicgen/featured
 * Returns featured tracks
 */
musicgenRouter.get('/featured', async (c) => {
  try {
    const featuredTracks = await getFeaturedTracks();
    const vybeTracks = featuredTracks.map(toVYBEFormat);

    return c.json({ data: vybeTracks });
  } catch (error) {
    console.error('MusicGen featured error:', error);
    return c.json(
      { error: { message: 'Failed to fetch featured tracks', code: 'FEATURED_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/musicgen/mood/:mood
 * Returns tracks filtered by mood
 */
musicgenRouter.get('/mood/:mood', zValidator('param', z.object({ mood: moodEnum })), async (c) => {
  try {
    const { mood } = c.req.valid('param');
    const tracks = await getTracksByMood(mood);
    const vybeTracks = tracks.map(toVYBEFormat);

    return c.json({ data: vybeTracks });
  } catch (error) {
    console.error('MusicGen mood tracks error:', error);
    return c.json(
      { error: { message: 'Failed to fetch tracks by mood', code: 'MOOD_TRACKS_ERROR' } },
      500
    );
  }
});

/**
 * GET /api/musicgen/genre/:genre
 * Returns tracks filtered by genre
 */
musicgenRouter.get('/genre/:genre', zValidator('param', z.object({ genre: genreEnum })), async (c) => {
  try {
    const { genre } = c.req.valid('param');
    const tracks = await getTracksByGenre(genre);
    const vybeTracks = tracks.map(toVYBEFormat);

    return c.json({ data: vybeTracks });
  } catch (error) {
    console.error('MusicGen genre tracks error:', error);
    return c.json(
      { error: { message: 'Failed to fetch tracks by genre', code: 'GENRE_TRACKS_ERROR' } },
      500
    );
  }
});

export { musicgenRouter };
