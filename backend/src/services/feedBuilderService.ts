/**
 * Feed Builder Service
 * Merges YouTube and SoundCloud results with personalized queries
 * Dedupes and ranks items into sections
 * Uses behavior data for truly unique feeds per user
 */

import { prisma } from '../prisma';
import type {
  DiscoverItem,
  DiscoverSection,
  DiscoverFeed,
  DiscoverSectionId,
  DiscoverPreferences,
  FeedGenerationContext,
} from '../types/discover';
import {
  isYouTubeApiAvailable,
  youtubeResultToDiscoverItem,
  searchYouTubePersonalized,
  getSimilarMusic,
} from './youtubeService';
import {
  generatePersonalizedSoundCloudItems,
} from './soundcloudDiscoverService';
import {
  searchSoundCloudTracks,
  searchYouTubeTracks,
} from './ytDlpSearchService';
import {
  buildPersonalizedQueries,
  buildInstantPersonalizedQueries,
  getHiddenCreators,
  enforceCreatorDiversity,
  type PersonalizedQueries,
} from './personalizedQueryService';

// Cache duration in hours
const FEED_CACHE_HOURS = 6;

/**
 * Get user's discover preferences
 */
export async function getUserPreferences(userId: string): Promise<DiscoverPreferences> {
  const prefs = await prisma.userPreferences.findUnique({
    where: { userId },
  });

  if (!prefs) {
    return {
      genres: [],
      moods: [],
      favoriteArtists: [],
      eraPreference: null,
      onboardingDone: false,
    };
  }

  return {
    genres: JSON.parse(prefs.genres || '[]') as string[],
    moods: JSON.parse(prefs.preferredMoods || '[]') as string[],
    favoriteArtists: JSON.parse(prefs.favoriteArtists || '[]') as string[],
    eraPreference: prefs.eraPreference,
    onboardingDone: prefs.onboardingDone,
  };
}

/**
 * Save user's discover preferences
 */
export async function saveUserPreferences(
  userId: string,
  input: {
    genres?: string[];
    moods?: string[];
    favoriteArtists?: string[];
    eraPreference?: string;
  }
): Promise<DiscoverPreferences> {
  const existing = await prisma.userPreferences.findUnique({
    where: { userId },
  });

  const updateData: Record<string, string | boolean> = {};

  if (input.genres !== undefined) {
    updateData.genres = JSON.stringify(input.genres);
  }
  if (input.moods !== undefined) {
    updateData.preferredMoods = JSON.stringify(input.moods);
  }
  if (input.favoriteArtists !== undefined) {
    updateData.favoriteArtists = JSON.stringify(input.favoriteArtists);
  }
  if (input.eraPreference !== undefined) {
    updateData.eraPreference = input.eraPreference;
  }

  // Mark onboarding as done if we have at least genres or artists
  const hasGenres = input.genres && input.genres.length > 0;
  const hasArtists = input.favoriteArtists && input.favoriteArtists.length > 0;
  if (hasGenres || hasArtists) {
    updateData.onboardingDone = true;
  }

  if (existing) {
    await prisma.userPreferences.update({
      where: { userId },
      data: updateData,
    });
  } else {
    await prisma.userPreferences.create({
      data: {
        userId,
        ...updateData,
      },
    });
  }

  // Invalidate feed cache when preferences change
  await invalidateFeedCache(userId);

  return getUserPreferences(userId);
}

/**
 * Invalidate user's feed cache
 */
async function invalidateFeedCache(userId: string): Promise<void> {
  await prisma.discoverFeedCache.deleteMany({
    where: { userId },
  });
}

/**
 * Get or store a DiscoverItem in the database
 */
