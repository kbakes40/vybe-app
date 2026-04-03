import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { auth } from '../auth';
import {
  recordListeningSignal,
  getTasteProfile,
  getDiscoverySections,
  findSimilarTracks,
  hideArtist,
  dislikeTrack,
  resetTasteProfile,
  storeTrackMetadata,
  generateBeatMatchQueue,
  getBeatMatchSeedTracks,
  saveBeatMatchState,
  getBeatMatchState,
  getTasteDNA,
} from '../services/discoveryService';
import type { BeatMatchRadioSettings } from '../types/discovery';

const discoveryRouter = new Hono();

// Validation schemas
const listeningSignalSchema = z.object({
  trackId: z.string().min(1),
  signalType: z.enum(['play', 'complete', 'skip', 'save', 'replay', 'unlike']),
  listenDuration: z.number().int().min(0).optional(),
  trackDuration: z.number().int().min(0).optional(),
  skipPosition: z.number().int().min(0).optional(),
});

const hideArtistSchema = z.object({
  artistId: z.string().min(1),
  artistName: z.string().min(1),
});

const dislikeSchema = z.object({
  trackId: z.string().min(1),
});

const trackMetadataSchema = z.object({
  trackId: z.string().min(1),
  features: z.object({
    tempo: z.number().int().min(0).optional(),
    tempoRange: z.enum(['slow', 'mid', 'fast']).optional(),
    energy: z.number().min(0).max(1).optional(),
    energyLevel: z.enum(['low', 'medium', 'high']).optional(),
    rhythmType: z.enum(['boom_bap', 'lo_fi', 'trap', 'house', 'jazz_swing', 'ambient', 'other']).optional(),
    instrumentProfile: z.enum(['drums_forward', 'bass_heavy', 'melodic', 'atmospheric']).optional(),
    moodTags: z.array(z.enum(['late_night', 'chill', 'focus', 'hype', 'soulful', 'experimental', 'melancholic', 'uplifting'])).optional(),
    eraFeel: z.enum(['old_soul', 'modern', 'future', 'timeless']).optional(),
    source: z.string().min(1),
    sourceId: z.string().optional(),
  }),
});

// Record listening signal
discoveryRouter.post('/signal', zValidator('json', listeningSignalSchema), async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  const body = c.req.valid('json');
  await recordListeningSignal(session.user.id, body);

  return c.json({ data: { success: true } });
});

// Get taste profile
discoveryRouter.get('/profile', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  const profile = await getTasteProfile(session.user.id);
  return c.json({ data: profile });
});

// Get discovery sections
discoveryRouter.get('/sections', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  const sections = await getDiscoverySections(session.user.id);
  return c.json({ data: sections });
});

// Find similar tracks
discoveryRouter.get('/similar/:trackId', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  const trackId = c.req.param('trackId');
  const limitParam = c.req.query('limit');
  const limit = limitParam ? parseInt(limitParam, 10) : 10;

  const similar = await findSimilarTracks(session.user.id, trackId, limit);
  return c.json({ data: similar });
});

// Hide artist
discoveryRouter.post('/hide-artist', zValidator('json', hideArtistSchema), async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  const { artistId, artistName } = c.req.valid('json');
  await hideArtist(session.user.id, artistId, artistName);

  return c.json({ data: { success: true } });
});

// Dislike track
discoveryRouter.post('/dislike', zValidator('json', dislikeSchema), async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  const { trackId } = c.req.valid('json');
  await dislikeTrack(session.user.id, trackId);

  return c.json({ data: { success: true } });
});

// Reset taste profile
discoveryRouter.delete('/profile', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  await resetTasteProfile(session.user.id);
  return c.json({ data: { success: true } });
});

// Store track metadata (for indexing)
discoveryRouter.post('/track-metadata', zValidator('json', trackMetadataSchema), async (c) => {
  const body = c.req.valid('json');
  await storeTrackMetadata(body.trackId, body.features);

  return c.json({ data: { success: true } });
});

// Beat Match Radio - generate queue
discoveryRouter.post('/beat-match-radio/queue', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  const { settings, count } = await c.req.json<{
    settings?: BeatMatchRadioSettings;
    count?: number;
  }>();

  const defaultSettings: BeatMatchRadioSettings = {
    moodLevel: 0.5,
    tempoLevel: 0.5,
    discoveryLevel: 0.3,
  };

  const queue = await generateBeatMatchQueue(
    session.user.id,
    settings ?? defaultSettings,
    count ?? 50
  );
  const seedTracks = await getBeatMatchSeedTracks(session.user.id);

  return c.json({
    data: {
      queue,
      seedTracks,
      settings: settings ?? defaultSettings,
    },
  });
});

// Beat Match Radio - save state
discoveryRouter.post('/beat-match-radio/state', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  const state = await c.req.json<{ queuePosition: number; settings: BeatMatchRadioSettings }>();
  await saveBeatMatchState(session.user.id, state);

  return c.json({ data: { success: true } });
});

// Beat Match Radio - get state
discoveryRouter.get('/beat-match-radio/state', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  const state = await getBeatMatchState(session.user.id);
  return c.json({ data: state });
});

// Taste DNA - get visualization data
discoveryRouter.get('/taste-dna', async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    return c.json({ error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } }, 401);
  }

  const tasteDNA = await getTasteDNA(session.user.id);
  return c.json({ data: tasteDNA });
});

export { discoveryRouter };
