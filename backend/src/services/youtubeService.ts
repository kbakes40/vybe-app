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
import path from 'path';
import os from 'os';
import { cookieArgsForYtdlp } from '../lib/youtubeCookies';

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

/**
 * Quarantined key indices — keys that have returned `400 API_KEY_INVALID`,
 * `keyInvalid`, `accessNotConfigured`, or similar permanent-failure responses
 * during this process lifetime. Skipped by `getActiveKey()` and `rotateKey()`
 * so we don't waste a Google round-trip on every cache miss iterating through
 * known-dead keys (which is the source of the per-request 1–2.5s backend lag
 * when several keys are bad). Cleared at the next day-rollover reset.
 */
const deadKeys = new Set<number>();

function markCurrentKeyDead(reason: string): void {
  if (activeKeyIndex < UNIQUE_API_KEYS.length) {
    if (!deadKeys.has(activeKeyIndex)) {
      console.warn(`[YouTube] Quarantining key ${activeKeyIndex + 1}/${UNIQUE_API_KEYS.length} for process lifetime — ${reason}`);
      deadKeys.add(activeKeyIndex);
    }
  }
}

/** Find the next non-dead index at or after `from`. Returns `UNIQUE_API_KEYS.length` if none. */
function nextLiveIndex(from: number): number {
  let i = from;
  while (i < UNIQUE_API_KEYS.length && deadKeys.has(i)) i++;
  return i;
}

/**
 * Diagnostic snapshot of which YOUTUBE_API_KEY_* env vars are populated
 * and what they look like. Never returns the raw key — only length and a
 * masked preview ("AIza…XYZ4") so you can verify which slot has bad data.
 */
export function getYoutubeApiKeysDiagnostic() {
  const slots = [
    { env: 'YOUTUBE_API_KEY_1', value: process.env.YOUTUBE_API_KEY_1 },
    { env: 'YOUTUBE_API_KEY_2', value: process.env.YOUTUBE_API_KEY_2 },
    { env: 'YOUTUBE_API_KEY_3', value: process.env.YOUTUBE_API_KEY_3 },
    { env: 'YOUTUBE_API_KEY_4', value: process.env.YOUTUBE_API_KEY_4 },
    { env: 'YOUTUBE_API_KEY_5', value: process.env.YOUTUBE_API_KEY_5 },
    { env: 'YOUTUBE_API_KEY', value: process.env.YOUTUBE_API_KEY },
  ];
  return {
    activeKeyIndex,
    uniqueLoaded: UNIQUE_API_KEYS.length,
    quarantinedThisProcess: Array.from(deadKeys).map(i => i + 1).sort((a, b) => a - b),
    slots: slots.map(({ env, value }) => {
      const trimmed = value?.trim() ?? '';
      const set = trimmed.length > 0;
      const looksValid = /^AIza[0-9A-Za-z_-]{35}$/.test(trimmed);
      return {
        env,
        set,
        length: trimmed.length,
        hasWhitespaceInRaw: !!value && value.trim().length !== value.length,
        looksLikeGoogleApiKey: looksValid,
        preview: set ? `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}` : null,
      };
    }),
  };
}

/**
 * Live probe: hits a free, deterministic Google API endpoint with each
 * loaded key and reports the HTTP status. Uses `videos.list` with a known
 * public videoId — costs 1 quota unit per key. Reveals the *actual* failure
 * (API_KEY_INVALID vs PERMISSION_DENIED vs IP/referrer restriction).
 */
