/**
 * Personalized Query Generator Service
 * Builds unique search queries per user based on preferences + behavior
 * This is the core of the personalization system.
 */

import { prisma } from '../prisma';
import type { DiscoverPreferences } from '../types/discover';

// ============================================
// TYPES
// ============================================

export interface UserBehaviorData {
  recentOpens: { query: string; creatorName: string; platform: string }[];
  recentSaves: { query: string; creatorName: string }[];
  recentHides: { creatorName: string }[];
}

export interface PersonalizedQueries {
  youtube: string[];
  soundcloud: string[];
  exploratory: string[];
}

// ============================================
// QUERY MIXING WEIGHTS
// ============================================

const PREFERENCE_WEIGHT = 0.6;  // 60% from preferences
const BEHAVIOR_WEIGHT = 0.3;   // 30% from recent behavior
const EXPLORATION_WEIGHT = 0.1; // 10% exploration

// ============================================
// ADJACENT GENRE MAPPING FOR EXPLORATION
// ============================================

const ADJACENT_GENRES: Record<string, string[]> = {
  'electronic': ['house', 'techno', 'ambient', 'downtempo', 'synthwave'],
  'hip hop': ['r&b', 'trap', 'jazz', 'soul', 'boom bap'],
  'rock': ['indie', 'alternative', 'metal', 'punk', 'grunge'],
  'pop': ['r&b', 'dance', 'indie pop', 'synth pop', 'electropop'],
  'jazz': ['soul', 'funk', 'r&b', 'neo soul', 'bebop'],
  'r&b': ['soul', 'hip hop', 'jazz', 'neo soul', 'funk'],
  'house': ['deep house', 'tech house', 'disco', 'electronic', 'garage'],
  'lo-fi': ['chill hop', 'jazz', 'ambient', 'bedroom pop', 'chillwave'],
  'ambient': ['electronic', 'downtempo', 'new age', 'drone', 'lo-fi'],
  'techno': ['electronic', 'house', 'industrial', 'minimal', 'acid'],
  'indie': ['alternative', 'rock', 'indie pop', 'dream pop', 'shoegaze'],
  'soul': ['r&b', 'funk', 'motown', 'jazz', 'gospel'],
  'classical': ['orchestral', 'piano', 'chamber', 'opera', 'baroque'],
  'country': ['folk', 'americana', 'bluegrass', 'country pop', 'honky tonk'],
  'folk': ['acoustic', 'singer-songwriter', 'country', 'americana', 'indie folk'],
  'metal': ['hard rock', 'thrash', 'death metal', 'black metal', 'progressive metal'],
  'punk': ['hardcore', 'post-punk', 'pop punk', 'alternative', 'emo'],
  'reggae': ['dub', 'ska', 'dancehall', 'roots', 'lovers rock'],
  'blues': ['soul', 'jazz', 'rock', 'delta blues', 'chicago blues'],
  'funk': ['soul', 'disco', 'r&b', 'jazz funk', 'p-funk'],
  'disco': ['funk', 'house', 'dance', 'boogie', 'nu-disco'],
  'trap': ['hip hop', 'drill', 'phonk', 'cloud rap', 'southern rap'],
  'drill': ['trap', 'hip hop', 'grime', 'uk drill', 'chicago drill'],
  'dnb': ['drum and bass', 'jungle', 'liquid', 'breakbeat', 'neurofunk'],
  'drum and bass': ['jungle', 'liquid dnb', 'neurofunk', 'breakbeat', 'dubstep'],
  'dubstep': ['bass music', 'brostep', 'riddim', 'future bass', 'trap'],
  'edm': ['electronic', 'house', 'trance', 'dubstep', 'big room'],
  'trance': ['progressive', 'psytrance', 'uplifting', 'vocal trance', 'goa'],
  'chill': ['lo-fi', 'ambient', 'downtempo', 'chillwave', 'trip hop'],
  'world': ['afrobeat', 'latin', 'reggaeton', 'k-pop', 'j-pop'],
  'latin': ['reggaeton', 'salsa', 'bachata', 'cumbia', 'latin pop'],
};

// ============================================
// MOOD COMBINATIONS FOR VARIED QUERIES
// ============================================

