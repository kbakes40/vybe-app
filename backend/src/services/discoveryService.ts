import { prisma } from '../prisma';
import type {
  TasteProfileData,
  ListeningSignalInput,
  DiscoveryTrack,
  DiscoverySection,
  TrackFeatures,
  SimilarityMatch,
  TrackMetadataInput,
  BeatMatchRadioSettings,
  TasteDNAResponse,
  TasteDNADimension,
} from '../types/discovery';

// Signal weights
const SIGNAL_WEIGHTS = {
  complete: 1.0,
  save: 1.0,
  replay: 1.0,
  play: 0.5,
  skip_late: 0.3, // Skip after 30s
  skip_early: 0.1, // Skip under 15s
  unlike: -0.5,
} as const;

// Calculate signal weight based on type and context
function calculateSignalWeight(
  signalType: string,
  listenDuration: number,
  _trackDuration: number
): number {
  if (signalType === 'skip') {
    if (listenDuration < 15) return SIGNAL_WEIGHTS.skip_early;
    if (listenDuration > 30) return SIGNAL_WEIGHTS.skip_late;
    return 0.2;
  }
  return SIGNAL_WEIGHTS[signalType as keyof typeof SIGNAL_WEIGHTS] ?? 0.5;
}

// Record a listening signal
export async function recordListeningSignal(
  userId: string,
  input: ListeningSignalInput
): Promise<void> {
  const now = new Date();
  const weight = calculateSignalWeight(
    input.signalType,
    input.listenDuration ?? 0,
    input.trackDuration ?? 180
  );

  await prisma.listeningSignal.create({
    data: {
      userId,
      trackId: input.trackId,
      signalType: input.signalType,
      listenDuration: input.listenDuration ?? 0,
      trackDuration: input.trackDuration ?? 0,
      skipPosition: input.skipPosition,
      hourOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
      weight,
    },
  });

  // Update taste profile in background
  updateTasteProfile(userId).catch(console.error);
}

