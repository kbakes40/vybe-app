/**
 * YouTube Integration Service
 * Uses YouTube Data API to search for music videos
 * Returns properly formatted DiscoverItems that open in YouTube app/web
 */

import type {
  YouTubeSearchResponse,
  YouTubeSearchItem,
  YouTubeDiscoverResult,
  DiscoverItem,
} from '../types/discover';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// ─── Key Rotation ─────────────────────────────────────────────────────────────
// Load up to 5 API keys at startup; rotate when quota is exhausted or a key 403s.
const QUOTA_COST_SEARCH = 100;
const PROACTIVE_ROTATION_THRESHOLD = 9500; // switch key before hard limit

const API_KEYS: string[] = (
  [
    process.env.YOUTUBE_API_KEY_1,
    process.env.YOUTUBE_API_KEY_2,
    process.env.YOUTUBE_API_KEY_3,
    process.env.YOUTUBE_API_KEY_4,
    process.env.YOUTUBE_API_KEY_5,
    // Fallback: legacy single key
    process.env.YOUTUBE_API_KEY,
  ] as (string | undefined)[]
).map(k => k?.trim())
.filter((k): k is string => typeof k === 'string' && k.length > 0);

// De-duplicate in case the same key is set under multiple vars
const UNIQUE_API_KEYS = [...new Set(API_KEYS)];

let activeKeyIndex = 0;
let allKeysExhaustedAt = 0; // timestamp when we last ran out of keys

function getActiveKey(): string | null {
  // Auto-reset: if all keys were exhausted and a new day has started
  // (YouTube quota resets at midnight PT), start back at key 1 so the
  // fresh daily quota is used without needing a manual restart.
  if (activeKeyIndex >= UNIQUE_API_KEYS.length && allKeysExhaustedAt > 0) {
    const now = Date.now();
    const nextReset = getNextMidnightPT();
    // getNextMidnightPT() returns the *upcoming* midnight. If allKeysExhaustedAt
    // was before the most recent midnight, the quota has rolled over.
    const lastMidnight = nextReset - 24 * 60 * 60 * 1000;
    if (allKeysExhaustedAt < lastMidnight) {
      console.log('[YouTube] New day — resetting all API keys to fresh quota');
      activeKeyIndex = 0;
      allKeysExhaustedAt = 0;
      // Also reset per-key stats so proactive rotation thresholds are clean
      for (const ks of keyStats) {
        ks.totalUnits = 0;
        ks.callCount = 0;
        ks.resetAt = nextReset;
      }
    }
  }
  return UNIQUE_API_KEYS[activeKeyIndex] ?? null;
}

function rotateKey(reason: string): boolean {
  if (activeKeyIndex + 1 >= UNIQUE_API_KEYS.length) {
    console.warn(`[YouTube] All ${UNIQUE_API_KEYS.length} key(s) exhausted. ${reason}`);
    allKeysExhaustedAt = Date.now();
    return false;
  }
  activeKeyIndex++;
  console.log(`[YouTube] Using key ${activeKeyIndex + 1}/${UNIQUE_API_KEYS.length} — ${reason}`);
  return true;
}

// ─── Per-key Quota Tracking ───────────────────────────────────────────────────

interface QuotaStats {
  totalUnits: number;
  callCount: number;
  cacheHits: number;
  resetAt: number;
  keyIndex: number;
  totalKeys: number;
}

interface KeyStats {
  totalUnits: number;
  callCount: number;
  resetAt: number;
}

function getNextMidnightPT(): number {
  const now = new Date();
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  pt.setHours(24, 0, 0, 0);
  return pt.getTime();
}

const keyStats: KeyStats[] = UNIQUE_API_KEYS.map(() => ({
  totalUnits: 0,
  callCount: 0,
  resetAt: getNextMidnightPT(),
}));

let globalCacheHits = 0;