const MOOD_MODIFIERS: Record<string, string[]> = {
  'chill': ['relaxing', 'calm', 'peaceful', 'mellow', 'laid back'],
  'energetic': ['upbeat', 'hype', 'pump up', 'workout', 'party'],
  'focus': ['concentration', 'study', 'work', 'deep focus', 'productivity'],
  'dreamy': ['ethereal', 'atmospheric', 'spacey', 'floating', 'surreal'],
  'uplifting': ['happy', 'positive', 'feel good', 'inspiring', 'euphoric'],
  'late night': ['midnight', 'after hours', 'nocturnal', 'dark', 'moody'],
  'melancholic': ['sad', 'emotional', 'bittersweet', 'longing', 'nostalgic'],
  'romantic': ['love songs', 'sensual', 'intimate', 'slow jams', 'sultry'],
  'aggressive': ['angry', 'intense', 'hard', 'powerful', 'rage'],
  'nostalgic': ['throwback', 'retro', 'classic', 'vintage', 'old school'],
};

// ============================================
// STARTER POOLS FOR NEW USERS
// ============================================

const STARTER_GENRE_POOLS = ['electronic', 'hip hop', 'indie', 'jazz', 'r&b', 'lo-fi', 'pop', 'rock', 'house', 'soul'];
const STARTER_MOOD_POOLS = ['chill', 'energetic', 'focus', 'dreamy', 'uplifting', 'late night'];

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/**
 * Get a random subset of items from an array
 */
function getRandomSubset<T>(array: T[], count: number): T[] {
  return shuffleArray(array).slice(0, count);
}

/**
 * Get a random item from an array
 */
function getRandomItem<T>(array: T[]): T | undefined {
  return array[Math.floor(Math.random() * array.length)];
}

// ============================================
// BEHAVIOR DATA FETCHING
// ============================================

/**
 * Get user behavior data from last 7 days
 */
