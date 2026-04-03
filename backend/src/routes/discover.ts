/**
 * Discover Routes
 * API endpoints for the Discover recommendations feature
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { auth } from '../auth';
import {
  getUserPreferences,
  saveUserPreferences,
  buildDiscoverFeed,
  buildInstantOnboardingFeed,
  trackDiscoverEvent,
  getSavedDiscoverItems,
  removeSavedDiscoverItem,
} from '../services/feedBuilderService';

const discoverRouter = new Hono();

// Validation schemas
const savePreferencesSchema = z.object({
  genres: z.array(z.string()).optional(),
  moods: z.array(z.string()).optional(),
  favoriteArtists: z.array(z.string()).optional(),
  eraPreference: z.string().optional(),
});

const instantOnboardingSchema = z.object({
  genres: z.array(z.string()).default([]),
  moods: z.array(z.string()).default([]),
  favoriteArtists: z.array(z.string()).default([]),
});

const trackEventSchema = z.object({
  discoverItemId: z.string().min(1),
  eventType: z.enum(['impression', 'open', 'save', 'hide']),
  sectionId: z.string().optional(),
  position: z.number().int().min(0).optional(),
});

const removeSavedSchema = z.object({
  discoverItemId: z.string().min(1),
});

/**
 * GET /api/discover/feed
 * Get user's discover feed (from cache or fresh)
 */
discoverRouter.get('/feed', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  try {
    const feed = await buildDiscoverFeed(session.user.id, false);
    return c.json({ data: feed });
  } catch (error) {
    console.error('[Discover] Feed error:', error);
    return c.json(
      { error: { message: 'Failed to build discover feed', code: 'FEED_ERROR' } },
      500
    );
  }
});

/**
 * POST /api/discover/refresh
 * Force refresh the discover feed
 */
discoverRouter.post('/refresh', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  try {
    const feed = await buildDiscoverFeed(session.user.id, true);
    return c.json({ data: feed });
  } catch (error) {
    console.error('[Discover] Refresh error:', error);
    return c.json(
      { error: { message: 'Failed to refresh discover feed', code: 'REFRESH_ERROR' } },
      500
    );
  }
});

/**
 * POST /api/discover/instant-onboarding
 * Build feed immediately after onboarding with favorite artists
 * This uses instant artist queries for highly personalized results
 */
discoverRouter.post(
  '/instant-onboarding',
  zValidator('json', instantOnboardingSchema),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
    }

    const input = c.req.valid('json');

    try {
      // Save preferences first
      await saveUserPreferences(session.user.id, {
        genres: input.genres,
        moods: input.moods,
        favoriteArtists: input.favoriteArtists,
      });

      // Build instant feed with artist-focused queries
      const feed = await buildInstantOnboardingFeed(session.user.id, input);

      return c.json({ data: feed });
    } catch (error) {
      console.error('[Discover] Instant onboarding error:', error);
      return c.json(
        { error: { message: 'Failed to build personalized feed', code: 'ONBOARDING_ERROR' } },
        500
      );
    }
  }
);

/**
 * GET /api/discover/preferences
 * Get user's discover preferences
 */
discoverRouter.get('/preferences', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  try {
    const preferences = await getUserPreferences(session.user.id);
    return c.json({ data: preferences });
  } catch (error) {
    console.error('[Discover] Get preferences error:', error);
    return c.json(
      { error: { message: 'Failed to get preferences', code: 'PREFERENCES_ERROR' } },
      500
    );
  }
});

/**
 * POST /api/discover/preferences
 * Save user's discover preferences (onboarding)
 */
discoverRouter.post(
  '/preferences',
  zValidator('json', savePreferencesSchema),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
    }

    const input = c.req.valid('json');

    try {
      const preferences = await saveUserPreferences(session.user.id, input);
      return c.json({ data: preferences });
    } catch (error) {
      console.error('[Discover] Save preferences error:', error);
      return c.json(
        { error: { message: 'Failed to save preferences', code: 'SAVE_ERROR' } },
        500
      );
    }
  }
);

/**
 * POST /api/discover/event
 * Track a discover event (impression, open, save, hide)
 */
discoverRouter.post(
  '/event',
  zValidator('json', trackEventSchema),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
    }

    const input = c.req.valid('json');

    try {
      await trackDiscoverEvent(session.user.id, input);
      return c.json({ data: { success: true } });
    } catch (error) {
      console.error('[Discover] Track event error:', error);
      return c.json(
        { error: { message: 'Failed to track event', code: 'EVENT_ERROR' } },
        500
      );
    }
  }
);

/**
 * GET /api/discover/saved
 * Get user's saved discover items
 */
discoverRouter.get('/saved', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  try {
    const items = await getSavedDiscoverItems(session.user.id);
    return c.json({ data: items });
  } catch (error) {
    console.error('[Discover] Get saved error:', error);
    return c.json(
      { error: { message: 'Failed to get saved items', code: 'SAVED_ERROR' } },
      500
    );
  }
});

/**
 * DELETE /api/discover/saved
 * Remove a saved discover item
 */
discoverRouter.delete(
  '/saved',
  zValidator('json', removeSavedSchema),
  async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) {
      return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
    }

    const { discoverItemId } = c.req.valid('json');

    try {
      await removeSavedDiscoverItem(session.user.id, discoverItemId);
      return c.json({ data: { success: true } });
    } catch (error) {
      console.error('[Discover] Remove saved error:', error);
      return c.json(
        { error: { message: 'Failed to remove saved item', code: 'REMOVE_ERROR' } },
        500
      );
    }
  }
);

export { discoverRouter };