function trackQuotaUsage(units: number, caller: string): void {
  const stats = keyStats[activeKeyIndex];
  if (!stats) return;

  const now = Date.now();
  if (now > stats.resetAt) {
    stats.totalUnits = 0;
    stats.callCount = 0;
    stats.resetAt = getNextMidnightPT();
    console.log(`[YouTube Quota] Key ${activeKeyIndex + 1} daily quota reset`);
  }

  stats.totalUnits += units;
  stats.callCount++;
  console.log(
    `[YouTube Quota] Key ${activeKeyIndex + 1}/${UNIQUE_API_KEYS.length} +${units} units (${caller}) | today: ${stats.totalUnits} units / ${stats.callCount} calls`
  );

  // Proactively rotate before hitting the hard limit
  if (stats.totalUnits >= PROACTIVE_ROTATION_THRESHOLD) {
    rotateKey(`key ${activeKeyIndex} reached ${stats.totalUnits} units`);
  }
}

export function getQuotaStats(): QuotaStats {
  const stats = keyStats[activeKeyIndex] ?? { totalUnits: 0, callCount: 0, resetAt: getNextMidnightPT() };
  return {
    totalUnits: stats.totalUnits,
    callCount: stats.callCount,
    cacheHits: globalCacheHits,
    resetAt: stats.resetAt,
    keyIndex: activeKeyIndex + 1,
    totalKeys: UNIQUE_API_KEYS.length,
  };
}

// ─── Search Result Cache ──────────────────────────────────────────────────────
// Caches per-query results for 24 hours to avoid burning quota on repeated queries

const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  results: YouTubeDiscoverResult[];
  expiresAt: number;
}

const searchCache = new Map<string, CacheEntry>();

function getCachedSearch(query: string, maxResults: number): YouTubeDiscoverResult[] | null {
  const key = `${query}::${maxResults}`;
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    searchCache.delete(key);
    return null;
  }
  return entry.results;
}

function setCachedSearch(query: string, maxResults: number, results: YouTubeDiscoverResult[]): void {
  const key = `${query}::${maxResults}`;
  searchCache.set(key, { results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
}

/**
 * Returns current cache size (for diagnostics)
 */
export function getSearchCacheSize(): number {
  return searchCache.size;
}

/**
 * Clear expired entries from the cache (call periodically if needed)
 */
export function purgeExpiredSearchCache(): number {
  const now = Date.now();
  let purged = 0;
  for (const [key, entry] of searchCache.entries()) {
    if (now > entry.expiresAt) {
      searchCache.delete(key);
      purged++;
    }
  }
  return purged;
}

/**
 * Check if YouTube API is available
 */
export function isYouTubeApiAvailable(): boolean {
  return UNIQUE_API_KEYS.length > 0;
}

/**
 * Build search queries from user preferences
 */
export function buildSearchQueriesFromPreferences(preferences: {
  genres: string[];
  moods: string[];
  favoriteArtists: string[];
}): string[] {
  const queries: string[] = [];

  // Artist-based queries (most specific)
  for (const artist of preferences.favoriteArtists.slice(0, 3)) {
    queries.push(`${artist} music`);
    queries.push(`${artist} new song`);
  }

  // Genre + mood combinations
  for (const genre of preferences.genres.slice(0, 3)) {
    queries.push(`${genre} music 2024`);
    queries.push(`best ${genre} songs`);

    for (const mood of preferences.moods.slice(0, 2)) {
      queries.push(`${mood} ${genre} music`);
    }
  }

  // Mood-based queries
  for (const mood of preferences.moods.slice(0, 3)) {
    queries.push(`${mood} music playlist`);
    queries.push(`${mood} vibes music`);
  }

  // Trending/discovery queries
  queries.push('new music releases');
  queries.push('trending music');
  queries.push('underground music gems');

  return queries;
}

/**
 * Search YouTube for music videos
 */
export async function searchYouTube(
  query: string,
  maxResults: number = 10
): Promise<YouTubeDiscoverResult[]> {
  if (UNIQUE_API_KEYS.length === 0) {
    console.warn('[YouTube] No API keys configured, skipping search');
    return [];
  }

  // Check cache first
  const cached = getCachedSearch(query, maxResults);
  if (cached) {
    globalCacheHits++;
    console.log(`[YouTube Cache] HIT for "${query}" (saved ${QUOTA_COST_SEARCH} units)`);
    return cached;
  }

  // Try with current key, rotate on 403 quotaExceeded and retry once per key
  while (activeKeyIndex < UNIQUE_API_KEYS.length) {
    const apiKey = getActiveKey();
    if (!apiKey) break;

    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      videoCategoryId: '10',
      q: query,
      maxResults: maxResults.toString(),
      key: apiKey,
      safeSearch: 'moderate',
    });

    try {
      const response = await fetch(`${YOUTUBE_API_BASE}/search?${params}`);

      if (response.status === 403) {
        const body = await response.text();
        if (body.includes('quotaExceeded') || body.includes('dailyLimitExceeded')) {
          const rotated = rotateKey(`403 quotaExceeded on key ${activeKeyIndex + 1}`);
          if (!rotated) return getCachedSearch(query, maxResults) ?? [];
          continue; // retry with new key
        }
        console.error(`[YouTube] 403 not quota-related: ${body}`);
        return [];
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '<unreadable body>');
        console.error(`[YouTube] Search failed: ${response.status} — query=${JSON.stringify(query)} body=${body.slice(0, 500)}`);
        return [];
      }

      trackQuotaUsage(QUOTA_COST_SEARCH, `search("${query}")`);

      const data = await response.json() as YouTubeSearchResponse;
      const results = data.items
        .filter((item): item is YouTubeSearchItem & { id: { videoId: string } } =>
          Boolean(item.id.videoId)
        )
        .map(item => ({
          videoId: item.id.videoId,
          title: decodeHtmlEntities(item.snippet.title),
          channelName: decodeHtmlEntities(item.snippet.channelTitle),
          thumbnailUrl: item.snippet.thumbnails.high?.url ||
                        item.snippet.thumbnails.medium?.url ||
                        item.snippet.thumbnails.default.url,
          publishedAt: item.snippet.publishedAt,
          searchQuery: query,
        }));

      setCachedSearch(query, maxResults, results);
      return results;
    } catch (error) {
      console.error('[YouTube] Search error:', error);
      return [];
    }
  }

  return getCachedSearch(query, maxResults) ?? [];
}