// Update taste profile based on recent signals
export async function updateTasteProfile(userId: string): Promise<void> {
  // Get recent signals (last 30 days)
  const signals = await prisma.listeningSignal.findMany({
    where: {
      userId,
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  if (signals.length === 0) return;

  // Get track metadata for signals
  const trackIds = [...new Set(signals.map(s => s.trackId))];
  const trackMetadata = await prisma.trackMetadata.findMany({
    where: { trackId: { in: trackIds } },
  });
  const metadataMap = new Map(trackMetadata.map(t => [t.trackId, t]));

  // Calculate weighted averages
  let tempoSum = 0, tempoWeight = 0;
  let energySum = 0, energyWeight = 0;
  const moodCounts: Record<string, number> = {};
  const rhythmCounts: Record<string, number> = {};
  const eraCounts: Record<string, number> = {};
  const timePatterns: Record<number, { energySum: number; count: number }> = {};

  let totalCompletions = 0;
  let totalSkips = 0;

  for (const signal of signals) {
    const metadata = metadataMap.get(signal.trackId);
    if (!metadata) continue;

    const weight = signal.weight;

    // Tempo
    if (metadata.tempo) {
      tempoSum += metadata.tempo * weight;
      tempoWeight += weight;
    }

    // Energy
    if (metadata.energy !== null) {
      energySum += metadata.energy * weight;
      energyWeight += weight;
    }

    // Moods
    const moods = JSON.parse(metadata.moodTags || '[]') as string[];
    for (const mood of moods) {
      moodCounts[mood] = (moodCounts[mood] || 0) + weight;
    }

    // Rhythm
    if (metadata.rhythmType) {
      rhythmCounts[metadata.rhythmType] = (rhythmCounts[metadata.rhythmType] || 0) + weight;
    }

    // Era
    if (metadata.eraFeel) {
      eraCounts[metadata.eraFeel] = (eraCounts[metadata.eraFeel] || 0) + weight;
    }

    // Time patterns
    const hour = signal.hourOfDay;
    if (!timePatterns[hour]) timePatterns[hour] = { energySum: 0, count: 0 };
    if (metadata.energy !== null) {
      timePatterns[hour].energySum += metadata.energy;
      timePatterns[hour].count += 1;
    }

    // Stats
    if (signal.signalType === 'complete') totalCompletions++;
    if (signal.signalType === 'skip') totalSkips++;
  }

  // Normalize weights
  const normalizeWeights = (counts: Record<string, number>): Record<string, number> => {
    const max = Math.max(...Object.values(counts), 1);
    return Object.fromEntries(
      Object.entries(counts).map(([k, v]) => [k, v / max])
    );
  };

  const avgTempo = tempoWeight > 0 ? tempoSum / tempoWeight : 100;
  const avgEnergy = energyWeight > 0 ? energySum / energyWeight : 0.5;

  // Build time patterns
  const formattedTimePatterns: Record<string, { energy: number }> = {};
  for (const [hour, data] of Object.entries(timePatterns)) {
    if (data.count > 0) {
      formattedTimePatterns[hour] = { energy: data.energySum / data.count };
    }
  }

  // Upsert taste profile
  await prisma.tasteProfile.upsert({
    where: { userId },
    create: {
      userId,
      preferredTempoMin: Math.max(60, Math.floor(avgTempo - 20)),
      preferredTempoMax: Math.min(180, Math.floor(avgTempo + 20)),
      preferredEnergy: avgEnergy,
      moodWeights: JSON.stringify(normalizeWeights(moodCounts)),
      rhythmWeights: JSON.stringify(normalizeWeights(rhythmCounts)),
      eraWeights: JSON.stringify(normalizeWeights(eraCounts)),
      timePatterns: JSON.stringify(formattedTimePatterns),
      totalListens: signals.length,
      totalCompletions,
      totalSkips,
      lastUpdated: new Date(),
    },
    update: {
      preferredTempoMin: Math.max(60, Math.floor(avgTempo - 20)),
      preferredTempoMax: Math.min(180, Math.floor(avgTempo + 20)),
      preferredEnergy: avgEnergy,
      moodWeights: JSON.stringify(normalizeWeights(moodCounts)),
      rhythmWeights: JSON.stringify(normalizeWeights(rhythmCounts)),
      eraWeights: JSON.stringify(normalizeWeights(eraCounts)),
      timePatterns: JSON.stringify(formattedTimePatterns),
      totalListens: signals.length,
      totalCompletions,
      totalSkips,
      lastUpdated: new Date(),
    },
  });
}

// Get or create taste profile
export async function getTasteProfile(userId: string): Promise<TasteProfileData> {
  const profile = await prisma.tasteProfile.findUnique({ where: { userId } });

  if (!profile) {
    // Return default profile
    return {
      preferredTempoMin: 80,
      preferredTempoMax: 130,
      preferredEnergy: 0.5,
      moodWeights: {},
      rhythmWeights: {},
      genreWeights: {},
      eraWeights: {},
      timePatterns: {},
    };
  }

  return {
    preferredTempoMin: profile.preferredTempoMin,
    preferredTempoMax: profile.preferredTempoMax,
    preferredEnergy: profile.preferredEnergy,
    moodWeights: JSON.parse(profile.moodWeights) as Record<string, number>,
    rhythmWeights: JSON.parse(profile.rhythmWeights) as Record<string, number>,
    genreWeights: JSON.parse(profile.genreWeights) as Record<string, number>,
    eraWeights: JSON.parse(profile.eraWeights) as Record<string, number>,
    timePatterns: JSON.parse(profile.timePatterns) as Record<string, { energy?: number; moods?: string[] }>,
  };
}

// Calculate similarity score between taste profile and track
export function calculateSimilarityScore(
  profile: TasteProfileData,
  track: TrackFeatures
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  let factors = 0;

  // Tempo match (0-25 points)
  if (track.tempo) {
    if (track.tempo >= profile.preferredTempoMin && track.tempo <= profile.preferredTempoMax) {
      score += 25;
      reasons.push('Tempo matches your vibe');
    } else {
      const distance = Math.min(
        Math.abs(track.tempo - profile.preferredTempoMin),
        Math.abs(track.tempo - profile.preferredTempoMax)
      );
      score += Math.max(0, 25 - distance);
    }
    factors++;
  }

  // Energy match (0-25 points)
  if (track.energy !== undefined) {
    const energyDiff = Math.abs(track.energy - profile.preferredEnergy);
    const energyScore = 25 * (1 - energyDiff);
    score += energyScore;
    if (energyScore > 20) reasons.push('Energy level feels right');
    factors++;
  }

  // Rhythm match (0-20 points)
  if (track.rhythmType) {
    const rhythmWeight = profile.rhythmWeights[track.rhythmType];
    if (rhythmWeight !== undefined) {
      const rhythmScore = 20 * rhythmWeight;
      score += rhythmScore;
      if (rhythmScore > 15) reasons.push('Beat style you love');
      factors++;
    }
  }

  // Mood match (0-20 points)
  if (track.moodTags && track.moodTags.length > 0) {
    let moodScore = 0;
    for (const mood of track.moodTags) {
      if (profile.moodWeights[mood]) {
        moodScore += profile.moodWeights[mood];
      }
    }
    moodScore = Math.min(20, (moodScore / track.moodTags.length) * 20);
    score += moodScore;
    if (moodScore > 15) reasons.push('Mood matches your taste');
    factors++;
  }

  // Era match (0-10 points)
  if (track.eraFeel) {
    const eraWeight = profile.eraWeights[track.eraFeel];
    if (eraWeight !== undefined) {
      const eraScore = 10 * eraWeight;
      score += eraScore;
      if (eraScore > 7) reasons.push('Era you connect with');
      factors++;
    }
  }

  // Normalize score to 0-100
  const normalizedScore = factors > 0 ? (score / factors) * (100 / 25) : 50;

  return {
    score: Math.min(100, Math.max(0, normalizedScore)),
    reasons: reasons.slice(0, 2),
  };
}

// Find similar tracks
export async function findSimilarTracks(
  userId: string,
  seedTrackId: string,
  limit: number = 10
): Promise<SimilarityMatch[]> {
  const seedMetadata = await prisma.trackMetadata.findUnique({
    where: { trackId: seedTrackId },
  });

  if (!seedMetadata) return [];

  // Get user's hidden artists and disliked tracks
  const [hiddenArtists, dislikedTracks, recentlyPlayed] = await Promise.all([
    prisma.hiddenArtist.findMany({ where: { userId }, select: { artistId: true } }),
    prisma.dislikedTrack.findMany({ where: { userId }, select: { trackId: true } }),
    prisma.listeningSignal.findMany({
      where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      select: { trackId: true },
    }),
  ]);

  // Suppress unused variable warning - hiddenArtists will be used when we have artist data on tracks
  void hiddenArtists;

  const excludeTrackIds = new Set([
    seedTrackId,
    ...dislikedTracks.map(t => t.trackId),
    ...recentlyPlayed.map(t => t.trackId),
  ]);

  // Find tracks with similar features
  const candidates = await prisma.trackMetadata.findMany({
    where: {
      trackId: { notIn: [...excludeTrackIds] },
      // Match tempo range
      ...(seedMetadata.tempoRange && { tempoRange: seedMetadata.tempoRange }),
      // Match energy level
      ...(seedMetadata.energyLevel && { energyLevel: seedMetadata.energyLevel }),
    },
    take: 100,
  });

  // Score and rank candidates
  const matches: SimilarityMatch[] = candidates.map(candidate => {
    let score = 0;
    const reasons: string[] = [];

    // Rhythm type match (highest weight)
    if (candidate.rhythmType === seedMetadata.rhythmType) {
      score += 30;
      reasons.push('Same beat style');
    }

    // Energy match
    if (candidate.energy !== null && seedMetadata.energy !== null) {
      const energyDiff = Math.abs(candidate.energy - seedMetadata.energy);
      score += 25 * (1 - energyDiff);
      if (energyDiff < 0.2) reasons.push('Similar energy');
    }

    // Tempo match
    if (candidate.tempo && seedMetadata.tempo) {
      const tempoDiff = Math.abs(candidate.tempo - seedMetadata.tempo);
      score += Math.max(0, 20 - tempoDiff / 2);
      if (tempoDiff < 10) reasons.push('Similar tempo');
    }

    // Mood overlap
    const seedMoods = JSON.parse(seedMetadata.moodTags || '[]') as string[];
    const candidateMoods = JSON.parse(candidate.moodTags || '[]') as string[];
    const moodOverlap = seedMoods.filter(m => candidateMoods.includes(m)).length;
    score += moodOverlap * 5;
    if (moodOverlap > 0) reasons.push('Matching mood');

    // Era match
    if (candidate.eraFeel === seedMetadata.eraFeel) {
      score += 10;
    }

    return {
      trackId: candidate.trackId,
      score,
      reasons: reasons.slice(0, 2),
    };
  });

  // Sort by score and return top matches
  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Get discovery sections for user
export async function getDiscoverySections(userId: string): Promise<DiscoverySection[]> {
  const profile = await getTasteProfile(userId);
  const currentHour = new Date().getHours();

  // Check cache first (for now, we skip cache and generate fresh)
  const _cachedSections = await prisma.discoveryCache.findMany({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
  });

  const sections: DiscoverySection[] = [];

  // Made For You - personalized based on full taste profile
  const madeForYou = await generateMadeForYouSection(userId, profile);
  sections.push(madeForYou);

  // Time-based section
  if (currentHour >= 21 || currentHour < 5) {
    const lateNight = await generateLateNightSection(userId, profile);
    sections.push(lateNight);
  } else if (currentHour >= 6 && currentHour < 12) {
    sections.push({
      id: 'morning_vibes',
      title: 'Morning Energy',
      subtitle: 'Start your day right',
      tracks: [],
    });
  }

  // Beat Match Radio - based on recent plays
  const beatMatch = await generateBeatMatchSection(userId);
  if (beatMatch.tracks.length > 0) {
    sections.push(beatMatch);
  }

  // New But Familiar
  const newFamiliar = await generateNewButFamiliarSection(userId, profile);
  sections.push(newFamiliar);

  return sections;
}

async function generateMadeForYouSection(
  _userId: string,
  profile: TasteProfileData
): Promise<DiscoverySection> {
  // Get tracks that match user's taste profile
  const allTracks = await prisma.trackMetadata.findMany({
    where: {
      tempo: { gte: profile.preferredTempoMin, lte: profile.preferredTempoMax },
    },
    take: 50,
  });

  // Score and rank
  const scored = allTracks.map(track => {
    const features: TrackFeatures = {
      tempo: track.tempo ?? undefined,
      energy: track.energy ?? undefined,
      rhythmType: track.rhythmType as TrackFeatures['rhythmType'],
      moodTags: JSON.parse(track.moodTags || '[]') as TrackFeatures['moodTags'],
      eraFeel: track.eraFeel as TrackFeatures['eraFeel'],
    };
    const { score, reasons } = calculateSimilarityScore(profile, features);
    return { track, score, reasons };
  });

  const topTracks = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
    .map(({ track, reasons }) => ({
      id: track.trackId,
      title: 'Track', // Would be filled from track data
      artist: 'Artist',
      artwork: '',
      duration: 180,
      source: track.source as DiscoveryTrack['source'],
      matchReason: reasons[0],
      similarityScore: 0,
    }));

  return {
    id: 'made_for_you',
    title: 'Made For You',
    subtitle: 'Based on your unique taste',
    tracks: topTracks,
  };
}

async function generateLateNightSection(
  _userId: string,
  _profile: TasteProfileData
): Promise<DiscoverySection> {
  const tracks = await prisma.trackMetadata.findMany({
    where: {
      moodTags: { contains: 'late_night' },
      energyLevel: { in: ['low', 'medium'] },
    },
    take: 15,
  });

  return {
    id: 'late_night',
    title: 'Late Night',
    subtitle: 'Sounds for the quiet hours',
    tracks: tracks.map(t => ({
      id: t.trackId,
      title: 'Track',
      artist: 'Artist',
      artwork: '',
      duration: 180,
      source: t.source as DiscoveryTrack['source'],
    })),
  };
}

async function generateBeatMatchSection(userId: string): Promise<DiscoverySection> {
  // Get most recent completed track
  const recentComplete = await prisma.listeningSignal.findFirst({
    where: { userId, signalType: 'complete' },
    orderBy: { createdAt: 'desc' },
  });

  if (!recentComplete) {
    return { id: 'beat_match', title: 'Beat Match Radio', tracks: [] };
  }

  const similar = await findSimilarTracks(userId, recentComplete.trackId, 15);

  return {
    id: 'beat_match',
    title: 'Beat Match Radio',
    subtitle: 'Tracks with similar rhythm',
    tracks: similar.map(s => ({
      id: s.trackId,
      title: 'Track',
      artist: 'Artist',
      artwork: '',
      duration: 180,
      source: 'vybe' as const,
      matchReason: s.reasons[0],
      similarityScore: s.score,
    })),
  };
}

async function generateNewButFamiliarSection(
  userId: string,
  profile: TasteProfileData
): Promise<DiscoverySection> {
  // Get tracks user hasn't heard but match their taste
  const playedTrackIds = await prisma.listeningSignal.findMany({
    where: { userId },
    select: { trackId: true },
    distinct: ['trackId'],
  });

  const playedSet = new Set(playedTrackIds.map(t => t.trackId));

  const candidates = await prisma.trackMetadata.findMany({
    where: {
      trackId: { notIn: [...playedSet] },
    },
    take: 100,
  });

  const scored = candidates.map(track => {
    const features: TrackFeatures = {
      tempo: track.tempo ?? undefined,
      energy: track.energy ?? undefined,
      rhythmType: track.rhythmType as TrackFeatures['rhythmType'],
      moodTags: JSON.parse(track.moodTags || '[]') as TrackFeatures['moodTags'],
      eraFeel: track.eraFeel as TrackFeatures['eraFeel'],
    };
    return {
      track,
      ...calculateSimilarityScore(profile, features),
    };
  });

  const topNew = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  return {
    id: 'new_but_familiar',
    title: 'New But Familiar',
    subtitle: 'Fresh tracks that fit your taste',
    tracks: topNew.map(({ track, reasons }) => ({
      id: track.trackId,
      title: 'Track',
      artist: 'Artist',
      artwork: '',
      duration: 180,
      source: track.source as DiscoveryTrack['source'],
      matchReason: reasons[0],
    })),
  };
}

// Hide an artist
export async function hideArtist(
  userId: string,
  artistId: string,
  artistName: string
): Promise<void> {
  await prisma.hiddenArtist.upsert({
    where: { userId_artistId: { userId, artistId } },
    create: { userId, artistId, artistName },
    update: {},
  });
}

// Dislike a track
export async function dislikeTrack(userId: string, trackId: string): Promise<void> {
  await prisma.dislikedTrack.upsert({
    where: { userId_trackId: { userId, trackId } },
    create: { userId, trackId },
    update: {},
  });
}

// Reset taste profile
export async function resetTasteProfile(userId: string): Promise<void> {
  await Promise.all([
    prisma.tasteProfile.deleteMany({ where: { userId } }),
    prisma.listeningSignal.deleteMany({ where: { userId } }),
    prisma.discoveryCache.deleteMany({ where: { userId } }),
  ]);
}

// Store track metadata
export async function storeTrackMetadata(
  trackId: string,
  features: TrackMetadataInput
): Promise<void> {
  await prisma.trackMetadata.upsert({
    where: { trackId },
    create: {
      trackId,
      tempo: features.tempo,
      tempoRange: features.tempoRange,
      energy: features.energy,
      energyLevel: features.energyLevel,
      rhythmType: features.rhythmType,
      instrumentProfile: features.instrumentProfile,
      moodTags: JSON.stringify(features.moodTags || []),
      eraFeel: features.eraFeel,
      source: features.source,
      sourceId: features.sourceId,
    },
    update: {
      tempo: features.tempo,
      tempoRange: features.tempoRange,
      energy: features.energy,
      energyLevel: features.energyLevel,
      rhythmType: features.rhythmType,
      instrumentProfile: features.instrumentProfile,
      moodTags: JSON.stringify(features.moodTags || []),
      eraFeel: features.eraFeel,
    },
  });
}

// Beat Match Radio queue generation
export async function generateBeatMatchQueue(
  userId: string,
  settings: BeatMatchRadioSettings,
  count: number = 50
): Promise<DiscoveryTrack[]> {
  const profile = await getTasteProfile(userId);

  // Adjust profile based on settings
  const adjustedProfile = {
    ...profile,
    preferredEnergy: settings.moodLevel, // moodLevel maps to energy
    preferredTempoMin: Math.floor(60 + settings.tempoLevel * 60), // 60-120 BPM range
    preferredTempoMax: Math.floor(100 + settings.tempoLevel * 80), // 100-180 BPM range
  };

  // Get user exclusions
  const [hiddenArtists, dislikedTracks, recentlyPlayed] = await Promise.all([
    prisma.hiddenArtist.findMany({ where: { userId }, select: { artistId: true } }),
    prisma.dislikedTrack.findMany({ where: { userId }, select: { trackId: true } }),
    prisma.listeningSignal.findMany({
      where: { userId, createdAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
      select: { trackId: true },
    }),
  ]);

  void hiddenArtists; // Will use when we have artist data

  const excludeTrackIds = new Set([
    ...dislikedTracks.map(t => t.trackId),
    ...recentlyPlayed.map(t => t.trackId),
  ]);

  // Get candidate tracks
  const candidates = await prisma.trackMetadata.findMany({
    where: {
      trackId: { notIn: [...excludeTrackIds] },
      tempo: {
        gte: adjustedProfile.preferredTempoMin,
        lte: adjustedProfile.preferredTempoMax,
      },
    },
    take: 200,
  });

  // Score candidates
  const scored = candidates.map(track => {
    const features: TrackFeatures = {
      tempo: track.tempo ?? undefined,
      energy: track.energy ?? undefined,
      rhythmType: track.rhythmType as TrackFeatures['rhythmType'],
      moodTags: JSON.parse(track.moodTags || '[]'),
      eraFeel: track.eraFeel as TrackFeatures['eraFeel'],
    };

    const { score, reasons } = calculateSimilarityScore(adjustedProfile, features);

    // Add discovery bonus for adventurous mode
    const discoveryBonus = settings.discoveryLevel * 20 * Math.random();

    return { track, score: score + discoveryBonus, reasons };
  });

  // Sort and pick tracks with variety rules
  scored.sort((a, b) => b.score - a.score);

  const queue: DiscoveryTrack[] = [];
  const windowSize = 25;
  const maxArtistPerWindow = 2;

  for (const { track, reasons } of scored) {
    if (queue.length >= count) break;

    // Check artist limit in current window
    const windowStart = Math.max(0, queue.length - windowSize);
    const windowArtistCount = queue
      .slice(windowStart)
      .filter(t => t.artist === track.sourceId)
      .length;

    if (windowArtistCount >= maxArtistPerWindow) continue;

    queue.push({
      id: track.trackId,
      title: 'Track', // Would be filled from track data
      artist: 'Artist',
      artwork: '',
      duration: 180,
      source: track.source as DiscoveryTrack['source'],
      matchReason: reasons[0],
      similarityScore: 0,
    });
  }

  return queue;
}

// Get seed tracks for Beat Match Radio (tracks that influenced the queue)
export async function getBeatMatchSeedTracks(userId: string): Promise<DiscoveryTrack[]> {
  const recentCompleted = await prisma.listeningSignal.findMany({
    where: {
      userId,
      signalType: { in: ['complete', 'save'] },
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    distinct: ['trackId'],
  });

  const trackIds = recentCompleted.map(s => s.trackId);
  const metadata = await prisma.trackMetadata.findMany({
    where: { trackId: { in: trackIds } },
  });

  return metadata.slice(0, 3).map(t => ({
    id: t.trackId,
    title: 'Track',
    artist: 'Artist',
    artwork: '',
    duration: 180,
    source: t.source as DiscoveryTrack['source'],
  }));
}

// Save Beat Match Radio state
export async function saveBeatMatchState(
  userId: string,
  state: { queuePosition: number; settings: BeatMatchRadioSettings }
): Promise<void> {
  // Store in discovery cache with special section name
  await prisma.discoveryCache.upsert({
    where: { userId_section: { userId, section: 'beat_match_radio_state' } },
    create: {
      userId,
      section: 'beat_match_radio_state',
      trackIds: JSON.stringify(state),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
    update: {
      trackIds: JSON.stringify(state),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

// Get Beat Match Radio state
export async function getBeatMatchState(userId: string): Promise<{
  queuePosition: number;
  settings: BeatMatchRadioSettings;
} | null> {
  const cached = await prisma.discoveryCache.findUnique({
    where: { userId_section: { userId, section: 'beat_match_radio_state' } },
  });

  if (!cached) return null;

  try {
    return JSON.parse(cached.trackIds);
  } catch {
    return null;
  }
}

// Get Taste DNA for visualization
export async function getTasteDNA(userId: string): Promise<TasteDNAResponse> {
  const profile = await prisma.tasteProfile.findUnique({ where: { userId } });

  // Get listening history for timeline
  const firstSignal = await prisma.listeningSignal.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });

  // Calculate recent shifts (compare last 7 days vs previous 7 days)
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;

  const [_recentSignals, _olderSignals] = await Promise.all([
    prisma.listeningSignal.findMany({
      where: {
        userId,
        createdAt: { gte: new Date(now - week) },
      },
    }),
    prisma.listeningSignal.findMany({
      where: {
        userId,
        createdAt: {
          gte: new Date(now - 2 * week),
          lt: new Date(now - week),
        },
      },
    }),
  ]);

  // Build shifts based on track metadata changes
  const shifts: { label: string; direction: 'up' | 'down' }[] = [];

  if (profile) {
    const moodWeights = JSON.parse(profile.moodWeights || '{}');
    const rhythmWeights = JSON.parse(profile.rhythmWeights || '{}');
    const eraWeights = JSON.parse(profile.eraWeights || '{}');

    // Convert to display format
    const dimensions: TasteDNADimension[] = [
      {
        name: 'Energy',
        value: profile.preferredEnergy,
        label: profile.preferredEnergy < 0.33 ? 'Low' : profile.preferredEnergy < 0.66 ? 'Medium' : 'High',
      },
      {
        name: 'Tempo',
        value: (profile.preferredTempoMin + profile.preferredTempoMax) / 2 / 180,
        label: profile.preferredTempoMax < 100 ? 'Slow' : profile.preferredTempoMax < 130 ? 'Mid' : 'Fast',
      },
    ];

    // Top rhythms
    const topRhythms = Object.entries(rhythmWeights)
      .map(([name, weight]) => ({ name: formatRhythmName(name), weight: weight as number }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5);

    // Top moods
    const topMoods = Object.entries(moodWeights)
      .map(([name, weight]) => ({ name: formatMoodName(name), weight: weight as number }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6);

    // Top eras
    const topEras = Object.entries(eraWeights)
      .map(([name, weight]) => ({ name: formatEraName(name), weight: weight as number }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 3);

    return {
      dimensions,
      topRhythms,
      topMoods,
      topEras,
      recentShifts: shifts.slice(0, 3),
      totalListens: profile.totalListens,
      totalCompletions: profile.totalCompletions,
      listeningSince: firstSignal?.createdAt.toISOString() ?? null,
    };
  }

  // Return empty profile
  return {
    dimensions: [
      { name: 'Energy', value: 0.5, label: 'Medium' },
      { name: 'Tempo', value: 0.5, label: 'Mid' },
    ],
    topRhythms: [],
    topMoods: [],
    topEras: [],
    recentShifts: [],
    totalListens: 0,
    totalCompletions: 0,
    listeningSince: null,
  };
}

function formatRhythmName(name: string): string {
  const map: Record<string, string> = {
    'boom_bap': 'Boom Bap',
    'lo_fi': 'Lo-fi',
    'trap': 'Trap',
    'house': 'House',
    'jazz_swing': 'Jazz Swing',
    'ambient': 'Ambient',
  };
  return map[name] || name;
}

function formatMoodName(name: string): string {
  const map: Record<string, string> = {
    'late_night': 'Late Night',
    'chill': 'Chill',
    'focus': 'Focus',
    'hype': 'Hype',
    'soulful': 'Soulful',
    'experimental': 'Experimental',
    'melancholic': 'Melancholic',
    'uplifting': 'Uplifting',
  };
  return map[name] || name;
}

function formatEraName(name: string): string {
  const map: Record<string, string> = {
    'old_soul': 'Old Soul',
    'modern': 'Modern',
    'future': 'Future',
    'timeless': 'Timeless',
  };
  return map[name] || name;
}