export async function probeYoutubeApiKeys(): Promise<Array<{ slot: number; preview: string; status: number; ok: boolean; error?: string }>> {
  const TEST_VIDEO_ID = 'dQw4w9WgXcQ';
  const url = (key: string) =>
    `https://www.googleapis.com/youtube/v3/videos?part=id&id=${TEST_VIDEO_ID}&key=${encodeURIComponent(key)}`;
  const out: Array<{ slot: number; preview: string; status: number; ok: boolean; error?: string }> = [];
  for (let i = 0; i < UNIQUE_API_KEYS.length; i++) {
    const k = UNIQUE_API_KEYS[i]!;
    try {
      const res = await fetch(url(k), { signal: AbortSignal.timeout(5000) });
      const ok = res.ok;
      let errReason: string | undefined;
      if (!ok) {
        try {
          const j = (await res.json()) as { error?: { errors?: Array<{ reason?: string }>; message?: string } };
          errReason = j?.error?.errors?.[0]?.reason ?? j?.error?.message;
        } catch {
          /* noop */
        }
      }
      out.push({
        slot: i + 1,
        preview: `${k.slice(0, 6)}…${k.slice(-4)}`,
        status: res.status,
        ok,
        error: errReason,
      });
    } catch (e: any) {
      out.push({
        slot: i + 1,
        preview: `${k.slice(0, 6)}…${k.slice(-4)}`,
        status: 0,
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  }
  return out;
}

function getActiveKey(): string | null {
  // Auto-reset: if all keys were exhausted and a new day has started
  // (YouTube quota resets at midnight PT), start back at key 1 so the
  // fresh daily quota is used without needing a manual restart. The dead-key
  // quarantine set is also cleared on rollover — a key that was rejected for
  // quota-or-billing reasons may have been re-enabled overnight.
  if (activeKeyIndex >= UNIQUE_API_KEYS.length && allKeysExhaustedAt > 0) {
    const nextReset = getNextMidnightPT();
    const lastMidnight = nextReset - 24 * 60 * 60 * 1000;
    if (allKeysExhaustedAt < lastMidnight) {
      console.log('[YouTube] New day — resetting all API keys to fresh quota (clearing dead-key quarantine)');
      activeKeyIndex = 0;
      allKeysExhaustedAt = 0;
      deadKeys.clear();
      for (const ks of keyStats) {
        ks.totalUnits = 0;
        ks.callCount = 0;
        ks.resetAt = nextReset;
      }
    }
  }
  // Skip past any keys that have been quarantined this process lifetime.
  // Without this, a process that's already advanced past the dead keys is
  // fine, but a fresh process or any code that resets activeKeyIndex would
  // re-burn the dead round-trips.
  if (deadKeys.has(activeKeyIndex)) {
    activeKeyIndex = nextLiveIndex(activeKeyIndex);
  }
  return UNIQUE_API_KEYS[activeKeyIndex] ?? null;
}

function rotateKey(reason: string): boolean {
  // Advance past the next non-dead key. If the caller is rotating because the
  // current key 400'd, the call site should also have called
  // markCurrentKeyDead() so we don't come back to it later.
  const next = nextLiveIndex(activeKeyIndex + 1);
  if (next >= UNIQUE_API_KEYS.length) {
    console.warn(`[YouTube] All ${UNIQUE_API_KEYS.length} key(s) exhausted (${deadKeys.size} dead, ${UNIQUE_API_KEYS.length - deadKeys.size} live). ${reason}`);
    allKeysExhaustedAt = Date.now();
    activeKeyIndex = UNIQUE_API_KEYS.length;
    return false;
  }
  activeKeyIndex = next;
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

/**
 * When every configured key has been exhausted (quota / rotation), skip YouTube
 * Data API v3 entirely until the next Pacific midnight — avoids multi-second
 * key-rotation retries before yt-dlp / SoundCloud fallbacks.
 */
export function shouldSkipYoutubeDataApiDueToQuotaExhaustion(): boolean {
  if (UNIQUE_API_KEYS.length === 0) return false;
  if (!(activeKeyIndex >= UNIQUE_API_KEYS.length && allKeysExhaustedAt > 0)) {
    return false;
  }
  const nextReset = getNextMidnightPT();
  const lastMidnight = nextReset - 24 * 60 * 60 * 1000;
  return allKeysExhaustedAt >= lastMidnight;
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

  if (shouldSkipYoutubeDataApiDueToQuotaExhaustion()) {
    console.warn('[YouTube] All API keys exhausted — skipping Data API search (use yt-dlp / cache)');
    return getCachedSearch(query, maxResults) ?? [];
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
        // 400 API_KEY_INVALID / badRequest → key is permanently broken for the
        // process lifetime (until day-rollover). Quarantine the index and
        // advance — markCurrentKeyDead() ensures we never iterate back through
        // this slot and burn another Google round-trip on it.
        if (
          response.status === 400 &&
          (body.includes('API_KEY_INVALID') ||
           body.includes('API key not valid') ||
           body.includes('keyInvalid'))
        ) {
          markCurrentKeyDead(`400 API_KEY_INVALID (search)`);
          const rotated = rotateKey(`400 API_KEY_INVALID on key ${activeKeyIndex + 1}`);
          if (!rotated) return getCachedSearch(query, maxResults) ?? [];
          continue; // retry with new key
        }
        // Other HTTP 400 responses are intentionally silent (noisy on Railway + overhead in logs).
        if (response.status === 400) {
          return [];
        }
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
// Playlist IDs + labels live in `catalog/curated-playlists.json` (served by the
// lightweight content server). Optional env `CURATED_PLAYLISTS_CATALOG_URL`
// overrides the bundled file so you can update the home catalog without
// redeploying the main API.

export type CuratedPlaylistMetaEntry = {
  id: string;
  name: string;
  category?: string;
  section?: string;
};

function normalizeCuratedMetaEntries(raw: unknown): CuratedPlaylistMetaEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CuratedPlaylistMetaEntry[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== 'string' || o.id.length < 4 || typeof o.name !== 'string') continue;
    const e: CuratedPlaylistMetaEntry = { id: o.id, name: o.name };
    if (typeof o.category === 'string' && o.category.length > 0) e.category = o.category;
    if (typeof o.section === 'string' && o.section.length > 0) e.section = o.section;
    out.push(e);
  }
  return out;
}

function loadBundledCuratedMeta(): CuratedPlaylistMetaEntry[] {
  try {
    const { readFileSync } = require('fs') as typeof import('fs');
    const catalogPath = path.join(import.meta.dir, '..', '..', 'catalog', 'curated-playlists.json');
    const raw = readFileSync(catalogPath, 'utf-8');
    return normalizeCuratedMetaEntries(JSON.parse(raw) as unknown);
  } catch (e) {
    console.warn('[CuratedCatalog] bundled catalog missing or invalid:', e);
    return [];
  }
}

const REMOTE_CATALOG_TTL_MS = 5 * 60 * 1000;
let remoteCatalogCache: { entries: CuratedPlaylistMetaEntry[]; expiresAt: number } | null = null;

async function getCuratedPlaylistsMeta(): Promise<CuratedPlaylistMetaEntry[]> {
  const url = (process.env.CURATED_PLAYLISTS_CATALOG_URL ?? '').trim();
  if (url) {
    if (remoteCatalogCache && Date.now() < remoteCatalogCache.expiresAt) {
      return remoteCatalogCache.entries;
    }
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15_000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const entries = normalizeCuratedMetaEntries(await res.json());
      if (entries.length === 0) throw new Error('empty catalog');
      remoteCatalogCache = { entries, expiresAt: Date.now() + REMOTE_CATALOG_TTL_MS };
      console.log(`[CuratedCatalog] loaded ${entries.length} entries from ${url}`);
      return entries;
    } catch (e) {
      console.warn('[CuratedCatalog] remote catalog failed, using bundled file:', e);
    }
  }
  return loadBundledCuratedMeta();
}

export interface PlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  /** YouTube channel id when yt-dlp provides it — used client-side for artist navigation */
  channelId?: string;
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

const YTDLP_TMP = path.join(os.tmpdir(), 'yt-dlp');

/** Prefer downloaded binary, then Nixpacks/PATH `yt-dlp` (Linux prod). */
function resolveYtdlpBinForService(): string {
  if (process.platform === 'darwin') return '/opt/homebrew/bin/yt-dlp';
  try {
    const fs = require('fs') as typeof import('fs');
    if (fs.existsSync(YTDLP_TMP)) return YTDLP_TMP;
  } catch { /* ignore */ }
  return 'yt-dlp';
}

function playlistTrackInfoToPlaylistTracks(items: PlaylistTrackInfo[]): PlaylistTrack[] {
  return items.map((t) => ({
    videoId: t.videoId,
    title: t.title,
    channelName: t.channel,
    thumbnailUrl: t.thumbnail,
    publishedAt: '',
  }));
}

/**
 * YouTube Music "mix" lists (RDCLAK5uy_*, RD…) do not reliably return items from
 * playlistItems.list; try yt-dlp + search instead of burning quota on a doomed API call.
 */
function isMixStylePlaylistId(playlistId: string): boolean {
  return playlistId.startsWith('RD');
}

/**
 * Prefer Data API for normal playlists; yt-dlp for mixes / API gaps; then search by title
 * so the home feed still fills when both fail on datacenter IPs.
 */
type CuratedFetchOpts = { searchFallbackBudget?: { left: number } };

async function fetchPlaylistTracksForCurated(
  playlistId: string,
  maxTracks: number,
  playlistDisplayName?: string,
  opts?: CuratedFetchOpts
): Promise<PlaylistTrack[]> {
  if (isYouTubeApiAvailable() && !isMixStylePlaylistId(playlistId)) {
    const apiTracks = await getPlaylistTracksViaApi(playlistId, { maxTracks });
    if (apiTracks && apiTracks.length > 0) {
      return playlistTrackInfoToPlaylistTracks(apiTracks).slice(0, maxTracks);
    }
  }

  const viaDlp = await fetchPlaylistTracksViaYTDLP(playlistId);
  if (viaDlp.length > 0) return viaDlp.slice(0, maxTracks);

  const label = (playlistDisplayName ?? '').trim();
  const budget = opts?.searchFallbackBudget;
  if (isYouTubeApiAvailable() && label.length > 0 && (!budget || budget.left > 0)) {
    const discovered = await searchYouTube(`${label} music`, maxTracks);
    if (discovered.length > 0) {
      if (budget) budget.left -= 1;
      console.log(`[Curated] search fallback for "${label}" (${playlistId}) → ${discovered.length} tracks`);
      return discovered.map((d) => ({
        videoId: d.videoId,
        title: d.title,
        channelName: d.channelName,
        thumbnailUrl: d.thumbnailUrl,
        publishedAt: d.publishedAt,
      }));
    }
  }

  return [];
}

/**
 * Fetch tracks from a YouTube Music playlist via yt-dlp — no API key needed.
 */
function fetchPlaylistTracksViaYTDLP(playlistId: string): Promise<PlaylistTrack[]> {
  return new Promise((resolve) => {
    const { spawn } = require('child_process');
    const bin = resolveYtdlpBinForService();
    const url = playlistId.startsWith('PL')
      ? `https://www.youtube.com/playlist?list=${playlistId}`
      : `https://music.youtube.com/playlist?list=${playlistId}`;
    const proc = spawn(bin, [
      url, '--flat-playlist', '--dump-json', '--no-warnings', '--quiet',
      '--extractor-args', 'youtube:player_client=ios',
      ...cookieArgsForYtdlp(),
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
          const channelId =
            typeof item.channel_id === 'string' && item.channel_id
              ? item.channel_id
              : typeof item.channel_url === 'string' && item.channel_url.includes('/channel/')
                ? (item.channel_url.split('/channel/')[1]?.split('/')[0] ?? undefined)
                : undefined;
          tracks.push({
            videoId,
            title: item.title ?? '',
            channelName: item.channel ?? item.uploader ?? '',
            ...(channelId ? { channelId } : {}),
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
  if (isYouTubeApiAvailable() && !isMixStylePlaylistId(playlistId)) {
    const apiTracks = await getPlaylistTracksViaApi(playlistId, { maxTracks: 200 });
    if (apiTracks && apiTracks.length > 0) return playlistTrackInfoToPlaylistTracks(apiTracks);
  }
  return fetchPlaylistTracksViaYTDLP(playlistId);
}

/**
 * Playlist cover via Data API when a key is configured (thumbnail only).
 * Rotates past dead keys on 400 API_KEY_INVALID so a single bad slot doesn't
 * silently zero out every playlist cover.
 */
async function fetchPlaylistThumbnailFromAPI(playlistId: string): Promise<string> {
  while (activeKeyIndex < UNIQUE_API_KEYS.length) {
    const apiKey = getActiveKey();
    if (!apiKey) return '';
    try {
      const params = new URLSearchParams({ part: 'snippet', id: playlistId, key: apiKey });
      const res = await fetch(`${YOUTUBE_API_BASE}/playlists?${params}`);
      if (!res.ok) {
        if (res.status === 400 || res.status === 403) {
          const body = await res.text().catch(() => '');
          if (body.includes('API_KEY_INVALID') || body.includes('API key not valid') || body.includes('keyInvalid')) {
            markCurrentKeyDead('400 API_KEY_INVALID (playlist thumb)');
            if (rotateKey('playlist thumb dead key')) continue;
          }
        }
        return '';
      }
      const json = await res.json() as { items?: { snippet: { thumbnails: { maxres?: { url: string }; high?: { url: string }; medium?: { url: string }; default?: { url: string } } } }[] };
      const thumbnails = json.items?.[0]?.snippet?.thumbnails;
      if (!thumbnails) return '';
      return thumbnails.maxres?.url ?? thumbnails.high?.url ?? thumbnails.medium?.url ?? thumbnails.default?.url ?? '';
    } catch {
      return '';
    }
  }
  return '';
}

export async function fetchCuratedPlaylists(): Promise<CuratedPlaylistResult[]> {
  if (curatedPlaylistsCache && Date.now() < curatedPlaylistsCache.expiresAt) {
    return curatedPlaylistsCache.results;
  }

  const meta = await getCuratedPlaylistsMeta();
  /** Each search fallback costs ~100 quota units; cap per refresh to protect the daily pool. */
  const searchFallbackBudget = { left: 32 };
  const results = await Promise.all(
    meta.map(async ({ id, name, category, section }) => {
      const [tracks, playlistThumbnail] = await Promise.all([
        fetchPlaylistTracksForCurated(id, 200, name, { searchFallbackBudget }),
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
  // Avoid freezing an empty home feed for 24h when yt-dlp/API had a transient failure.
  if (nonEmpty.length > 0) {
    curatedPlaylistsCache = { results: nonEmpty, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS };
  }
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
 * Rotates past dead keys on 400 API_KEY_INVALID so a single bad slot doesn't
 * silently zero out the trending rail forever.
 */
export async function fetchNewReleases(maxResults = 20): Promise<NewReleaseResult[]> {
  if (newReleasesCache && Date.now() < newReleasesCache.expiresAt) {
    globalCacheHits++;
    return newReleasesCache.results;
  }

  while (activeKeyIndex < UNIQUE_API_KEYS.length) {
    const apiKey = getActiveKey();
    if (!apiKey) return [];

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
      if (!response.ok) {
        if (response.status === 400 || response.status === 403) {
          const body = await response.text().catch(() => '');
          if (body.includes('API_KEY_INVALID') || body.includes('API key not valid') || body.includes('keyInvalid')) {
            markCurrentKeyDead('400 API_KEY_INVALID (new releases)');
            if (rotateKey('new releases dead key')) continue;
          }
        }
        return [];
      }

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
  return [];
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
  // Iterate past dead keys instead of giving up on the first 400. Without
  // this, /info on the very first request after restart would burn one
  // round-trip per dead key before hitting yt-dlp fallback (the source of
  // the per-request lag).
  while (activeKeyIndex < UNIQUE_API_KEYS.length) {
    const key = getActiveKey();
    if (!key) return null;

    const url = `${YOUTUBE_API_BASE}/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}&key=${key}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        if (resp.status === 400 || resp.status === 403) {
          const body = await resp.text().catch(() => '');
          if (body.includes('API_KEY_INVALID') || body.includes('API key not valid') || body.includes('keyInvalid')) {
            markCurrentKeyDead('400 API_KEY_INVALID (videoInfo)');
            if (rotateKey('videoInfo dead key')) continue;
          }
        }
        if (resp.status !== 400) {
          console.warn('[YouTube API] videos.list HTTP', resp.status);
        }
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
  return null;
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
export async function getPlaylistTracksViaApi(
  listId: string,
  opts?: { maxTracks?: number }
): Promise<PlaylistTrackInfo[] | null> {
  if (shouldSkipYoutubeDataApiDueToQuotaExhaustion()) {
    return null;
  }
  const key = getActiveKey();
  if (!key) return null;

  const tracks: PlaylistTrackInfo[] = [];
  let pageToken: string | undefined;
  const MAX_TRACKS_CAP = 200;
  const maxWanted = Math.min(opts?.maxTracks ?? MAX_TRACKS_CAP, MAX_TRACKS_CAP);

  try {
    while (tracks.length < maxWanted) {
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
        return tracks.length > 0 ? tracks.slice(0, maxWanted) : null;
      }
      trackQuotaUsage(1, `playlistItems.list("${listId}")`);
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
        if (tracks.length >= maxWanted) break;
      }

      pageToken = json.nextPageToken;
      if (!pageToken || tracks.length >= maxWanted) break;
    }
    return tracks.slice(0, maxWanted);
  } catch (e) {
    console.warn('[YouTube API] getPlaylistTracksViaApi failed:', e);
    return tracks.length > 0 ? tracks.slice(0, maxWanted) : null;
  }
}