/**
 * Search YouTube with multiple queries and merge results
 */
export async function searchYouTubeMultiple(
  queries: string[],
  resultsPerQuery: number = 5
): Promise<YouTubeDiscoverResult[]> {
  const allResults: YouTubeDiscoverResult[] = [];
  const seenVideoIds = new Set<string>();

  // Run searches in parallel (max 5 at a time to avoid rate limiting)
  const batchSize = 5;
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(query => searchYouTube(query, resultsPerQuery))
    );

    for (const results of batchResults) {
      for (const result of results) {
        if (!seenVideoIds.has(result.videoId)) {
          seenVideoIds.add(result.videoId);
          allResults.push(result);
        }
      }
    }
  }

  return allResults;
}

/**
 * Convert YouTube search result to DiscoverItem format
 */
export function youtubeResultToDiscoverItem(result: YouTubeDiscoverResult): Omit<DiscoverItem, 'id' | 'createdAt'> {
  const webUrl = `https://www.youtube.com/watch?v=${result.videoId}`;
  const deepLinkUrl = `youtube://watch?v=${result.videoId}`;

  return {
    sourcePlatform: 'YOUTUBE',
    title: result.title,
    creatorName: result.channelName,
    thumbnailUrl: result.thumbnailUrl,
    externalUrl: webUrl,
    deepLinkUrl: deepLinkUrl,
    searchQuery: result.searchQuery,
    publishedAt: result.publishedAt,
  };
}

/**
 * Search for trending music on YouTube
 */
export async function getTrendingMusic(maxResults: number = 20): Promise<YouTubeDiscoverResult[]> {
  const trendingQueries = [
    'trending music 2024',
    'new music releases this week',
    'viral songs 2024',
    'top hits music',
  ];

  return searchYouTubeMultiple(trendingQueries, Math.ceil(maxResults / trendingQueries.length));
}

/**
 * Search for music similar to user's clicks/saves
 */
export async function getSimilarMusic(
  clickedItems: { title: string; creatorName: string }[],
  maxResults: number = 15
): Promise<YouTubeDiscoverResult[]> {
  if (clickedItems.length === 0) {
    return [];
  }

  // Build queries from clicked items
  const queries = clickedItems.slice(0, 5).flatMap(item => [
    `${item.creatorName} music`,
    `songs like ${item.title}`,
    `${item.creatorName} similar artists`,
  ]);

  return searchYouTubeMultiple(queries, Math.ceil(maxResults / queries.length));
}