async function getOrCreateDiscoverItem(
  item: Omit<DiscoverItem, 'id' | 'createdAt'>
): Promise<DiscoverItem> {
  // Try to find existing item by platform and external URL
  const existing = await prisma.discoverItem.findFirst({
    where: {
      sourcePlatform: item.sourcePlatform,
      externalUrl: item.externalUrl,
    },
  });

  if (existing) {
    return {
      id: existing.id,
      sourcePlatform: existing.sourcePlatform as DiscoverItem['sourcePlatform'],
      title: existing.title,
      creatorName: existing.creatorName,
      thumbnailUrl: existing.thumbnailUrl,
      externalUrl: existing.externalUrl,
      deepLinkUrl: existing.deepLinkUrl,
      searchQuery: existing.searchQuery,
      publishedAt: existing.publishedAt?.toISOString() ?? null,
      createdAt: existing.createdAt.toISOString(),
    };
  }

  // Create new item
  const created = await prisma.discoverItem.create({
    data: {
      sourcePlatform: item.sourcePlatform,
      title: item.title,
      creatorName: item.creatorName,
      thumbnailUrl: item.thumbnailUrl,
      externalUrl: item.externalUrl,
      deepLinkUrl: item.deepLinkUrl,
      searchQuery: item.searchQuery,
      publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
    },
  });

  return {
    id: created.id,
    sourcePlatform: created.sourcePlatform as DiscoverItem['sourcePlatform'],
    title: created.title,
    creatorName: created.creatorName,
    thumbnailUrl: created.thumbnailUrl,
    externalUrl: created.externalUrl,
    deepLinkUrl: created.deepLinkUrl,
    searchQuery: created.searchQuery,
    publishedAt: created.publishedAt?.toISOString() ?? null,
    createdAt: created.createdAt.toISOString(),
  };
}

/**
 * Get user's recently clicked items for similarity matching
 */