export async function getUserBehaviorData(userId: string): Promise<UserBehaviorData> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Fetch recent opens (external_open events)
  const recentOpenEvents = await prisma.discoverEvent.findMany({
    where: {
      userId,
      eventType: 'open',
      createdAt: { gte: sevenDaysAgo },
    },
    include: {
      discoverItem: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // Fetch recent saves
  const recentSaveEvents = await prisma.discoverEvent.findMany({
    where: {
      userId,
      eventType: 'save',
      createdAt: { gte: sevenDaysAgo },
    },
    include: {
      discoverItem: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 15,
  });

  // Fetch recent hides (for exclusion)
  const recentHideEvents = await prisma.discoverEvent.findMany({
    where: {
      userId,
      eventType: 'hide',
      createdAt: { gte: sevenDaysAgo },
    },
    include: {
      discoverItem: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return {
    recentOpens: recentOpenEvents.map(e => ({
      query: e.discoverItem.searchQuery,
      creatorName: e.discoverItem.creatorName,
      platform: e.discoverItem.sourcePlatform,
    })),
    recentSaves: recentSaveEvents.map(e => ({
      query: e.discoverItem.searchQuery,
      creatorName: e.discoverItem.creatorName,
    })),
    recentHides: recentHideEvents.map(e => ({
      creatorName: e.discoverItem.creatorName,
    })),
  };
}

/**
 * Get hidden creators to filter out
 */
export async function getHiddenCreators(userId: string): Promise<Set<string>> {
  // Get from HiddenDiscoverItem table
  const hiddenItems = await prisma.hiddenDiscoverItem.findMany({
    where: { userId },
    include: {
      discoverItem: true,
    },
  });

  // Get from HiddenArtist table
  const hiddenArtists = await prisma.hiddenArtist.findMany({
    where: { userId },
    select: { artistName: true },
  });

  const creators = new Set<string>();

  for (const item of hiddenItems) {
    creators.add(item.discoverItem.creatorName.toLowerCase());
  }

  for (const artist of hiddenArtists) {
    creators.add(artist.artistName.toLowerCase());
  }

  return creators;
}

// ============================================
// PREFERENCE-BASED QUERIES (60%)
// ============================================

/**
 * Build preference-based queries
 * - genre + mood: "lofi chill", "house uplifting"
 * - mood only: "focus ambient", "late night downtempo"
 * - artist + genre: "Kendrick Lamar jazz", "ODESZA chill"
 */
function buildPreferenceQueries(preferences: DiscoverPreferences): string[] {
  const queries: string[] = [];
  const { genres, moods, favoriteArtists } = preferences;

  // No preferences - return empty (will use starter queries)
  if (genres.length === 0 && moods.length === 0 && favoriteArtists.length === 0) {
    return queries;
  }

  // 1. Genre + mood combinations (most personalized)
  for (const genre of genres.slice(0, 4)) {
    for (const mood of moods.slice(0, 3)) {
      queries.push(`${mood} ${genre}`);
      queries.push(`${genre} ${mood} music`);
    }
    // Genre with year for freshness
    queries.push(`${genre} music 2024`);
    queries.push(`${genre} new releases`);
    queries.push(`best ${genre}`);
  }

  // 2. Mood-based queries with variations
  for (const mood of moods.slice(0, 4)) {
    queries.push(`${mood} music`);
    queries.push(`${mood} vibes`);
    queries.push(`${mood} playlist`);

    // Use mood modifiers for variety
    const modifiers = MOOD_MODIFIERS[mood.toLowerCase()];
    if (modifiers) {
      const randomModifier = getRandomItem(modifiers);
      if (randomModifier) {
        queries.push(`${randomModifier} music`);
      }
    }
  }

  // 3. Artist-based queries (highest signal)
  for (const artist of favoriteArtists.slice(0, 4)) {
    queries.push(`${artist}`);
    queries.push(`${artist} music`);
    queries.push(`${artist} similar artists`);
    queries.push(`artists like ${artist}`);

    // Artist + genre combination
    if (genres.length > 0) {
      const randomGenre = getRandomItem(genres);
      if (randomGenre) {
        queries.push(`${artist} ${randomGenre}`);
      }
    }

    // Artist + mood combination
    if (moods.length > 0) {
      const randomMood = getRandomItem(moods);
      if (randomMood) {
        queries.push(`${artist} ${randomMood}`);
      }
    }
  }

  // 4. Cross-genre/mood queries for variety
  if (genres.length >= 2) {
    const [g1, g2] = genres.slice(0, 2);
    queries.push(`${g1} ${g2} fusion`);
  }

  return shuffleArray(queries);
}

// ============================================
// BEHAVIOR-BASED QUERIES (30%)
// ============================================

/**
 * Build behavior-based queries
 * - From last 10 external_open queries, remix with related genres/moods
 * - From saved items, reuse creatorName + mood
 * - Exclude hidden creators
 */
function buildBehaviorQueries(
  behavior: UserBehaviorData,
  preferences: DiscoverPreferences
): string[] {
  const queries: string[] = [];
  const { recentOpens, recentSaves } = behavior;

  // No behavior data - return empty
  if (recentOpens.length === 0 && recentSaves.length === 0) {
    return queries;
  }

  // 1. From recent opens - remix the queries
  for (const open of recentOpens.slice(0, 10)) {
    // Use the original query
    queries.push(open.query);

    // Creator-based variations
    if (open.creatorName && open.creatorName !== 'SoundCloud Search') {
      queries.push(`${open.creatorName}`);
      queries.push(`${open.creatorName} similar`);
      queries.push(`artists like ${open.creatorName}`);
    }

    // Mix query with user's moods
    if (preferences.moods.length > 0) {
      const randomMood = getRandomItem(preferences.moods);
      if (randomMood) {
        // Extract potential genre/artist from query
        const queryWords = open.query.split(' ').slice(0, 2).join(' ');
        queries.push(`${queryWords} ${randomMood}`);
      }
    }
  }

  // 2. From recent saves - these are high-signal items
  for (const save of recentSaves.slice(0, 8)) {
    // Creator-based queries (user explicitly saved this)
    if (save.creatorName && save.creatorName !== 'SoundCloud Search') {
      queries.push(`${save.creatorName} new`);
      queries.push(`${save.creatorName} best`);
      queries.push(`more ${save.creatorName}`);
    }

    // Query variations
    queries.push(save.query);
    queries.push(`${save.query} similar`);
  }

  // 3. Extract unique creators from opens and build "more like" queries
  const uniqueCreators = [...new Set(
    recentOpens
      .filter(o => o.creatorName && o.creatorName !== 'SoundCloud Search')
      .map(o => o.creatorName)
  )].slice(0, 5);

  for (const creator of uniqueCreators) {
    queries.push(`${creator} type beat`);
    queries.push(`${creator} style`);
  }

  return shuffleArray(queries);
}

// ============================================
// EXPLORATION QUERIES (10%)
// ============================================

/**
 * Build exploration queries
 * - Adjacent genres (electronic -> downtempo)
 * - Randomized but within user's taste profile
 */
function buildExplorationQueries(preferences: DiscoverPreferences): string[] {
  const queries: string[] = [];
  const { genres, moods } = preferences;

  // If no preferences, use random starter genres for exploration
  if (genres.length === 0 && moods.length === 0) {
    const randomGenres = getRandomSubset(STARTER_GENRE_POOLS, 3);
    const randomMoods = getRandomSubset(STARTER_MOOD_POOLS, 2);

    for (const genre of randomGenres) {
      queries.push(`discover ${genre}`);
      queries.push(`${genre} hidden gems`);
    }

    for (const mood of randomMoods) {
      queries.push(`${mood} discovery`);
    }

    return shuffleArray(queries);
  }

  // 1. Adjacent genres - expand user's taste
  for (const genre of genres.slice(0, 3)) {
    const adjacent = ADJACENT_GENRES[genre.toLowerCase()];
    if (adjacent) {
      const randomAdjacent = getRandomSubset(adjacent, 2);
      for (const adjGenre of randomAdjacent) {
        queries.push(`${adjGenre} music`);
        queries.push(`${adjGenre} discovery`);

        // Adjacent genre + user's mood
        if (moods.length > 0) {
          const randomMood = getRandomItem(moods);
          if (randomMood) {
            queries.push(`${adjGenre} ${randomMood}`);
          }
        }
      }
    }
  }

  // 2. Genre blending for exploration
  if (genres.length >= 2) {
    const adjacentGenres: string[] = [];
    for (const genre of genres.slice(0, 2)) {
      const adjacent = ADJACENT_GENRES[genre.toLowerCase()];
      if (adjacent && adjacent.length > 0) {
        const randomAdj = getRandomItem(adjacent);
        if (randomAdj) {
          adjacentGenres.push(randomAdj);
        }
      }
    }
    if (adjacentGenres.length >= 2) {
      queries.push(`${adjacentGenres[0]} ${adjacentGenres[1]} mix`);
    }
  }

  // 3. Hidden gems and underground queries based on taste
  for (const genre of genres.slice(0, 2)) {
    queries.push(`underground ${genre}`);
    queries.push(`${genre} hidden gems`);
    queries.push(`underrated ${genre} artists`);
  }

  // 4. Discovery modifiers
  queries.push('new music discovery');
  queries.push('fresh sounds');
  queries.push('undiscovered artists');

  return shuffleArray(queries);
}

// ============================================
// RANDOMIZED STARTER QUERIES
// ============================================

/**
 * Get randomized starter queries for users with no preferences
 */
export function getRandomizedStarterQueries(): PersonalizedQueries {
  // Randomly pick 3 genres and 2 moods from pools
  const genres = getRandomSubset(STARTER_GENRE_POOLS, 3);
  const moods = getRandomSubset(STARTER_MOOD_POOLS, 2);

  const youtube: string[] = [];
  const soundcloud: string[] = [];
  const exploratory: string[] = [];

  // Build varied queries from random selections
  for (const genre of genres) {
    youtube.push(`${genre} music 2024`);
    youtube.push(`best ${genre}`);
    soundcloud.push(`${genre}`);
    soundcloud.push(`${genre} mix`);

    for (const mood of moods) {
      youtube.push(`${mood} ${genre}`);
      soundcloud.push(`${mood} ${genre}`);
    }
  }

  for (const mood of moods) {
    youtube.push(`${mood} music`);
    youtube.push(`${mood} playlist`);
    soundcloud.push(`${mood} vibes`);
    soundcloud.push(`${mood} beats`);
  }

  // Exploratory
  exploratory.push('new music discovery');
  exploratory.push('trending music');
  exploratory.push('fresh sounds');

  const adjacentForRandom = genres
    .map(g => ADJACENT_GENRES[g.toLowerCase()])
    .filter(Boolean)
    .flat();

  if (adjacentForRandom.length > 0) {
    const randomAdj = getRandomSubset(adjacentForRandom, 2);
    for (const adj of randomAdj) {
      exploratory.push(`${adj} discovery`);
    }
  }

  return {
    youtube: shuffleArray(youtube),
    soundcloud: shuffleArray(soundcloud),
    exploratory: shuffleArray(exploratory),
  };
}

// ============================================
// MAIN QUERY BUILDER
// ============================================

/**
 * Build personalized queries for a user
 * This is the main function - builds truly unique queries per user
 */
export async function buildPersonalizedQueries(
  userId: string,
  preferences: DiscoverPreferences
): Promise<PersonalizedQueries> {
  // If no preferences set, return randomized starter queries
  const hasPreferences =
    preferences.genres.length > 0 ||
    preferences.moods.length > 0 ||
    preferences.favoriteArtists.length > 0;

  if (!hasPreferences) {
    console.log(`[PersonalizedQuery] User ${userId} has no preferences, using randomized starters`);
    return getRandomizedStarterQueries();
  }

  // Fetch user behavior data
  const behavior = await getUserBehaviorData(userId);

  // Build queries from each source
  const preferenceQueries = buildPreferenceQueries(preferences);
  const behaviorQueries = buildBehaviorQueries(behavior, preferences);
  const explorationQueries = buildExplorationQueries(preferences);

  console.log(`[PersonalizedQuery] User ${userId} - Preference queries: ${preferenceQueries.length}, Behavior queries: ${behaviorQueries.length}, Exploration queries: ${explorationQueries.length}`);

  // Calculate how many queries to take from each category
  const totalYouTube = 15;
  const totalSoundCloud = 10;

  // Distribute based on weights
  const youtubePreference = Math.round(totalYouTube * PREFERENCE_WEIGHT);
  const youtubeBehavior = Math.round(totalYouTube * BEHAVIOR_WEIGHT);
  const youtubeExploration = totalYouTube - youtubePreference - youtubeBehavior;

  const soundcloudPreference = Math.round(totalSoundCloud * PREFERENCE_WEIGHT);
  const soundcloudBehavior = Math.round(totalSoundCloud * BEHAVIOR_WEIGHT);
  const soundcloudExploration = totalSoundCloud - soundcloudPreference - soundcloudBehavior;

  // Select queries for YouTube
  const youtubeQueries = [
    ...preferenceQueries.slice(0, youtubePreference),
    ...behaviorQueries.slice(0, youtubeBehavior),
    ...explorationQueries.slice(0, youtubeExploration),
  ];

  // Select queries for SoundCloud (SoundCloud tends to have more underground content)
  // Prioritize genres, moods, and artist names over complex queries
  const soundcloudPreferenceQueries = preferenceQueries
    .filter(q => !q.includes('2024') && !q.includes('new releases'))
    .slice(0, soundcloudPreference);

  const soundcloudBehaviorQueries = behaviorQueries
    .filter(q => !q.includes('similar artists') && !q.includes('type beat'))
    .slice(0, soundcloudBehavior);

  const soundcloudExplorationQueries = explorationQueries
    .filter(q => !q.includes('discovery'))
    .slice(0, soundcloudExploration);

  const soundcloudQueries = [
    ...soundcloudPreferenceQueries,
    ...soundcloudBehaviorQueries,
    ...soundcloudExplorationQueries,
  ];

  // Deduplicate and shuffle
  const uniqueYouTube = [...new Set(youtubeQueries)];
  const uniqueSoundCloud = [...new Set(soundcloudQueries)];
  const uniqueExploratory = [...new Set(explorationQueries)];

  return {
    youtube: shuffleArray(uniqueYouTube),
    soundcloud: shuffleArray(uniqueSoundCloud),
    exploratory: shuffleArray(uniqueExploratory),
  };
}

// ============================================
// CREATOR DIVERSITY ENFORCEMENT
// ============================================

/**
 * Enforce creator diversity
 * - Max 1 item per creator in first 12 results
 * - Max 2 items per creator in whole section
 */
export function enforceCreatorDiversity<T extends { creatorName: string }>(
  items: T[],
  maxInFirst12: number = 1,
  maxTotal: number = 2
): T[] {
  const result: T[] = [];
  const creatorCounts: Map<string, number> = new Map();
  const creatorInFirst12: Map<string, number> = new Map();

  for (const item of items) {
    const creatorKey = item.creatorName.toLowerCase();
    const currentCount = creatorCounts.get(creatorKey) || 0;
    const currentInFirst12 = creatorInFirst12.get(creatorKey) || 0;

    // Check if we're in the first 12 items
    const isInFirst12 = result.length < 12;

    // Check limits
    if (isInFirst12) {
      if (currentInFirst12 >= maxInFirst12) {
        continue; // Skip - too many from this creator in first 12
      }
    }

    if (currentCount >= maxTotal) {
      continue; // Skip - too many from this creator overall
    }

    // Add item
    result.push(item);
    creatorCounts.set(creatorKey, currentCount + 1);

    if (isInFirst12) {
      creatorInFirst12.set(creatorKey, currentInFirst12 + 1);
    }
  }

  return result;
}

/**
 * Filter items by hidden creators
 */
export function filterHiddenCreators<T extends { creatorName: string }>(
  items: T[],
  hiddenCreators: Set<string>
): T[] {
  return items.filter(item => {
    const creatorKey = item.creatorName.toLowerCase();
    return !hiddenCreators.has(creatorKey);
  });
}

// ============================================
// INSTANT ARTIST QUERIES (ONBOARDING BOOST)
// ============================================

/**
 * Normalize favorite artists input
 * - Split by commas
 * - Trim whitespace
 * - Remove empty entries
 * - De-dupe case insensitive
 * - Keep top 5-8 artists max
 */
export function normalizeFavoriteArtists(input: string | string[]): string[] {
  let artists: string[];

  if (typeof input === 'string') {
    artists = input.split(',').map(a => a.trim()).filter(a => a.length > 0);
  } else {
    artists = input.map(a => a.trim()).filter(a => a.length > 0);
  }

  // De-dupe case insensitive while preserving original casing
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const artist of artists) {
    const lower = artist.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(artist);
    }
  }

  return unique.slice(0, 8); // Max 8 artists
}

/**
 * Genres that work well with "type beat" queries
 */
const TYPE_BEAT_GENRES = new Set([
  'hip hop', 'rap', 'r&b', 'pop', 'electronic', 'trap', 'drill', 'lo-fi', 'lofi'
]);

/**
 * Build instant "similar artist" queries immediately after onboarding
 * This generates 12-24 highly personalized queries per platform.
 *
 * Query types generated:
 * A) RADIO STYLE (high priority): "<ARTIST> radio", "<ARTIST> mix"
 * B) TYPE BEAT (for hip hop/r&b/pop): "<ARTIST> type beat"
 * C) ARTIST + GENRE: "Kendrick Lamar jazz"
 * D) ARTIST + MOOD: "Drake chill"
 * E) SIMILAR ARTIST: "similar to <ARTIST>", "artists like <ARTIST>"
 */
export function buildInstantArtistQueries(
  favoriteArtists: string[],
  genres: string[],
  moods: string[]
): PersonalizedQueries {
  const normalizedArtists = normalizeFavoriteArtists(favoriteArtists);

  // Query buckets
  const radioStyle: string[] = [];        // A) Radio/playlist style
  const typeBeat: string[] = [];          // B) Type beat style
  const artistGenre: string[] = [];       // C) Artist + genre
  const artistMood: string[] = [];        // D) Artist + mood
  const similarArtist: string[] = [];     // E) Similar artist discovery

  // Check if any genre supports type beat queries
  const supportsTypeBeat = genres.some(g => TYPE_BEAT_GENRES.has(g.toLowerCase()));

  for (const artist of normalizedArtists) {
    // A) RADIO STYLE (HIGH PRIORITY) - 4 queries per artist
    radioStyle.push(`${artist} radio`);
    radioStyle.push(`${artist} mix`);
    radioStyle.push(`${artist} playlist`);
    radioStyle.push(`${artist} live`);

    // B) TYPE BEAT STYLE (for applicable genres) - 4 queries per artist
    if (supportsTypeBeat) {
      typeBeat.push(`${artist} type beat`);
      typeBeat.push(`${artist} type beat instrumental`);
      typeBeat.push(`${artist} type beat 2026`);
      typeBeat.push(`${artist} vibe`);
    }

    // C) ARTIST + GENRE - 1-2 queries per artist
    for (const genre of genres.slice(0, 2)) {
      artistGenre.push(`${artist} ${genre}`);
    }

    // D) ARTIST + MOOD - 1-2 queries per artist
    for (const mood of moods.slice(0, 2)) {
      artistMood.push(`${artist} ${mood}`);
    }

    // E) SIMILAR ARTIST DISCOVERY - 3 queries per artist
    similarArtist.push(`similar to ${artist}`);
    similarArtist.push(`artists like ${artist}`);
    similarArtist.push(`${artist} inspired`);
  }

  // Apply weights: 60% A+C, 25% D+E, 15% B
  // Total target: 10-14 queries per platform
  const targetPerPlatform = 12;

  // Weight distribution
  const acWeight = 0.60;  // Radio + Artist/Genre
  const deWeight = 0.25;  // Artist/Mood + Similar
  const bWeight = 0.15;   // Type beat

  const acCount = Math.round(targetPerPlatform * acWeight);
  const deCount = Math.round(targetPerPlatform * deWeight);
  const bCount = Math.round(targetPerPlatform * bWeight);

  // Shuffle each category
  const shuffledRadio = shuffleArray(radioStyle);
  const shuffledArtistGenre = shuffleArray(artistGenre);
  const shuffledArtistMood = shuffleArray(artistMood);
  const shuffledSimilar = shuffleArray(similarArtist);
  const shuffledTypeBeat = shuffleArray(typeBeat);

  // Build YouTube queries (all query types work well)
  const youtube: string[] = [];

  // A + C: Radio style + artist/genre (60%)
  const acQueries = [...shuffledRadio, ...shuffledArtistGenre];
  youtube.push(...shuffleArray(acQueries).slice(0, acCount));

  // D + E: Artist/mood + similar (25%)
  const deQueries = [...shuffledArtistMood, ...shuffledSimilar];
  youtube.push(...shuffleArray(deQueries).slice(0, deCount));

  // B: Type beat (15%)
  youtube.push(...shuffledTypeBeat.slice(0, bCount));

  // Build SoundCloud queries (simpler queries work better)
  const soundcloud: string[] = [];

  // SoundCloud prefers: artist names, artist + genre, artist + mood
  // Less effective: "similar to", "type beat", "radio"
  for (const artist of normalizedArtists.slice(0, 6)) {
    soundcloud.push(artist);
    soundcloud.push(`${artist} remix`);
  }

  // Add artist + genre and artist + mood
  soundcloud.push(...shuffleArray(artistGenre).slice(0, 3));
  soundcloud.push(...shuffleArray(artistMood).slice(0, 3));

  // Also add direct genre + mood queries
  for (const genre of genres.slice(0, 2)) {
    soundcloud.push(`${genre} mix`);
    for (const mood of moods.slice(0, 1)) {
      soundcloud.push(`${mood} ${genre}`);
    }
  }

  // Exploratory: use similar artist queries + some genre exploration
  const exploratory: string[] = [];
  exploratory.push(...shuffledSimilar.slice(0, 4));

  // Add adjacent genre exploration
  for (const genre of genres.slice(0, 2)) {
    const adjacent = ADJACENT_GENRES[genre.toLowerCase()];
    if (adjacent) {
      const randomAdj = getRandomSubset(adjacent, 2);
      for (const adj of randomAdj) {
        exploratory.push(`${adj} music`);
        exploratory.push(`discover ${adj}`);
      }
    }
  }

  // Deduplicate and shuffle final results
  return {
    youtube: shuffleArray([...new Set(youtube)]).slice(0, 14),
    soundcloud: shuffleArray([...new Set(soundcloud)]).slice(0, 12),
    exploratory: shuffleArray([...new Set(exploratory)]).slice(0, 8),
  };
}

/**
 * Build personalized queries with instant artist boost
 * This is called when user completes onboarding with favorite artists
 */
export async function buildInstantPersonalizedQueries(
  userId: string,
  favoriteArtists: string[],
  genres: string[],
  moods: string[]
): Promise<PersonalizedQueries> {
  console.log(`[PersonalizedQuery] Building instant queries for user ${userId} with ${favoriteArtists.length} artists`);

  // If we have favorite artists, prioritize instant artist queries
  if (favoriteArtists.length > 0) {
    const instantQueries = buildInstantArtistQueries(favoriteArtists, genres, moods);
    console.log(`[PersonalizedQuery] Instant artist queries - YouTube: ${instantQueries.youtube.length}, SoundCloud: ${instantQueries.soundcloud.length}`);
    return instantQueries;
  }

  // Otherwise fall back to standard preference-based queries
  const preferences: DiscoverPreferences = {
    genres,
    moods,
    favoriteArtists,
    eraPreference: null,
    onboardingDone: true,
  };

  return buildPersonalizedQueries(userId, preferences);
}