/**
 * Search for hidden gems (less popular but quality content)
 */
export async function getHiddenGems(
  preferences: { genres: string[]; moods: string[] },
  maxResults: number = 15
): Promise<YouTubeDiscoverResult[]> {
  const queries: string[] = [];

  for (const genre of preferences.genres.slice(0, 2)) {
    queries.push(`underrated ${genre} artists`);
    queries.push(`underground ${genre} music`);
    queries.push(`indie ${genre} songs`);
  }

  for (const mood of preferences.moods.slice(0, 2)) {
    queries.push(`hidden gem ${mood} music`);
  }

  queries.push('underrated songs you need to hear');
  queries.push('hidden gem artists');

  return searchYouTubeMultiple(queries, Math.ceil(maxResults / queries.length));
}

// ─── Curated Playlists ───────────────────────────────────────────────────────

// Each entry has a hardcoded display name so we don't need the YouTube Data API.
// yt-dlp fetches the tracks; the first track's thumbnail becomes the cover.
const CURATED_PLAYLISTS_META: { id: string; name: string; category?: string; section?: string }[] = [
  // ── All-time Essentials (default section) ─────────────────────────────────
  { id: 'RDCLAK5uy_m7EF_vYZXBhXNuduyXmhT00DYapc8cobs', name: 'Pop Essentials' },
  { id: 'RDCLAK5uy_nZiG9ehz_MQoWQxY5yElsLHCcG0tv9PRg', name: 'Hip-Hop Essentials' },
  { id: 'RDCLAK5uy_kZFOUXnpa_oJMql3vYc-jq6yVxwqhdkrM', name: 'Rock Classics' },
  { id: 'RDCLAK5uy_mv1P2oVguxLCIDXavV-jcDG1lQyukfSpo', name: 'R&B Essentials' },
  { id: 'RDCLAK5uy_kP2172rQNb3KFXz880xp6M98R_ME5CIKA', name: '80s Hits' },
  { id: 'RDCLAK5uy_k4QxtdDiyPtN17wezA186nbXuqO36QOiU', name: 'Party Anthems' },
  { id: 'RDCLAK5uy_kw2wIlEv9llILhO0qoMTLsBBhmjzuibAc', name: 'Chill Vibes' },
  { id: 'RDCLAK5uy_k6PkYWus1Mt-aKrbb0Ne8SkA2BgAk1Yy4', name: 'Today\'s Hits' },
  { id: 'PLWjTcqMGesppVAXK4hz80NBun3iKkgXK2', name: 'Throwback Hits' },
  // Pump It Up sub-category (still under All-time Essentials)
  { id: 'RDCLAK5uy_l6kL_b50WBydgZr18yRk1axaBan0R6hAk', name: 'Dance Classics', category: 'Pump It Up' },
  { id: 'RDCLAK5uy_kN4eY_ibobGvCBwIJGEGpDjuwzYHIG_iE', name: 'Hip-Hop Party', category: 'Pump It Up' },
  { id: 'RDCLAK5uy_nCDa4LLlnoMWB4l9fkePWyXPQKCjnM_KQ', name: 'Disco Fever', category: 'Pump It Up' },
  { id: 'RDCLAK5uy_lioDBH5_01phR1xiypkAx0t4u5AsJobFg', name: 'Funk Essentials', category: 'Pump It Up' },
  { id: 'RDCLAK5uy_k1VVBVsS6pu1pVkYZK2B0EWic3i4j_TY4', name: 'Trap Bangers', category: 'Pump It Up' },
  { id: 'RDCLAK5uy_llM83Y-j8DfoxM_iJMHCU2NMM_UytLTT0', name: 'Old School Rap', category: 'Pump It Up' },

  // ── Popular Playlists ──────────────────────────────────────────────────────
  // Hits / Mainstream
  { id: 'RDCLAK5uy_kmPRjHDECIcuVwnKsx2Ng7fyNgFKWNJFs', name: 'The Hit List', section: 'popular', category: 'Hits / Mainstream' },
  { id: 'PLC5bCqVUrpkI9d7ATvKLY5b7v66zGbH2a', name: 'Top 100 Pop Hits 2026', section: 'popular', category: 'Hits / Mainstream' },
  // Chill / Relaxed
  { id: 'PL2CBngpmiUgUJEyRPTK46HjIUhAGV8v9m', name: 'Chill Pop Playlist', section: 'popular', category: 'Chill / Relaxed' },
  { id: 'PLMmqTuUsDkRJKVeUDJVjR9IRQRLTLrfu9', name: 'Chill Pop 2026', section: 'popular', category: 'Chill / Relaxed' },
  { id: 'PL4QNnZJr8sRPmuz_d87ygGR6YAYEF-fmw', name: 'Best Relaxing Pop', section: 'popular', category: 'Chill / Relaxed' },
  // Workout / Energy
  { id: 'PLnfcpZm6el8i_u-S_T4Uz-NdVs4xkPS8V', name: 'Workout Songs 2026', section: 'popular', category: 'Workout / Energy' },
];