async function getRecentlyClickedItems(
  userId: string
): Promise<{ title: string; creatorName: string }[]> {
  const recentClicks = await prisma.discoverEvent.findMany({
    where: {
      userId,
      eventType: 'open',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
    },
    include: {
      discoverItem: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  return recentClicks.map(click => ({
    title: click.discoverItem.title,
    creatorName: click.discoverItem.creatorName,
  }));
}

/**
 * Get user's hidden items to filter out
 */
async function getHiddenItemIds(userId: string): Promise<Set<string>> {
  const hidden = await prisma.hiddenDiscoverItem.findMany({
    where: { userId },
    select: { discoverItemId: true },
  });

  return new Set(hidden.map(h => h.discoverItemId));
}

/**
 * Build the "From YouTube Music" section with personalized queries
 */
async function buildYouTubeSection(
  personalizedQueries: PersonalizedQueries,
  hiddenCreators: Set<string>,
  hiddenIds: Set<string>,
  preferences: DiscoverPreferences
): Promise<DiscoverSection> {
  const items: DiscoverItem[] = [];

  // Get YouTube results using personalized queries
  if (isYouTubeApiAvailable()) {
    const youtubeResults = await searchYouTubePersonalized(
      personalizedQueries.youtube,
      hiddenCreators,
      15
    );

    for (const result of youtubeResults) {
      const itemData = youtubeResultToDiscoverItem(result);
      const item = await getOrCreateDiscoverItem(itemData);
      if (!hiddenIds.has(item.id)) {
        items.push(item);
      }
    }
  }

  // Enforce creator diversity
  const diverseItems = enforceCreatorDiversity(items, 1, 2);

  // Get personalized section title
  const { title, subtitle } = getPersonalizedSectionTitle('new_today', preferences);

  return {
    id: 'new_today',
    title,
    subtitle,
    items: diverseItems.slice(0, 12),
    refreshedAt: new Date().toISOString(),
  };
}

/**
 * Build the "From SoundCloud" section with personalized queries
 */
async function buildSoundCloudSection(
  personalizedQueries: PersonalizedQueries,
  hiddenCreators: Set<string>,
  hiddenIds: Set<string>,
  preferences: DiscoverPreferences
): Promise<DiscoverSection> {
  const items: DiscoverItem[] = [];

  console.log(`[FeedBuilder] Building SoundCloud section with ${personalizedQueries.soundcloud.length} queries`);

  // Generate SoundCloud items from personalized queries
  const soundcloudItemsData = generatePersonalizedSoundCloudItems(
    personalizedQueries.soundcloud,
    hiddenCreators,
    12
  );

  console.log(`[FeedBuilder] Generated ${soundcloudItemsData.length} SoundCloud items`);

  for (const itemData of soundcloudItemsData) {
    const item = await getOrCreateDiscoverItem(itemData);
    if (!hiddenIds.has(item.id)) {
      items.push(item);
    }
  }

  console.log(`[FeedBuilder] After filtering hidden: ${items.length} SoundCloud items`);

  // NOTE: Skip creator diversity for SoundCloud items since they all have
  // creatorName: "SoundCloud Search" - diversity doesn't make sense here
  // Just take the first 10 items directly
  const finalItems = items.slice(0, 10);

  // Get personalized section title
  const { title, subtitle } = getPersonalizedSectionTitle('trending', preferences);

  return {
    id: 'trending',
    title,
    subtitle,
    items: finalItems,
    refreshedAt: new Date().toISOString(),
  };
}

/**
 * Build the "Similar To Your Clicks" section
 */
async function buildSimilarSection(
  userId: string,
  hiddenCreators: Set<string>,
  hiddenIds: Set<string>
): Promise<DiscoverSection> {
  const items: DiscoverItem[] = [];

  // Get recently clicked items
  const recentClicks = await getRecentlyClickedItems(userId);

  if (recentClicks.length > 0 && isYouTubeApiAvailable()) {
    const similarResults = await getSimilarMusic(recentClicks, 12);

    // Filter out hidden creators
    const filteredResults = similarResults.filter(result => {
      const creatorKey = result.channelName.toLowerCase();
      return !hiddenCreators.has(creatorKey);
    });

    for (const result of filteredResults.slice(0, 10)) {
      const itemData = youtubeResultToDiscoverItem(result);
      const item = await getOrCreateDiscoverItem(itemData);
      if (!hiddenIds.has(item.id)) {
        items.push(item);
      }
    }
  }

  // Enforce creator diversity
  const diverseItems = enforceCreatorDiversity(items, 1, 2);

  return {
    id: 'similar_to_clicks',
    title: 'Similar To Your Clicks',
    subtitle: 'More like what you have been exploring',
    items: diverseItems.slice(0, 10),
    refreshedAt: new Date().toISOString(),
  };
}

/**
 * Build the "Hidden Gems" section using exploratory queries
 */
async function buildHiddenGemsSection(
  personalizedQueries: PersonalizedQueries,
  hiddenCreators: Set<string>,
  hiddenIds: Set<string>,
  preferences: DiscoverPreferences
): Promise<DiscoverSection> {
  const youtubeItems: DiscoverItem[] = [];
  const soundcloudItems: DiscoverItem[] = [];

  // Use exploratory queries for hidden gems
  if (isYouTubeApiAvailable() && personalizedQueries.exploratory.length > 0) {
    const exploratoryResults = await searchYouTubePersonalized(
      personalizedQueries.exploratory,
      hiddenCreators,
      10
    );

    for (const result of exploratoryResults.slice(0, 8)) {
      const itemData = youtubeResultToDiscoverItem(result);
      const item = await getOrCreateDiscoverItem(itemData);
      if (!hiddenIds.has(item.id)) {
        youtubeItems.push(item);
      }
    }
  }

  // Also add some SoundCloud exploratory items
  const exploratoryQueries = personalizedQueries.exploratory.filter(
    q => !q.includes('similar artists') && !q.includes('type beat')
  );

  if (exploratoryQueries.length > 0) {
    const soundcloudItemsData = generatePersonalizedSoundCloudItems(
      exploratoryQueries,
      hiddenCreators,
      6
    );

    for (const itemData of soundcloudItemsData) {
      const item = await getOrCreateDiscoverItem(itemData);
      if (!hiddenIds.has(item.id)) {
        soundcloudItems.push(item);
      }
    }
  }

  // Apply creator diversity only to YouTube items (SoundCloud items all have same creator)
  const diverseYoutubeItems = enforceCreatorDiversity(youtubeItems, 1, 2);

  // Combine: YouTube items first, then SoundCloud items
  const combinedItems = [...diverseYoutubeItems, ...soundcloudItems];

  // Get personalized section title
  const { title, subtitle } = getPersonalizedSectionTitle('hidden_gems', preferences);

  return {
    id: 'hidden_gems',
    title,
    subtitle,
    items: combinedItems.slice(0, 10),
    refreshedAt: new Date().toISOString(),
  };
}

/**
 * Build the "Vybe Beats" curated section using real yt-dlp searches against
 * YouTube and SoundCloud. This guarantees we return real tracks with real
 * thumbnails for the Vybe Beats card on the Discover tab, even when the
 * YouTube Data API key isn't configured.
 *
 * Picks the top few SoundCloud queries and top few YouTube queries from the
 * personalized set and hits each one in parallel, then merges+dedupes.
 */
async function buildVybeBeatsSection(
  personalizedQueries: PersonalizedQueries,
  hiddenIds: Set<string>,
  preferences: DiscoverPreferences
): Promise<DiscoverSection> {
  console.log(`[FeedBuilder] Building Vybe Beats section via yt-dlp`);

  // Take a small number of queries from each source to keep latency reasonable.
  // yt-dlp searches cost ~2-5s each, so we cap parallel calls.
  const scQueries = personalizedQueries.soundcloud.slice(0, 3);
  const ytQueries = personalizedQueries.youtube.slice(0, 3);

  const [scResults, ytResults] = await Promise.all([
    Promise.all(scQueries.map((q) => searchSoundCloudTracks(q, 4).catch(() => []))),
    Promise.all(ytQueries.map((q) => searchYouTubeTracks(q, 4).catch(() => []))),
  ]);

  const rawItems: Array<Omit<DiscoverItem, 'id' | 'createdAt'>> = [
    ...scResults.flat(),
    ...ytResults.flat(),
  ];

  // Dedupe by externalUrl
  const seen = new Set<string>();
  const dedupedRawItems = rawItems.filter((item) => {
    if (seen.has(item.externalUrl)) return false;
    seen.add(item.externalUrl);
    return true;
  });

  console.log(
    `[FeedBuilder] Vybe Beats raw results: sc=${scResults.flat().length}, yt=${ytResults.flat().length}, deduped=${dedupedRawItems.length}`
  );

  // Persist to DB (getOrCreateDiscoverItem assigns ids) and filter hidden
  const items: DiscoverItem[] = [];
  for (const itemData of dedupedRawItems) {
    const item = await getOrCreateDiscoverItem(itemData);
    if (!hiddenIds.has(item.id)) items.push(item);
  }

  // Shuffle SoundCloud and YouTube together so the 2x2 card mixes sources
  items.sort(() => Math.random() - 0.5);

  return {
    id: 'vybe_beats',
    title: 'Vybe Beats',
    subtitle: 'Curated just for your picks',
    items: items.slice(0, 12),
    refreshedAt: new Date().toISOString(),
  };
}

/**
 * Check if cached feed is still valid
 */
async function getCachedFeed(userId: string): Promise<DiscoverFeed | null> {
  const cachedSections = await prisma.discoverFeedCache.findMany({
    where: {
      userId,
      expiresAt: { gt: new Date() },
    },
  });

  if (cachedSections.length === 0) {
    return null;
  }

  // Get all cached item IDs
  const allItemIds: string[] = [];
  for (const section of cachedSections) {
    const itemIds = JSON.parse(section.itemIds || '[]') as string[];
    allItemIds.push(...itemIds);
  }

  // Fetch all items
  const items = await prisma.discoverItem.findMany({
    where: { id: { in: allItemIds } },
  });

  const itemMap = new Map(items.map(item => [item.id, item]));

  // Build sections
  const sections: DiscoverSection[] = cachedSections.map(cached => {
    const itemIds = JSON.parse(cached.itemIds || '[]') as string[];
    const sectionItems: DiscoverItem[] = itemIds
      .map(id => itemMap.get(id))
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
      .map(item => ({
        id: item.id,
        sourcePlatform: item.sourcePlatform as DiscoverItem['sourcePlatform'],
        title: item.title,
        creatorName: item.creatorName,
        thumbnailUrl: item.thumbnailUrl,
        externalUrl: item.externalUrl,
        deepLinkUrl: item.deepLinkUrl,
        searchQuery: item.searchQuery,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      }));

    return {
      id: cached.sectionId as DiscoverSectionId,
      title: getSectionTitle(cached.sectionId as DiscoverSectionId),
      subtitle: getSectionSubtitle(cached.sectionId as DiscoverSectionId),
      items: sectionItems,
      refreshedAt: cached.generatedAt.toISOString(),
    };
  });

  // Find earliest expiry
  const firstSection = cachedSections[0];
  if (!firstSection) {
    return null;
  }

  const earliestExpiry = cachedSections.reduce(
    (min, s) => (s.expiresAt < min ? s.expiresAt : min),
    firstSection.expiresAt
  );

  return {
    sections,
    lastRefreshedAt: firstSection.generatedAt.toISOString(),
    nextRefreshAt: earliestExpiry.toISOString(),
  };
}

/**
 * Cache a section of the feed
 */
async function cacheFeedSection(
  userId: string,
  section: DiscoverSection,
  context: FeedGenerationContext
): Promise<void> {
  const expiresAt = new Date(Date.now() + FEED_CACHE_HOURS * 60 * 60 * 1000);

  await prisma.discoverFeedCache.upsert({
    where: {
      userId_sectionId: { userId, sectionId: section.id },
    },
    create: {
      userId,
      sectionId: section.id,
      itemIds: JSON.stringify(section.items.map(i => i.id)),
      generatedAt: new Date(),
      expiresAt,
      generationContext: JSON.stringify(context),
    },
    update: {
      itemIds: JSON.stringify(section.items.map(i => i.id)),
      generatedAt: new Date(),
      expiresAt,
      generationContext: JSON.stringify(context),
    },
  });
}

/**
 * Build the complete discover feed for a user
 * Uses personalized queries based on preferences + behavior data
 */
export async function buildDiscoverFeed(
  userId: string,
  forceRefresh: boolean = false
): Promise<DiscoverFeed> {
  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cached = await getCachedFeed(userId);
    if (cached && cached.sections.length >= 2) {
      return cached;
    }
  }

  // Get user preferences, hidden items, and hidden creators
  const [preferences, hiddenIds, hiddenCreators] = await Promise.all([
    getUserPreferences(userId),
    getHiddenItemIds(userId),
    getHiddenCreators(userId),
  ]);

  // Build personalized queries based on preferences + behavior
  const personalizedQueries = await buildPersonalizedQueries(userId, preferences);

  console.log(`[FeedBuilder] User ${userId} - YouTube queries: ${personalizedQueries.youtube.length}, SoundCloud queries: ${personalizedQueries.soundcloud.length}, Exploratory: ${personalizedQueries.exploratory.length}`);

  // Build generation context for caching
  const context: FeedGenerationContext = {
    searchQueries: [
      ...personalizedQueries.youtube.slice(0, 5),
      ...personalizedQueries.soundcloud.slice(0, 5),
    ],
    preferences: {
      genres: preferences.genres,
      moods: preferences.moods,
      favoriteArtists: preferences.favoriteArtists,
    },
    timestamp: new Date().toISOString(),
  };

  // Build sections in parallel using personalized queries
  const [youtubeSection, soundcloudSection, similar, hiddenGems] = await Promise.all([
    buildYouTubeSection(personalizedQueries, hiddenCreators, hiddenIds, preferences),
    buildSoundCloudSection(personalizedQueries, hiddenCreators, hiddenIds, preferences),
    buildSimilarSection(userId, hiddenCreators, hiddenIds),
    buildHiddenGemsSection(personalizedQueries, hiddenCreators, hiddenIds, preferences),
  ]);

  // Cache all sections
  await Promise.all([
    cacheFeedSection(userId, youtubeSection, context),
    cacheFeedSection(userId, soundcloudSection, context),
    cacheFeedSection(userId, similar, context),
    cacheFeedSection(userId, hiddenGems, context),
  ]);

  // Only include sections with items
  const sections = [youtubeSection, soundcloudSection, similar, hiddenGems].filter(
    s => s.items.length > 0
  );

  const expiresAt = new Date(Date.now() + FEED_CACHE_HOURS * 60 * 60 * 1000);

  return {
    sections,
    lastRefreshedAt: new Date().toISOString(),
    nextRefreshAt: expiresAt.toISOString(),
  };
}

/**
 * Build instant onboarding feed with favorite artist queries
 * Called immediately after user completes onboarding with favorite artists
 * This generates highly personalized results right away
 */
export async function buildInstantOnboardingFeed(
  userId: string,
  input: {
    genres: string[];
    moods: string[];
    favoriteArtists: string[];
  }
): Promise<DiscoverFeed> {
  console.log(`[FeedBuilder] Building instant onboarding feed for user ${userId}`);
  console.log(`[FeedBuilder] Input - genres: ${input.genres.join(', ')}, moods: ${input.moods.join(', ')}, artists: ${input.favoriteArtists.join(', ')}`);

  // Get hidden items and creators
  const [hiddenIds, hiddenCreators] = await Promise.all([
    getHiddenItemIds(userId),
    getHiddenCreators(userId),
  ]);

  console.log(`[FeedBuilder] Hidden items: ${hiddenIds.size}, hidden creators: ${hiddenCreators.size}`);

  // Build instant personalized queries using favorite artists
  const personalizedQueries = await buildInstantPersonalizedQueries(
    userId,
    input.favoriteArtists,
    input.genres,
    input.moods
  );

  console.log(`[FeedBuilder] Instant queries - YouTube: ${personalizedQueries.youtube.length}, SoundCloud: ${personalizedQueries.soundcloud.length}, Exploratory: ${personalizedQueries.exploratory.length}`);
  console.log(`[FeedBuilder] SoundCloud queries sample: ${personalizedQueries.soundcloud.slice(0, 5).join(', ')}`);

  // Build preferences object for section titles
  const preferences: DiscoverPreferences = {
    genres: input.genres,
    moods: input.moods,
    favoriteArtists: input.favoriteArtists,
    eraPreference: null,
    onboardingDone: true,
  };

  // Build generation context
  const context: FeedGenerationContext = {
    searchQueries: [
      ...personalizedQueries.youtube.slice(0, 5),
      ...personalizedQueries.soundcloud.slice(0, 5),
    ],
    preferences: {
      genres: input.genres,
      moods: input.moods,
      favoriteArtists: input.favoriteArtists,
    },
    timestamp: new Date().toISOString(),
  };

  // Build sections in parallel using instant artist queries
  const [youtubeSection, soundcloudSection, hiddenGems, vybeBeatsSection] = await Promise.all([
    buildYouTubeSection(personalizedQueries, hiddenCreators, hiddenIds, preferences),
    buildSoundCloudSection(personalizedQueries, hiddenCreators, hiddenIds, preferences),
    buildHiddenGemsSection(personalizedQueries, hiddenCreators, hiddenIds, preferences),
    buildVybeBeatsSection(personalizedQueries, hiddenIds, preferences),
  ]);

  console.log(`[FeedBuilder] Section results - YouTube: ${youtubeSection.items.length}, SoundCloud: ${soundcloudSection.items.length}, HiddenGems: ${hiddenGems.items.length}, VybeBeats: ${vybeBeatsSection.items.length}`);

  // Cache all sections
  await Promise.all([
    cacheFeedSection(userId, youtubeSection, context),
    cacheFeedSection(userId, soundcloudSection, context),
    cacheFeedSection(userId, hiddenGems, context),
    cacheFeedSection(userId, vybeBeatsSection, context),
  ]);

  // Only include sections with items. Vybe Beats is placed first so it's the
  // primary curated playlist displayed at the top of the discover tab.
  const sections = [vybeBeatsSection, youtubeSection, soundcloudSection, hiddenGems].filter(
    s => s.items.length > 0
  );

  console.log(`[FeedBuilder] Final sections count: ${sections.length}`);

  const expiresAt = new Date(Date.now() + FEED_CACHE_HOURS * 60 * 60 * 1000);

  return {
    sections,
    lastRefreshedAt: new Date().toISOString(),
    nextRefreshAt: expiresAt.toISOString(),
  };
}

/**
 * Track a discover event
 */
export async function trackDiscoverEvent(
  userId: string,
  input: {
    discoverItemId: string;
    eventType: string;
    sectionId?: string;
    position?: number;
  }
): Promise<void> {
  await prisma.discoverEvent.create({
    data: {
      userId,
      discoverItemId: input.discoverItemId,
      eventType: input.eventType,
      sectionId: input.sectionId,
      position: input.position,
    },
  });

  // If hiding, also add to hidden items
  if (input.eventType === 'hide') {
    await prisma.hiddenDiscoverItem.upsert({
      where: {
        userId_discoverItemId: { userId, discoverItemId: input.discoverItemId },
      },
      create: {
        userId,
        discoverItemId: input.discoverItemId,
        reason: 'not_interested',
      },
      update: {},
    });
  }

  // If saving, also add to saved items
  if (input.eventType === 'save') {
    await prisma.savedDiscoverItem.upsert({
      where: {
        userId_discoverItemId: { userId, discoverItemId: input.discoverItemId },
      },
      create: {
        userId,
        discoverItemId: input.discoverItemId,
      },
      update: {},
    });
  }
}

/**
 * Get section title by ID
 */
function getSectionTitle(sectionId: DiscoverSectionId): string {
  const titles: Record<DiscoverSectionId, string> = {
    new_today: 'From YouTube Music',
    trending: 'From SoundCloud',
    similar_to_clicks: 'Similar To Your Clicks',
    hidden_gems: 'Hidden Gems',
  };
  return titles[sectionId] || sectionId;
}

/**
 * Get section subtitle by ID
 */
function getSectionSubtitle(sectionId: DiscoverSectionId): string {
  const subtitles: Record<DiscoverSectionId, string> = {
    new_today: 'Fresh picks based on your taste',
    trending: 'Trending in your vibe',
    similar_to_clicks: 'More like what you have been exploring',
    hidden_gems: 'Underground tracks waiting to be discovered',
  };
  return subtitles[sectionId] || '';
}

/**
 * Get personalized section title based on user preferences
 */
function getPersonalizedSectionTitle(
  sectionId: DiscoverSectionId,
  preferences: DiscoverPreferences
): { title: string; subtitle: string } {
  const genreStr = preferences.genres.slice(0, 3).join(', ');
  const moodStr = preferences.moods.slice(0, 3).join(', ');

  switch (sectionId) {
    case 'new_today':
      return {
        title: 'From YouTube Music',
        subtitle: genreStr ? `Based on your ${genreStr} taste` : 'Fresh picks for you',
      };
    case 'trending':
      return {
        title: 'From SoundCloud',
        subtitle: moodStr ? `More like ${moodStr}` : 'Trending in your vibe',
      };
    case 'similar_to_clicks':
      return {
        title: 'Similar To Your Clicks',
        subtitle: 'More like what you have been exploring',
      };
    case 'hidden_gems':
      return {
        title: 'Hidden Gems',
        subtitle: genreStr
          ? `Undiscovered ${genreStr} tracks`
          : 'Underground tracks waiting to be discovered',
      };
    default:
      return {
        title: getSectionTitle(sectionId),
        subtitle: getSectionSubtitle(sectionId),
      };
  }
}

/**
 * Get user's saved discover items
 */
export async function getSavedDiscoverItems(userId: string): Promise<DiscoverItem[]> {
  const saved = await prisma.savedDiscoverItem.findMany({
    where: { userId },
    orderBy: { savedAt: 'desc' },
  });

  if (saved.length === 0) {
    return [];
  }

  // Fetch the discover items separately
  const itemIds = saved.map(s => s.discoverItemId);
  const items = await prisma.discoverItem.findMany({
    where: { id: { in: itemIds } },
  });

  // Map and return in saved order
  const itemMap = new Map(items.map(item => [item.id, item]));

  return saved
    .map(s => itemMap.get(s.discoverItemId))
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .map(item => ({
      id: item.id,
      sourcePlatform: item.sourcePlatform as DiscoverItem['sourcePlatform'],
      title: item.title,
      creatorName: item.creatorName,
      thumbnailUrl: item.thumbnailUrl,
      externalUrl: item.externalUrl,
      deepLinkUrl: item.deepLinkUrl,
      searchQuery: item.searchQuery,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    }));
}

/**
 * Remove a saved discover item
 */
export async function removeSavedDiscoverItem(
  userId: string,
  discoverItemId: string
): Promise<void> {
  await prisma.savedDiscoverItem.deleteMany({
    where: { userId, discoverItemId },
  });
}