export interface PlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
}

export interface CuratedPlaylistResult {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  tracks: PlaylistTrack[];
  category?: string;
  section?: string;
}


let curatedPlaylistsCache: { results: CuratedPlaylistResult[]; expiresAt: number } | null = null;

import path from 'path';
import os from 'os';

// Use the same binary path as youtube.ts route (downloaded on startup)
const YTDLP_BIN = process.platform === 'darwin'
  ? '/opt/homebrew/bin/yt-dlp'
  : path.join(os.tmpdir(), 'yt-dlp');

const YTDLP_COOKIES_PATH = path.join(os.tmpdir(), 'youtube-cookies.txt');

function cookieArgs(): string[] {
  try {
    const fs = require('fs');
    return fs.existsSync(YTDLP_COOKIES_PATH) ? ['--cookies', YTDLP_COOKIES_PATH] : [];
  } catch { return []; }
}

/**
 * Fetch tracks from a YouTube Music playlist via yt-dlp — no API key needed.
 */
function fetchPlaylistTracksViaYTDLP(playlistId: string): Promise<PlaylistTrack[]> {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const url = playlistId.startsWith('PL')
      ? `https://www.youtube.com/playlist?list=${playlistId}`
      : `https://music.youtube.com/playlist?list=${playlistId}`;
    const proc = spawn(YTDLP_BIN, [
      url, '--flat-playlist', '--dump-json', '--no-warnings', '--quiet',
      '--extractor-args', 'youtube:player_client=ios',
      ...cookieArgs(),
    ]);
    const timeout = setTimeout(() => { proc.kill('SIGKILL'); resolve([]); }, 30_000);
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('close', () => {
      clearTimeout(timeout);
      const tracks: PlaylistTrack[] = [];
      for (const line of out.split('\n')) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          const videoId = item.id ?? item.url?.split('v=')[1];
          if (!videoId) continue;
          tracks.push({
            videoId,
            title: item.title ?? '',
            channelName: item.channel ?? item.uploader ?? '',
            thumbnailUrl: item.thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            publishedAt: item.upload_date ?? '',
          });
        } catch {}
      }
      resolve(tracks);
    });
    proc.on('error', () => { clearTimeout(timeout); resolve([]); });
  });
}

/**
 * Fetch tracks from a single YouTube playlist (kept for external callers).
 */
export async function fetchPlaylistTracks(playlistId: string): Promise<PlaylistTrack[]> {
  return fetchPlaylistTracksViaYTDLP(playlistId);
}

/**
 * Fetch all "All Time Essentials" playlists via yt-dlp (cached 24 hours).
 * No YouTube Data API key required.
 */
async function fetchPlaylistThumbnailFromAPI(playlistId: string): Promise<string> {
  const apiKey = getActiveKey();
  if (!apiKey) return '';
  try {
    const params = new URLSearchParams({ part: 'snippet', id: playlistId, key: apiKey });
    const res = await fetch(`${YOUTUBE_API_BASE}/playlists?${params}`);
    if (!res.ok) return '';
    const json = await res.json() as { items?: { snippet: { thumbnails: { maxres?: { url: string }; high?: { url: string }; medium?: { url: string }; default?: { url: string } } } }[] };
    const thumbnails = json.items?.[0]?.snippet?.thumbnails;
    if (!thumbnails) return '';
    return thumbnails.maxres?.url ?? thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url ?? '';
  } catch {
    return '';
  }
}

export async function fetchCuratedPlaylists(): Promise<CuratedPlaylistResult[]> {
  if (curatedPlaylistsCache && Date.now() < curatedPlaylistsCache.expiresAt) {
    return curatedPlaylistsCache.results;
  }

  const results = await Promise.all(
    CURATED_PLAYLISTS_META.map(async ({ id, name, category, section }) => {
      const [tracks, playlistThumbnail] = await Promise.all([
        fetchPlaylistTracksViaYTDLP(id).then(t => t.slice(0, 15)),
        fetchPlaylistThumbnailFromAPI(id),
      ]);
      return {
        playlistId: id,
        name,
        thumbnailUrl: playlistThumbnail || tracks[0]?.thumbnailUrl || '',
        tracks,
        ...(category ? { category } : {}),
        ...(section ? { section } : {}),
      };
    })
  );

  const nonEmpty = results.filter(r => r.tracks.length > 0);
  curatedPlaylistsCache = { results: nonEmpty, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS };
  return nonEmpty;
}

// ─── New Releases (Trending Music) ───────────────────────────────────────────

interface YouTubeVideoItem {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: {
      default: { url: string };
      medium?: { url: string };
      high?: { url: string };
      maxres?: { url: string };
    };
    publishedAt: string;
  };
  statistics?: { viewCount?: string };
}

interface YouTubeVideosResponse {
  items: YouTubeVideoItem[];
}

export interface NewReleaseResult {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount: string;
}

let newReleasesCache: { results: NewReleaseResult[]; expiresAt: number } | null = null;

/**
 * Fetch trending music via videos.list?chart=mostPopular — costs 0 quota units.
 */
export async function fetchNewReleases(maxResults = 20): Promise<NewReleaseResult[]> {
  const apiKey = getActiveKey();
  if (!apiKey) return [];

  if (newReleasesCache && Date.now() < newReleasesCache.expiresAt) {
    globalCacheHits++;
    return newReleasesCache.results;
  }

  const params = new URLSearchParams({
    part: "snippet,statistics",
    chart: "mostPopular",
    videoCategoryId: "10",
    maxResults: String(maxResults),
    regionCode: "US",
    key: apiKey,
  });

  try {
    const response = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`);
    if (!response.ok) return [];

    const data = await response.json() as YouTubeVideosResponse;
    const results: NewReleaseResult[] = data.items.map(item => ({
      videoId: item.id,
      title: decodeHtmlEntities(item.snippet.title),
      channelName: decodeHtmlEntities(item.snippet.channelTitle),
      thumbnailUrl:
        item.snippet.thumbnails.maxres?.url ??
        item.snippet.thumbnails.high?.url ??
        item.snippet.thumbnails.medium?.url ??
        item.snippet.thumbnails.default.url,
      publishedAt: item.snippet.publishedAt,
      viewCount: item.statistics?.viewCount ?? "0",
    }));

    newReleasesCache = { results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS };
    return results;
  } catch {
    return [];
  }
}

/**
 * Decode HTML entities in text (YouTube returns encoded titles)
 */
function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
  };

  return text.replace(/&[#\w]+;/g, match => entities[match] || match);
}

/**
 * Search YouTube with per-user personalized queries
 * Filters out hidden creators and enforces diversity
 */
export async function searchYouTubePersonalized(
  queries: string[],
  hiddenCreators: Set<string>,
  maxResults: number = 15
): Promise<YouTubeDiscoverResult[]> {
  if (!getActiveKey()) {
    console.warn('[YouTube] No API keys available, skipping personalized search');
    return [];
  }

  if (queries.length === 0) {
    console.warn('[YouTube] No queries provided for personalized search');
    return [];
  }

  // Calculate results per query to stay within maxResults
  const resultsPerQuery = Math.max(2, Math.ceil(maxResults / queries.length));

  // Search with all queries
  const allResults = await searchYouTubeMultiple(queries, resultsPerQuery);

  // Filter out hidden creators
  const filteredResults = allResults.filter(result => {
    const creatorKey = result.channelName.toLowerCase();
    return !hiddenCreators.has(creatorKey);
  });

  console.log(`[YouTube] Personalized search: ${queries.length} queries, ${allResults.length} raw results, ${filteredResults.length} after filtering hidden creators`);

  return filteredResults.slice(0, maxResults);
}

// ─── Video Info + Playlist (for Paste Link flows) ────────────────────────────
// These use the Data API v3 directly and bypass yt-dlp, which is getting
// bot-blocked by YouTube on datacenter IPs (Railway, etc).

/**
 * Parse an ISO 8601 duration (e.g. "PT3M42S") to total seconds.
 */
function parseIsoDuration(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const h = parseInt(m[1] ?? '0', 10);
  const mn = parseInt(m[2] ?? '0', 10);
  const s = parseInt(m[3] ?? '0', 10);
  return h * 3600 + mn * 60 + s;
}

export interface VideoInfo {
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
}

/**
 * Fetch video info via YouTube Data API v3 videos.list.
 * Cost: 1 quota unit. Returns null if the API is unavailable or the video
 * can't be found (caller should fall back to yt-dlp).
 */
export async function getVideoInfoViaApi(videoId: string): Promise<VideoInfo | null> {
  const key = getActiveKey();
  if (!key) return null;

  const url = `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}&key=${key}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn('[YouTube API] videos.list HTTP', resp.status);
      return null;
    }
    const json = (await resp.json()) as {
      items?: Array<{
        snippet?: { title?: string; channelTitle?: string; thumbnails?: { high?: { url: string }; medium?: { url: string } } };
        contentDetails?: { duration?: string };
      }>;
    };
    const item = json.items?.[0];
    if (!item) return null;
    const title = item.snippet?.title ?? 'Unknown Title';
    const channel = item.snippet?.channelTitle ?? 'Unknown Artist';
    const thumbnail =
      item.snippet?.thumbnails?.high?.url ??
      item.snippet?.thumbnails?.medium?.url ??
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    const duration = parseIsoDuration(item.contentDetails?.duration ?? 'PT0S');
    return { title, channel, thumbnail, duration };
  } catch (e) {
    console.warn('[YouTube API] getVideoInfoViaApi failed:', e);
    return null;
  }
}

export interface PlaylistTrackInfo {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
}

/**
 * Fetch playlist tracks via YouTube Data API v3 playlistItems.list.
 * Cost: ~1 quota unit per 50 items. Returns null if unavailable.
 * Iterates pages until the full playlist (or a 200-item cap) is loaded.
 */
export async function getPlaylistTracksViaApi(listId: string): Promise<PlaylistTrackInfo[] | null> {
  const key = getActiveKey();
  if (!key) return null;

  const tracks: PlaylistTrackInfo[] = [];
  let pageToken: string | undefined;
  const MAX_TRACKS = 200;

  try {
    while (tracks.length < MAX_TRACKS) {
      const params = new URLSearchParams({
        part: 'snippet',
        maxResults: '50',
        playlistId: listId,
        key,
      });
      if (pageToken) params.set('pageToken', pageToken);

      const resp = await fetch(`${YOUTUBE_API_BASE}/playlistItems?${params.toString()}`);
      if (!resp.ok) {
        console.warn('[YouTube API] playlistItems.list HTTP', resp.status);
        return tracks.length > 0 ? tracks : null;
      }
      const json = (await resp.json()) as {
        items?: Array<{
          snippet?: {
            title?: string;
            videoOwnerChannelTitle?: string;
            channelTitle?: string;
            thumbnails?: { high?: { url: string }; medium?: { url: string } };
            resourceId?: { videoId?: string };
          };
        }>;
        nextPageToken?: string;
      };

      for (const item of json.items ?? []) {
        const videoId = item.snippet?.resourceId?.videoId;
        if (!videoId) continue;
        tracks.push({
          videoId,
          title: item.snippet?.title ?? 'Unknown Title',
          channel: item.snippet?.videoOwnerChannelTitle ?? item.snippet?.channelTitle ?? 'Unknown Artist',
          thumbnail:
            item.snippet?.thumbnails?.high?.url ??
            item.snippet?.thumbnails?.medium?.url ??
            `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          duration: 0, // contentDetails not fetched here to save quota
        });
      }

      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }
    return tracks;
  } catch (e) {
    console.warn('[YouTube API] getPlaylistTracksViaApi failed:', e);
    return tracks.length > 0 ? tracks : null;
  }
}
