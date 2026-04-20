import { createHash } from "node:crypto";
import path from "node:path";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import YTDlpWrap from "yt-dlp-wrap";
import { createCache, searchCacheKey, CACHEABLE_HEADERS } from "../lib/memory-cache";
import { env } from "../env";

const ytDlp = new YTDlpWrap();

/** Normalized row for Discover / SoundCloud public API + yt-dlp fallback */
export type ScDiscoverTrackRow = {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
  likeCount: number;
};

type ScDiscoverFeedPayload = {
  collections: Array<{ slot: "trending" | "explore" | "spotlight"; track: ScDiscoverTrackRow }>;
  crateTracks: ScDiscoverTrackRow[];
};

// In-memory response caches for hot read endpoints.
const SC_ONE_HOUR_MS = 60 * 60 * 1000;
const SC_ONE_DAY_MS = 24 * 60 * 60 * 1000;
const scSearchCache = createCache<Array<{
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
}>>(SC_ONE_HOUR_MS);
const scDiscoverFeedCache = createCache<ScDiscoverFeedPayload>(SC_ONE_HOUR_MS);
/** Direct progressive/HLS URL for native AVPlayer — avoids full-file /audio download. */
const scStreamUrlCache = createCache<string>(4 * 60 * 60 * 1000);
const scMixesCache = createCache<unknown>(SC_ONE_DAY_MS);
const SC_MIXES_CACHE_KEY = "soundcloud:mixes";
/** Shared with `youtube` route for SoundCloud-first playback bypass. */
export const SC_URL_RE = /^https:\/\/(soundcloud\.com|on\.soundcloud\.com)\/.+/;

// SoundCloud oEmbed response type
interface SoundCloudOEmbedResponse {
  version: number;
  type: string;
  provider_name: string;
  provider_url: string;
  height: number;
  width: string;
  title: string;
  description: string;
  thumbnail_url: string;
  html: string;
  author_name: string;
  author_url: string;
}

// Parsed track metadata
interface SoundCloudTrackMetadata {
  id: string;
  title: string;
  artist: string;
  artistUrl: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
  description: string;
  downloadable: boolean;
  downloadUrl: string | null;
}

// Related track type (mock data structure for future API integration)
interface RelatedTrack {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  artwork: string;
  duration: number;
  tags: string[];
  source: "soundcloud";
  soundcloudUrl: string;
  isUnderground: boolean;
  downloadable: boolean;
  downloadUrl: string | null;
  // External search handoff
  externalSource: "SOUNDCLOUD";
  externalSearchQuery: string;
}

// Tag type
interface Tag {
  id: string;
  name: string;
  category: "genre" | "mood" | "style" | "era";
}

// Mix definition type
interface MixDefinition {
  id: string;
  name: string;
  description: string;
  coverImage: string;
  tags: string[];
  trackCount: number;
  duration: number; // in seconds
  category: "era" | "mood" | "activity";
}

// Mock related tracks database - structured for future SoundCloud API integration
// About 30% of tracks are set as downloadable (4 out of 12)
const mockRelatedTracks: RelatedTrack[] = [
  {
    id: "sc-mock-001",
    title: "Midnight Frequencies",
    artist: "Neon Drifter",
    artistId: "soundcloud-artist-neon-drifter",
    artwork: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&h=500&fit=crop",
    duration: 234,
    tags: ["ambient", "electronic", "late-night", "experimental"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/neondrifter/midnight-frequencies",
    isUnderground: true,
    downloadable: true,
    downloadUrl: "https://soundcloud.com/neondrifter/midnight-frequencies/download",
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "Neon Drifter Midnight Frequencies",
  },
  {
    id: "sc-mock-002",
    title: "Analog Dreams",
    artist: "Cassette Head",
    artistId: "soundcloud-artist-cassette-head",
    artwork: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=500&h=500&fit=crop",
    duration: 187,
    tags: ["lofi", "instrumental", "chill", "indie"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/cassettehead/analog-dreams",
    isUnderground: true,
    downloadable: false,
    downloadUrl: null,
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "Cassette Head Analog Dreams",
  },
  {
    id: "sc-mock-003",
    title: "Basement Tapes Vol. 3",
    artist: "Underground Collective",
    artistId: "soundcloud-artist-underground-collective",
    artwork: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=500&h=500&fit=crop",
    duration: 312,
    tags: ["experimental", "downtempo", "indie", "cinematic"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/undergroundcollective/basement-tapes-3",
    isUnderground: true,
    downloadable: false,
    downloadUrl: null,
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "Underground Collective Basement Tapes Vol. 3",
  },
  {
    id: "sc-mock-004",
    title: "Dawn Patrol",
    artist: "Early Bird",
    artistId: "soundcloud-artist-early-bird",
    artwork: "https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=500&h=500&fit=crop",
    duration: 256,
    tags: ["ambient", "focus", "instrumental", "deep-focus"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/earlybird/dawn-patrol",
    isUnderground: true,
    downloadable: true,
    downloadUrl: "https://soundcloud.com/earlybird/dawn-patrol/download",
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "Early Bird Dawn Patrol",
  },
  {
    id: "sc-mock-005",
    title: "Static Memory",
    artist: "Void Signal",
    artistId: "soundcloud-artist-void-signal",
    artwork: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=500&h=500&fit=crop",
    duration: 289,
    tags: ["experimental", "electronic", "ai-adjacent", "cinematic"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/voidsignal/static-memory",
    isUnderground: true,
    downloadable: false,
    downloadUrl: null,
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "Void Signal Static Memory",
  },
  {
    id: "sc-mock-006",
    title: "Tape Hiss Lullaby",
    artist: "Worn Vinyl",
    artistId: "soundcloud-artist-worn-vinyl",
    artwork: "https://images.unsplash.com/photo-1458560871784-56d23406c091?w=500&h=500&fit=crop",
    duration: 198,
    tags: ["lofi", "late-night", "chill", "indie"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/wornvinyl/tape-hiss-lullaby",
    isUnderground: true,
    downloadable: false,
    downloadUrl: null,
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "Worn Vinyl Tape Hiss Lullaby",
  },
  {
    id: "sc-mock-007",
    title: "Subterranean Drift",
    artist: "Deep Current",
    artistId: "soundcloud-artist-deep-current",
    artwork: "https://images.unsplash.com/photo-1446057032654-9d8885db76c6?w=500&h=500&fit=crop",
    duration: 345,
    tags: ["downtempo", "ambient", "experimental", "late-night"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/deepcurrent/subterranean-drift",
    isUnderground: true,
    downloadable: true,
    downloadUrl: "https://soundcloud.com/deepcurrent/subterranean-drift/download",
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "Deep Current Subterranean Drift",
  },
  {
    id: "sc-mock-008",
    title: "Pixel Rain",
    artist: "Glitch Garden",
    artistId: "soundcloud-artist-glitch-garden",
    artwork: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=500&h=500&fit=crop",
    duration: 223,
    tags: ["electronic", "experimental", "ai-adjacent", "focus"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/glitchgarden/pixel-rain",
    isUnderground: true,
    downloadable: false,
    downloadUrl: null,
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "Glitch Garden Pixel Rain",
  },
  {
    id: "sc-mock-009",
    title: "Worn Edges",
    artist: "Analog Heart",
    artistId: "soundcloud-artist-analog-heart",
    artwork: "https://images.unsplash.com/photo-1485579149621-3123dd979885?w=500&h=500&fit=crop",
    duration: 267,
    tags: ["lofi", "instrumental", "indie", "chill"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/analogheart/worn-edges",
    isUnderground: true,
    downloadable: false,
    downloadUrl: null,
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "Analog Heart Worn Edges",
  },
  {
    id: "sc-mock-010",
    title: "Night Market",
    artist: "City Whisper",
    artistId: "soundcloud-artist-city-whisper",
    artwork: "https://images.unsplash.com/photo-1504898770365-14faca6a7320?w=500&h=500&fit=crop",
    duration: 278,
    tags: ["downtempo", "cinematic", "late-night", "ambient"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/citywhisper/night-market",
    isUnderground: true,
    downloadable: false,
    downloadUrl: null,
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "City Whisper Night Market",
  },
  {
    id: "sc-mock-011",
    title: "Quiet Room",
    artist: "Still Waters",
    artistId: "soundcloud-artist-still-waters",
    artwork: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=500&h=500&fit=crop",
    duration: 301,
    tags: ["ambient", "focus", "deep-focus", "instrumental"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/stillwaters/quiet-room",
    isUnderground: true,
    downloadable: true,
    downloadUrl: "https://soundcloud.com/stillwaters/quiet-room/download",
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "Still Waters Quiet Room",
  },
  {
    id: "sc-mock-012",
    title: "Broken Transmission",
    artist: "Signal Lost",
    artistId: "soundcloud-artist-signal-lost",
    artwork: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&h=500&fit=crop",
    duration: 334,
    tags: ["experimental", "electronic", "ai-adjacent", "cinematic"],
    source: "soundcloud",
    soundcloudUrl: "https://soundcloud.com/signallost/broken-transmission",
    isUnderground: true,
    downloadable: false,
    downloadUrl: null,
    externalSource: "SOUNDCLOUD",
    externalSearchQuery: "Signal Lost Broken Transmission",
  },
];

// Mainstream tags to deprioritize
const mainstreamTags = ["pop", "mainstream", "chart", "radio-hit", "top-40"];

// Curated mix definitions
const curatedMixes: MixDefinition[] = [
  {
    id: "mix-time-traveler",
    name: "Time Traveler Radio",
    description: "Journey through musical eras - from vintage vinyl warmth to future soundscapes",
    coverImage: "https://images.unsplash.com/photo-1501612780327-45045538702b?w=500&h=500&fit=crop",
    tags: ["cinematic", "experimental", "ambient"],
    trackCount: 24,
    duration: 5400,
    category: "era",
  },
  {
    id: "mix-late-night",
    name: "Late Night",
    description: "Ambient, downtempo, and experimental sounds for the midnight hours",
    coverImage: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=500&h=500&fit=crop",
    tags: ["ambient", "downtempo", "experimental", "late-night"],
    trackCount: 18,
    duration: 4200,
    category: "mood",
  },
  {
    id: "mix-focus",
    name: "Focus",
    description: "Lo-fi, ambient, and instrumental tracks to help you concentrate",
    coverImage: "https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?w=500&h=500&fit=crop",
    tags: ["lofi", "ambient", "instrumental", "focus", "deep-focus"],
    trackCount: 20,
    duration: 4800,
    category: "activity",
  },
];

// Section definitions for auto-tagging
const sectionDefinitions = {
  ai_artists: {
    id: "ai_artists",
    name: "AI Artists",
    keywords: ["ai", "artificial", "neural", "generative", "machine learning", "algorithmic", "synthetic"],
    tags: ["ai-adjacent", "experimental", "electronic"],
  },
  late_night: {
    id: "late_night",
    name: "Late Night",
    keywords: ["night", "midnight", "dark", "nocturnal", "3am", "late", "twilight", "dusk"],
    tags: ["late-night", "ambient", "downtempo", "chill"],
  },
  time_traveler: {
    id: "time_traveler",
    name: "Time Traveler",
    keywords: ["vintage", "retro", "classic", "old school", "throwback", "nostalgia", "80s", "90s", "70s", "analog"],
    tags: ["cinematic", "experimental", "indie"],
  },
  discover_different: {
    id: "discover_different",
    name: "Discover Different",
    keywords: ["experimental", "unique", "unconventional", "avant-garde", "alternative", "underground", "obscure"],
    tags: ["experimental", "indie", "electronic"],
  },
  old_soul: {
    id: "old_soul",
    name: "Old Soul",
    keywords: ["soul", "jazz", "blues", "vinyl", "warm", "acoustic", "organic", "classic"],
    tags: ["lofi", "instrumental", "chill", "indie"],
  },
};

/**
 * Calculate suggested sections based on track metadata
 */
function calculateSuggestedSections(
  title: string,
  artist: string,
  description: string,
  tags: string[]
): string[] {
  const text = `${title} ${artist} ${description}`.toLowerCase();
  const suggestions: { sectionId: string; score: number }[] = [];

  for (const [sectionId, section] of Object.entries(sectionDefinitions)) {
    let score = 0;

    // Check keywords in text
    for (const keyword of section.keywords) {
      if (text.includes(keyword)) {
        score += 3;
      }
    }

    // Check tag matches
    for (const sectionTag of section.tags) {
      if (tags.some((t) => t.toLowerCase() === sectionTag.toLowerCase())) {
        score += 5;
      }
    }

    if (score > 0) {
      suggestions.push({ sectionId, score });
    }
  }

  // Sort by score and return top 3 section IDs
  return suggestions
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.sectionId);
}

/**
 * Extract suggested tags from track title and description
 */
function extractSuggestedTags(title: string, artist: string, description: string): Tag[] {
  const text = `${title} ${artist} ${description}`.toLowerCase();
  const suggestedTags: Tag[] = [];

  // Genre detection
  const genreKeywords: Record<string, string> = {
    lofi: "lofi",
    "lo-fi": "lofi",
    "lo fi": "lofi",
    ambient: "ambient",
    downtempo: "downtempo",
    electronic: "electronic",
    instrumental: "instrumental",
    indie: "indie",
    chillwave: "chill",
    synthwave: "electronic",
    vaporwave: "experimental",
  };

  // Mood detection
  const moodKeywords: Record<string, string> = {
    chill: "chill",
    relax: "chill",
    focus: "focus",
    study: "focus",
    work: "focus",
    sleep: "late-night",
    night: "late-night",
    midnight: "late-night",
    cinematic: "cinematic",
    film: "cinematic",
    movie: "cinematic",
  };

  // Style detection
  const styleKeywords: Record<string, string> = {
    experimental: "experimental",
    glitch: "experimental",
    ai: "ai-adjacent",
    generative: "ai-adjacent",
    neural: "ai-adjacent",
  };

  // Check genre keywords
  for (const [keyword, tagId] of Object.entries(genreKeywords)) {
    if (text.includes(keyword) && !suggestedTags.some((t) => t.id === tagId)) {
      suggestedTags.push({ id: tagId, name: tagId.charAt(0).toUpperCase() + tagId.slice(1), category: "genre" });
    }
  }

  // Check mood keywords
  for (const [keyword, tagId] of Object.entries(moodKeywords)) {
    if (text.includes(keyword) && !suggestedTags.some((t) => t.id === tagId)) {
      const nameMap: Record<string, string> = {
        chill: "Chill",
        focus: "Focus",
        "late-night": "Late Night",
        cinematic: "Cinematic",
      };
      suggestedTags.push({ id: tagId, name: nameMap[tagId] || tagId, category: "mood" });
    }
  }

  // Check style keywords
  for (const [keyword, tagId] of Object.entries(styleKeywords)) {
    if (text.includes(keyword) && !suggestedTags.some((t) => t.id === tagId)) {
      const nameMap: Record<string, string> = {
        experimental: "Experimental",
        "ai-adjacent": "AI Adjacent",
      };
      suggestedTags.push({ id: tagId, name: nameMap[tagId] || tagId, category: "style" });
    }
  }

  // Default to some sensible tags if none detected
  if (suggestedTags.length === 0) {
    suggestedTags.push({ id: "indie", name: "Indie", category: "genre" });
  }

  return suggestedTags.slice(0, 5); // Limit to 5 suggestions
}

const soundcloudRouter = new Hono();

/** Empty playlist-tracks envelope — matches mobile + route-shield stableFallback. */
const EMPTY_PLAYLIST_TRACKS = {
  tracks: [],
  playlistTitle: "",
  thumbnailUrl: "",
  canonicalUrl: "",
  playlistId: "",
};

soundcloudRouter.onError((err, c) => {
  console.error("[SoundCloud] unhandled route error:", err);
  const p = c.req.path;
  if (p.includes("playlist-tracks")) {
    return c.json({ data: EMPTY_PLAYLIST_TRACKS }, 200);
  }
  if (p.includes("stream-url")) {
    return c.json({ data: { url: "" } }, 200);
  }
  if (p.includes("import-playlist")) {
    return c.json({ data: { tracks: [], isPlaylist: false, playlistTitle: "" } }, 200);
  }
  return c.json({ data: [] }, 200);
});

/**
 * Check if track description indicates downloads are enabled
 * Since oEmbed API doesn't expose download info directly, we check for keywords
 * In production, this would use SoundCloud's full API with proper authentication
 */
function checkDownloadableFromDescription(description: string): boolean {
  if (!description) return false;

  const lowerDesc = description.toLowerCase();
  const downloadKeywords = [
    "free download",
    "download enabled",
    "download available",
    "downloads enabled",
    "free dl",
    "free d/l",
    "download link",
    "download:",
    "↓ download",
    "⬇ download",
    "click buy for free",
    "buy = free",
  ];

  return downloadKeywords.some((keyword) => lowerDesc.includes(keyword));
}

/**
 * Fetch SoundCloud track metadata using oEmbed API
 * This is the official way to get track info without API keys
 * Short URLs are expanded first before calling oEmbed
 */
async function fetchSoundCloudMetadata(url: string): Promise<SoundCloudTrackMetadata | null> {
  try {
    // CRITICAL: Expand short URLs first - oEmbed doesn't handle them well
    let canonicalUrl = url;
    if (url.includes("on.soundcloud.com")) {
      canonicalUrl = await expandShortUrl(url);
      console.log("[SoundCloud] Short URL expanded to:", canonicalUrl);
    }

    // Use SoundCloud's oEmbed endpoint with the canonical URL
    const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(canonicalUrl)}`;
    console.log("[SoundCloud] Fetching oEmbed:", oembedUrl);
    const response = await fetch(oembedUrl);

    if (!response.ok) {
      console.error("SoundCloud oEmbed error:", response.status);
      return null;
    }

    const data = (await response.json()) as SoundCloudOEmbedResponse;

    // Extract track ID from the embed HTML (contains the track ID in the iframe src)
    const trackIdMatch = data.html.match(/tracks%2F(\d+)/);
    const trackId = trackIdMatch?.[1] ?? `sc-${Date.now()}`;

    // Parse duration from the widget if available (oEmbed doesn't provide duration directly)
    // We'll estimate or let the frontend get it from the widget
    const duration = 0; // Will be populated by frontend widget

    // Get higher resolution artwork by modifying the thumbnail URL
    let artwork = data.thumbnail_url;
    if (artwork) {
      // SoundCloud thumbnails can be upgraded to larger sizes
      artwork = artwork.replace("-large", "-t500x500").replace("-original", "-t500x500");
    }

    // Check if downloads are enabled based on description keywords
    // Note: oEmbed API doesn't expose download info directly
    // In production, use SoundCloud's full API with proper authentication
    const description = data.description || "";
    const downloadable = checkDownloadableFromDescription(description);

    // If downloadable, construct the official SoundCloud download URL
    // In production, this would come from the full API response
    const downloadUrl = downloadable ? `${canonicalUrl}/download` : null;

    return {
      id: trackId,
      title: data.title,
      artist: data.author_name,
      artistUrl: data.author_url,
      artwork: artwork || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop",
      duration,
      soundcloudUrl: canonicalUrl, // Always use canonical URL, never short links
      description,
      downloadable,
      downloadUrl,
    };
  } catch (error) {
    console.error("Error fetching SoundCloud metadata:", error);
    return null;
  }
}

/**
 * Strip tracking and unnecessary query parameters from SoundCloud URLs
 * These parameters can interfere with the embed player
 */
function stripTrackingParams(url: string): string {
  try {
    const parsed = new URL(url);

    // List of parameters to remove (tracking, sharing, analytics)
    const paramsToRemove = [
      'ref', 'p', 'c', 'si',
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
      'in', 'fbclid', 'gclid',
    ];

    // Remove tracking parameters
    for (const param of paramsToRemove) {
      parsed.searchParams.delete(param);
    }

    // Return clean URL (with remaining params if any, or without query string)
    const cleanUrl = parsed.searchParams.toString()
      ? `${parsed.origin}${parsed.pathname}?${parsed.searchParams.toString()}`
      : `${parsed.origin}${parsed.pathname}`;

    return cleanUrl;
  } catch {
    return url;
  }
}

/**
 * Expand short SoundCloud URLs (on.soundcloud.com) to canonical URLs
 * Short links MUST be expanded before passing to the player
 * Also strips tracking parameters from the result
 */
async function expandShortUrl(url: string): Promise<string> {
  try {
    const parsed = new URL(url);

    // Only expand on.soundcloud.com short links
    if (parsed.hostname !== "on.soundcloud.com") {
      // Still strip tracking params from regular URLs
      return stripTrackingParams(url);
    }

    // Follow the redirect to get the canonical URL.
    // Must use GET — many shorteners don't redirect on HEAD requests.
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
    });

    const expandedUrl = response.url;

    // Validate the expanded URL is a proper soundcloud.com URL
    const expandedParsed = new URL(expandedUrl);
    if (expandedParsed.hostname !== "soundcloud.com" &&
        expandedParsed.hostname !== "www.soundcloud.com" &&
        expandedParsed.hostname !== "m.soundcloud.com") {
      console.error("[SoundCloud] Expanded URL is not soundcloud.com:", expandedUrl);
      throw new Error("Invalid expanded URL");
    }

    // Strip tracking parameters from the expanded URL
    const cleanUrl = stripTrackingParams(expandedUrl);

    return cleanUrl;
  } catch (error) {
    console.error("[SoundCloud] Failed to expand short URL:", error);
    throw new Error("Could not expand SoundCloud short link");
  }
}

/**
 * Validate and normalize SoundCloud URL
 */
function normalizeSoundCloudUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Handle short links (on.soundcloud.com)
    if (parsed.hostname === "on.soundcloud.com") {
      return url; // oEmbed API handles redirects
    }

    // Handle regular soundcloud.com URLs
    if (parsed.hostname === "soundcloud.com" || parsed.hostname === "www.soundcloud.com") {
      return url;
    }

    // Handle m.soundcloud.com (mobile)
    if (parsed.hostname === "m.soundcloud.com") {
      return url.replace("m.soundcloud.com", "soundcloud.com");
    }

    return null;
  } catch {
    return null;
  }
}

/** yt-dlp JSON row → mobile `CuratedPlaylist` track row (YouTube-shaped + `soundcloudUrl`). */
export type SoundcloudCuratedPlaylistTrackRow = {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
  soundcloudUrl: string;
};

export type SoundcloudCuratedPlaylistResult = {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  soundcloudSetUrl: string;
  tracks: SoundcloudCuratedPlaylistTrackRow[];
  category?: string;
  section?: string;
};

type SoundcloudCuratedCatalogEntry = { url: string; name: string; category?: string; section?: string };

function loadSoundcloudCuratedCatalog(): SoundcloudCuratedCatalogEntry[] {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    const catalogPath = path.join(import.meta.dir, "..", "..", "catalog", "soundcloud-curated-playlists.json");
    const raw = fs.readFileSync(catalogPath, "utf-8");
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: SoundcloudCuratedCatalogEntry[] = [];
    for (const x of arr) {
      if (!x || typeof x !== "object") continue;
      const o = x as Record<string, unknown>;
      if (typeof o.url !== "string" || typeof o.name !== "string") continue;
      const e: SoundcloudCuratedCatalogEntry = { url: o.url, name: o.name };
      if (typeof o.category === "string" && o.category.length) e.category = o.category;
      if (typeof o.section === "string" && o.section.length) e.section = o.section;
      out.push(e);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Flatten a SoundCloud set or track URL into ranked track rows (yt-dlp --flat-playlist / --dump-json).
 */
export async function fetchSoundcloudPlaylistDump(
  rawUrl: string,
  maxTracks: number,
): Promise<{ tracks: SoundcloudCuratedPlaylistTrackRow[]; playlistTitle: string; canonicalUrl: string }> {
  const normalized = normalizeSoundCloudUrl(rawUrl);
  if (!normalized) throw new Error("Invalid SoundCloud URL");

  let canonicalUrl = normalized;
  if (normalized.includes("on.soundcloud.com")) {
    canonicalUrl = await expandShortUrl(normalized);
  }

  const controller = new AbortController();
  // 20s hard cap (was 60s) — flat-playlist metadata should return quickly.
  const timer = setTimeout(() => controller.abort(), 20_000);
  let output = "";
  try {
    output = await ytDlp.execPromise(
      [canonicalUrl, "--dump-json", "--flat-playlist", "--quiet", "--no-warnings"],
      {},
      controller.signal,
    );
    clearTimeout(timer);
  } catch (e: any) {
    clearTimeout(timer);
    output = e.stderr ?? "";
    if (!output) throw new Error(`yt-dlp failed: ${e.message}`);
  }

  const rows = output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        const j = JSON.parse(line) as Record<string, unknown>;
        const idRaw = j.id;
        const id = typeof idRaw === "number" ? String(idRaw) : typeof idRaw === "string" ? idRaw : "";
        if (!id) return null;
        const thumbs = (j.thumbnails as Array<{ url: string }> | undefined) ?? [];
        const lastThumb = thumbs.length > 0 ? thumbs[thumbs.length - 1] : undefined;
        const artwork =
          lastThumb?.url ??
          "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop";
        const scPage = (j.webpage_url ?? j.url ?? canonicalUrl) as string;
        return {
          videoId: id,
          title: (j.title as string) ?? "Unknown",
          channelName: (j.uploader ?? j.channel ?? "Unknown") as string,
          thumbnailUrl: artwork,
          publishedAt: "",
          soundcloudUrl: typeof scPage === "string" && SC_URL_RE.test(scPage) ? scPage : canonicalUrl,
        } satisfies SoundcloudCuratedPlaylistTrackRow;
      } catch {
        return null;
      }
    })
    .filter((t): t is SoundcloudCuratedPlaylistTrackRow => t !== null)
    .slice(0, Math.max(1, Math.min(maxTracks, 500)));

  let playlistTitle = "Playlist";
  if (canonicalUrl.includes("/sets/")) {
    const parts = canonicalUrl.split("/sets/");
    if (parts[1]) playlistTitle = parts[1].replace(/-/g, " ").replace(/\?.*/, "").trim() || playlistTitle;
  }

  return { tracks: rows, playlistTitle, canonicalUrl };
}

function scPlaylistStableId(canonicalUrl: string): string {
  return `scset_${createHash("sha256").update(canonicalUrl).digest("hex").slice(0, 24)}`;
}

let soundcloudCuratedPlaylistsCache: { results: SoundcloudCuratedPlaylistResult[]; expiresAt: number } | null =
  null;
const SOUNDcloud_CURATED_PLAYLISTS_TTL_MS = 45 * 60 * 1000;

async function buildSoundcloudCuratedPlaylists(): Promise<SoundcloudCuratedPlaylistResult[]> {
  const meta = loadSoundcloudCuratedCatalog();
  if (meta.length === 0) return [];

  const out: SoundcloudCuratedPlaylistResult[] = [];
  for (const entry of meta) {
    try {
      const { tracks, playlistTitle, canonicalUrl } = await fetchSoundcloudPlaylistDump(entry.url, 28);
      if (tracks.length === 0) continue;
      const thumb = tracks[0]?.thumbnailUrl ?? "";
      out.push({
        playlistId: scPlaylistStableId(canonicalUrl),
        name: entry.name || playlistTitle,
        thumbnailUrl: thumb,
        soundcloudSetUrl: canonicalUrl,
        tracks,
        ...(entry.category ? { category: entry.category } : {}),
        ...(entry.section ? { section: entry.section } : {}),
      });
    } catch {
      /* skip broken catalog rows */
    }
  }
  return out;
}

/**
 * Get related tracks for import endpoint based on tags
 * Returns up to 6 diverse tracks matching the given tags
 */
function getRelatedTracksForImport(tags: string[], excludeTrackId?: string): RelatedTrack[] {
  // Filter out mainstream tags
  const filteredTags = tags.filter((tag) => !mainstreamTags.includes(tag.toLowerCase()));

  // Score tracks based on tag matches
  const scoredTracks = mockRelatedTracks
    .filter((track) => track.id !== excludeTrackId)
    .map((track) => {
      let score = 0;

      // Base score for underground artists
      if (track.isUnderground) {
        score += 10;
      }

      // Score based on tag matches
      for (const tag of filteredTags) {
        if (track.tags.includes(tag.toLowerCase())) {
          score += 5;
        }
      }

      // Bonus for experimental/indie tags
      const undergroundBonus = ["experimental", "indie", "ambient", "lofi"];
      for (const bonus of undergroundBonus) {
        if (track.tags.includes(bonus)) {
          score += 2;
        }
      }

      return { ...track, score };
    })
    .sort((a, b) => b.score - a.score);

  // Apply diversity: max 1 track per artist for initial recommendations
  const artistSeen = new Set<string>();
  const diverseTracks: typeof scoredTracks = [];

  for (const track of scoredTracks) {
    if (!artistSeen.has(track.artistId)) {
      diverseTracks.push(track);
      artistSeen.add(track.artistId);
    }
    if (diverseTracks.length >= 6) break;
  }

  // Remove score field
  return diverseTracks.map(({ score: _score, ...track }) => track);
}

/**
 * POST /api/soundcloud/import
 * Import a SoundCloud track by URL
 * Returns track data, suggested tags, suggested sections, and related tracks
 */
soundcloudRouter.post("/import", async (c) => {
  try {
    const body = await c.req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return c.json({ error: { message: "URL is required", code: "MISSING_URL" } }, 400);
    }

    // Validate and normalize URL
    const normalizedUrl = normalizeSoundCloudUrl(url);
    if (!normalizedUrl) {
      return c.json({ error: { message: "Invalid SoundCloud URL", code: "INVALID_URL" } }, 400);
    }

    // Fetch metadata from SoundCloud
    const metadata = await fetchSoundCloudMetadata(normalizedUrl);
    if (!metadata) {
      return c.json({ error: { message: "Could not fetch track info from SoundCloud", code: "FETCH_FAILED" } }, 400);
    }

    // Extract suggested tags from metadata
    const suggestedTags = extractSuggestedTags(metadata.title, metadata.artist, metadata.description);
    const tagIds = suggestedTags.map((t) => t.id);

    // Calculate suggested sections for auto-placement
    const suggestedSectionIds = calculateSuggestedSections(
      metadata.title,
      metadata.artist,
      metadata.description,
      tagIds
    );
    const suggestedSections = suggestedSectionIds.map((sectionId) => {
      const section = sectionDefinitions[sectionId as keyof typeof sectionDefinitions];
      return {
        id: section.id,
        name: section.name,
      };
    });

    // Get initial batch of related tracks (up to 6)
    const relatedTracks = getRelatedTracksForImport(tagIds);

    // Return track data in VYBE format
    const track = {
      id: `soundcloud-${metadata.id}`,
      title: metadata.title,
      artist: metadata.artist,
      artistId: `soundcloud-artist-${metadata.artist.toLowerCase().replace(/\s+/g, "-")}`,
      album: "SoundCloud",
      albumId: "soundcloud",
      artwork: metadata.artwork,
      duration: metadata.duration,
      isLiked: false,
      source: "soundcloud" as const,
      soundcloudId: metadata.id,
      soundcloudUrl: metadata.soundcloudUrl,
      artistUrl: metadata.artistUrl,
      description: metadata.description,
      downloadable: metadata.downloadable,
      downloadUrl: metadata.downloadUrl,
      // External search handoff - for opening SoundCloud search
      externalSource: "SOUNDCLOUD" as const,
      externalSearchQuery: `${metadata.artist} ${metadata.title}`.trim(),
    };

    return c.json({
      data: {
        track,
        suggestedTags,
        suggestedSections,
        relatedTracks,
      },
    });
  } catch (error) {
    console.error("SoundCloud import error:", error);
    return c.json({ error: { message: "Failed to import track", code: "IMPORT_ERROR" } }, 500);
  }
});

/**
 * POST /api/soundcloud/resolve
 * Resolve a short SoundCloud URL to get the canonical URL
 * CRITICAL: Short links (on.soundcloud.com) must be expanded before player use
 */
soundcloudRouter.post("/resolve", async (c) => {
  try {
    const body = await c.req.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return c.json({ error: { message: "URL is required", code: "MISSING_URL" } }, 400);
    }

    const normalizedUrl = normalizeSoundCloudUrl(url);
    if (!normalizedUrl) {
      return c.json({ error: { message: "Invalid SoundCloud URL", code: "INVALID_URL" } }, 400);
    }

    // Expand short URLs using the dedicated function
    const canonicalUrl = await expandShortUrl(normalizedUrl);

    return c.json({ data: { resolvedUrl: canonicalUrl } });
  } catch (error) {
    console.error("SoundCloud resolve error:", error);
    return c.json({ error: { message: "Failed to resolve URL", code: "RESOLVE_ERROR" } }, 500);
  }
});

/**
 * GET /api/soundcloud/tags
 * Get available tags for categorizing SoundCloud tracks
 */
soundcloudRouter.get("/tags", (c) => {
  const tags = [
    { id: "lofi", name: "Lo-fi", category: "genre" },
    { id: "ambient", name: "Ambient", category: "genre" },
    { id: "downtempo", name: "Downtempo", category: "genre" },
    { id: "electronic", name: "Electronic", category: "genre" },
    { id: "instrumental", name: "Instrumental", category: "genre" },
    { id: "cinematic", name: "Cinematic", category: "mood" },
    { id: "late-night", name: "Late Night", category: "mood" },
    { id: "focus", name: "Focus", category: "mood" },
    { id: "experimental", name: "Experimental", category: "style" },
    { id: "chill", name: "Chill", category: "mood" },
    { id: "deep-focus", name: "Deep Focus", category: "mood" },
    { id: "ai-adjacent", name: "AI Adjacent", category: "style" },
    { id: "indie", name: "Indie", category: "genre" },
  ];

  return c.json({ data: tags });
});

/**
 * POST /api/soundcloud/related
 * Get related tracks based on tag similarity
 * Prioritizes underground, indie, and experimental artists
 * Excludes mainstream pop unless explicitly tagged
 */
const relatedRequestSchema = z.object({
  trackId: z.string(),
  tags: z.array(z.string()).optional(),
});

soundcloudRouter.post("/related", zValidator("json", relatedRequestSchema), (c) => {
  const { trackId, tags = [] } = c.req.valid("json");

  // Filter out mainstream tags from the request
  const filteredTags = tags.filter((tag) => !mainstreamTags.includes(tag.toLowerCase()));

  // Calculate tag similarity score for each mock track
  const scoredTracks = mockRelatedTracks
    .filter((track) => track.id !== trackId) // Exclude the current track
    .map((track) => {
      let score = 0;

      // Base score for underground artists
      if (track.isUnderground) {
        score += 10;
      }

      // Score based on tag matches
      for (const tag of filteredTags) {
        if (track.tags.includes(tag.toLowerCase())) {
          score += 5;
        }
      }

      // Bonus for experimental/indie tags
      const undergroundBonus = ["experimental", "indie", "ambient", "lofi"];
      for (const bonus of undergroundBonus) {
        if (track.tags.includes(bonus)) {
          score += 2;
        }
      }

      // Penalty for mainstream tags (if any were somehow in mock data)
      for (const mainstream of mainstreamTags) {
        if (track.tags.includes(mainstream)) {
          score -= 10;
        }
      }

      return { ...track, score };
    })
    .sort((a, b) => b.score - a.score);

  // Return top 6 related tracks, removing the score field
  const relatedTracks = scoredTracks.slice(0, 6).map(({ score: _score, ...track }) => track);

  return c.json({
    data: {
      tracks: relatedTracks,
      basedOnTags: filteredTags,
      totalAvailable: scoredTracks.length,
    },
  });
});

/**
 * GET /api/soundcloud/mixes
 * Get curated mix definitions
 */
soundcloudRouter.get("/mixes", (c) => {
  const cached = scMixesCache.get(SC_MIXES_CACHE_KEY);
  if (cached) {
    c.header("Cache-Control", CACHEABLE_HEADERS["Cache-Control"]);
    return c.json({ data: cached });
  }
  if (Array.isArray(curatedMixes) ? curatedMixes.length > 0 : !!curatedMixes) {
    scMixesCache.set(SC_MIXES_CACHE_KEY, curatedMixes);
    c.header("Cache-Control", CACHEABLE_HEADERS["Cache-Control"]);
  }
  return c.json({ data: curatedMixes });
});

/**
 * GET /api/soundcloud/mixes/:id
 * Get a specific mix definition with sample tracks
 * Accepts both full ID (mix-late-night) and short ID (late-night)
 */
soundcloudRouter.get("/mixes/:id", (c) => {
  const requestedId = c.req.param("id");

  // Try to find mix by exact ID first, then with 'mix-' prefix
  let mix = curatedMixes.find((m) => m.id === requestedId);
  if (!mix) {
    // Try adding 'mix-' prefix if not found
    mix = curatedMixes.find((m) => m.id === `mix-${requestedId}`);
  }

  if (!mix) {
    return c.json({ error: { message: "Mix not found", code: "MIX_NOT_FOUND" } }, 404);
  }

  // Get tracks that match the mix's tags
  const matchingTracks = mockRelatedTracks
    .filter((track) => track.tags.some((tag) => mix.tags.includes(tag)))
    .slice(0, 8); // Return up to 8 sample tracks

  return c.json({
    data: {
      mix,
      sampleTracks: matchingTracks,
    },
  });
});

/**
 * POST /api/soundcloud/discover
 * Discover new tracks based on seed tracks and tags
 * Applies diversity rules to avoid artist spam
 */
const discoverRequestSchema = z.object({
  seedTrackIds: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  excludeIds: z.array(z.string()).optional().default([]),
  limit: z.number().min(1).max(20).optional().default(10),
});

soundcloudRouter.post("/discover", zValidator("json", discoverRequestSchema), (c) => {
  const { seedTrackIds, tags, excludeIds, limit } = c.req.valid("json");

  // Filter out mainstream tags
  const filteredTags = tags.filter((tag) => !mainstreamTags.includes(tag.toLowerCase()));

  // Gather tags from seed tracks
  const seedTags: string[] = [...filteredTags];
  for (const seedId of seedTrackIds) {
    const seedTrack = mockRelatedTracks.find((t) => t.id === seedId);
    if (seedTrack) {
      seedTags.push(...seedTrack.tags);
    }
  }
  const uniqueSeedTags = [...new Set(seedTags)];

  // Score and filter tracks
  const scoredTracks = mockRelatedTracks
    .filter((track) => {
      // Exclude already-seen tracks
      if (excludeIds.includes(track.id)) return false;
      // Exclude seed tracks
      if (seedTrackIds.includes(track.id)) return false;
      return true;
    })
    .map((track) => {
      let score = 0;

      // Base score for underground artists
      if (track.isUnderground) {
        score += 10;
      }

      // Score based on tag matches with seed tags
      for (const tag of uniqueSeedTags) {
        if (track.tags.includes(tag.toLowerCase())) {
          score += 5;
        }
      }

      // Bonus for experimental/indie tags
      const undergroundBonus = ["experimental", "indie", "ambient", "lofi"];
      for (const bonus of undergroundBonus) {
        if (track.tags.includes(bonus)) {
          score += 2;
        }
      }

      // Penalty for mainstream tags
      for (const mainstream of mainstreamTags) {
        if (track.tags.includes(mainstream)) {
          score -= 10;
        }
      }

      // Add some randomness for variety
      score += Math.random() * 3;

      return { ...track, score };
    })
    .sort((a, b) => b.score - a.score);

  // Apply diversity rules: no more than 2 tracks from same artist
  const artistCounts: Record<string, number> = {};
  const diverseTracks: typeof scoredTracks = [];

  for (const track of scoredTracks) {
    const count = artistCounts[track.artistId] || 0;
    if (count < 2) {
      diverseTracks.push(track);
      artistCounts[track.artistId] = count + 1;
    }
    if (diverseTracks.length >= limit) break;
  }

  // Remove score field from response
  const resultTracks = diverseTracks.map(({ score: _score, ...track }) => track);

  return c.json({
    data: {
      tracks: resultTracks,
      basedOnTags: uniqueSeedTags,
      totalAvailable: scoredTracks.length,
    },
  });
});

/**
 * POST /api/soundcloud/auto-tag
 * Suggest section placements based on track metadata
 */
const autoTagRequestSchema = z.object({
  title: z.string(),
  artist: z.string(),
  description: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
});

soundcloudRouter.post("/auto-tag", zValidator("json", autoTagRequestSchema), (c) => {
  const { title, artist, description, tags } = c.req.valid("json");

  // Extract additional tags from metadata
  const extractedTags = extractSuggestedTags(title, artist, description);
  const allTags = [...tags, ...extractedTags.map((t) => t.id)];
  const uniqueTags = [...new Set(allTags)];

  // Calculate suggested sections
  const suggestedSections = calculateSuggestedSections(title, artist, description, uniqueTags);

  // Return section details
  const sectionDetails = suggestedSections.map((sectionId) => {
    const section = sectionDefinitions[sectionId as keyof typeof sectionDefinitions];
    return {
      id: section.id,
      name: section.name,
    };
  });

  return c.json({
    data: {
      suggestedSections: sectionDetails,
      extractedTags: extractedTags,
    },
  });
});

/**
 * GET /api/soundcloud/search?q=...&maxResults=5
 * Search SoundCloud for tracks using yt-dlp's scsearch prefix.
 * Returns an array of { trackId, title, artist, artwork, duration, soundcloudUrl }.
 */
soundcloudRouter.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  const maxResults = Math.min(parseInt(c.req.query("maxResults") ?? "5", 10), 20);

  if (!q) return c.json({ error: { message: "Missing q parameter", code: "MISSING_Q" } }, 400);

  const cacheKey = searchCacheKey("soundcloud:search", q, maxResults);
  const cached = scSearchCache.get(cacheKey);
  if (cached) {
    c.header("Cache-Control", CACHEABLE_HEADERS["Cache-Control"]);
    return c.json({ data: cached });
  }

  try {
    const tracks = await searchSoundCloud(q, maxResults);
    if (tracks.length > 0) {
      scSearchCache.set(cacheKey, tracks);
      c.header("Cache-Control", CACHEABLE_HEADERS["Cache-Control"]);
    }
    return c.json({ data: tracks });
  } catch (e) {
    console.error("[SoundCloud] search error:", e);
    return c.json({ data: [] }, 200);
  }
});

export async function searchSoundCloud(query: string, maxResults: number): Promise<Array<{
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
}>> {
  const controller = new AbortController();
  // 20s hard cap (was 45s) — SC search should complete well under this.
  const timer = setTimeout(() => controller.abort(), 20_000);
  let output: string;
  try {
    output = await ytDlp.execPromise([
      `scsearch${maxResults}:${query}`,
      "--dump-json",
      "--flat-playlist",
      "--quiet",
      "--no-warnings",
    ], {}, controller.signal);
    clearTimeout(timer);
  } catch (e: any) {
    clearTimeout(timer);
    // yt-dlp may exit non-zero even when some results were returned; use partial stderr if present
    const stderr =
      typeof e?.stderr === "string"
        ? e.stderr
        : typeof e?.message === "string"
          ? e.message
          : "";
    output = stderr;
    if (!output.trim()) return [];
  }
  const tracks = output
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        const j = JSON.parse(line);
        const id: string = j.id ?? "";
        if (!id) return null;
        const thumbs: Array<{ url: string }> = j.thumbnails ?? [];
        const lastT = thumbs.length > 0 ? thumbs[thumbs.length - 1] : undefined;
        const artwork = lastT?.url
          ?? "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop";
        return {
          trackId: id,
          title: (j.title as string) ?? "Unknown",
          artist: (j.uploader ?? j.channel ?? "Unknown") as string,
          artwork,
          duration: (j.duration as number) ?? 0,
          soundcloudUrl: (j.webpage_url ?? j.url ?? `https://soundcloud.com/${id}`) as string,
        };
      } catch {
        return null;
      }
    })
    .filter((t): t is NonNullable<typeof t> => t !== null);

  return tracks;
}

const VIBE_SPOTLIGHT: Record<string, string> = {
  all: "electronic trending",
  chill: "chill lofi relax",
  fast: "drum and bass uptempo",
  phonk: "phonk drift",
  gym: "workout gym bass",
  late: "late night ambient",
  focus: "focus study instrumental",
};

/** Explore slot search — aligned with Discover vibe chips */
const VIBE_EXPLORE: Record<string, string> = {
  all: "electronic dance new uploads",
  chill: "chill ambient lofi discovery",
  fast: "uptempo rave bass music new",
  phonk: "phonk memphis drift new",
  gym: "gym workout trap bass power",
  late: "late night nocturnal downtempo",
  focus: "instrumental focus study deep",
};

function scNormalizeArtwork(url: string | null | undefined): string {
  if (!url) return "https://a-v2.sndcdn.com/assets/images/sc-icons/ios-a62dfc8fe7.png";
  return String(url).replace("-large", "-t500x500");
}

function scNormalizeDuration(raw: number): number {
  if (!raw || !Number.isFinite(raw)) return 0;
  return raw > 10_000 ? Math.round(raw / 1000) : Math.round(raw);
}

function scFromApiTrack(raw: Record<string, unknown>): ScDiscoverTrackRow | null {
  const id = raw?.id;
  if (id == null) return null;
  const permalink = String(raw.permalink_url ?? "");
  if (!permalink) return null;
  const user = raw.user as { username?: string } | undefined;
  const likes = Number(raw.favoritings_count ?? raw.likes_count ?? 0) || 0;
  return {
    trackId: String(id),
    title: String(raw.title ?? "Unknown"),
    artist: String(user?.username ?? "Unknown"),
    artwork: scNormalizeArtwork(raw.artwork_url as string | null),
    duration: scNormalizeDuration(Number(raw.duration ?? 0)),
    soundcloudUrl: permalink,
    likeCount: likes,
  };
}

function scFromSearchRow(t: {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
}): ScDiscoverTrackRow {
  return { ...t, likeCount: 0 };
}

async function scFetchJson<T>(url: string, timeoutMs: number): Promise<T | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function scFetchChartsTrending(clientId: string, limit: number): Promise<ScDiscoverTrackRow[]> {
  const u = `https://api-v2.soundcloud.com/charts/top?kind=trending&genre=soundcloud:genres:all-music&region=soundcloud:regions:worldwide&client_id=${encodeURIComponent(clientId)}&limit=${limit}&offset=0`;
  const j = await scFetchJson<{ collection?: Array<{ track?: Record<string, unknown> }> }>(u, 12_000);
  if (!j?.collection) return [];
  const out: ScDiscoverTrackRow[] = [];
  for (const c of j.collection) {
    const tr = c.track;
    if (!tr) continue;
    const n = scFromApiTrack(tr);
    if (n) out.push(n);
  }
  return out;
}

async function scFetchTracksSearchV1(clientId: string, q: string, limit: number): Promise<ScDiscoverTrackRow[]> {
  const u = `https://api.soundcloud.com/tracks?client_id=${encodeURIComponent(clientId)}&q=${encodeURIComponent(q)}&limit=${limit}&linked_partitioning=1`;
  const j = await scFetchJson<unknown>(u, 12_000);
  const arr = Array.isArray(j) ? j : [];
  const out: ScDiscoverTrackRow[] = [];
  for (const raw of arr) {
    const n = scFromApiTrack(raw as Record<string, unknown>);
    if (n) out.push(n);
  }
  return out;
}

export async function buildDiscoverFeedPayload(vibe: string, crateLimit: number): Promise<ScDiscoverFeedPayload> {
  const cid = env.SOUNDCLOUD_CLIENT_ID?.trim();
  const spotlightQ: string = VIBE_SPOTLIGHT[vibe] ?? VIBE_SPOTLIGHT.all ?? "electronic";
  const exploreQ: string = VIBE_EXPLORE[vibe] ?? VIBE_EXPLORE.all ?? "electronic dance new uploads";

  let trending: ScDiscoverTrackRow[] = [];
  let explore: ScDiscoverTrackRow[] = [];
  let spotlight: ScDiscoverTrackRow[] = [];

  if (cid) {
    trending = (await scFetchChartsTrending(cid, 15)) ?? [];
    explore = (await scFetchTracksSearchV1(cid, exploreQ, 12)) ?? [];
    spotlight = (await scFetchTracksSearchV1(cid, spotlightQ, 12)) ?? [];
  }

  if (trending.length === 0) {
    const rows = await searchSoundCloud("trending electronic music", 10);
    trending = rows.map(scFromSearchRow);
  }
  if (explore.length === 0) {
    const rows = await searchSoundCloud(`${exploreQ} soundcloud`, 14);
    explore = rows.map(scFromSearchRow);
  }
  if (spotlight.length === 0) {
    const rows = await searchSoundCloud(spotlightQ, 14);
    spotlight = rows.map(scFromSearchRow);
  }

  const uniq = new Map<string, ScDiscoverTrackRow>();
  const add = (t: ScDiscoverTrackRow) => {
    if (!uniq.has(t.trackId)) uniq.set(t.trackId, t);
  };
  for (const t of trending) add(t);
  for (const t of explore) add(t);
  for (const t of spotlight) add(t);

  const maxC = Math.min(Math.max(crateLimit, 24), 80);
  const crateTracks = [...uniq.values()].slice(0, maxC);

  const collections: ScDiscoverFeedPayload["collections"] = [];
  const usedCol = new Set<string>();
  const takeSlot = (slot: "trending" | "explore" | "spotlight", arr: ScDiscoverTrackRow[]) => {
    for (const t of arr) {
      if (!usedCol.has(t.trackId)) {
        usedCol.add(t.trackId);
        collections.push({ slot, track: t });
        return;
      }
    }
    for (const t of crateTracks) {
      if (!usedCol.has(t.trackId)) {
        usedCol.add(t.trackId);
        collections.push({ slot, track: t });
        return;
      }
    }
  };
  takeSlot("trending", trending);
  takeSlot("explore", explore);
  takeSlot("spotlight", spotlight);

  return { collections, crateTracks };
}

/**
 * GET /api/soundcloud/discover-feed?vibe=all&limit=36
 * Live SoundCloud charts/search when SOUNDCLOUD_CLIENT_ID is set; yt-dlp search fallback otherwise.
 */
soundcloudRouter.get("/discover-feed", async (c) => {
  const vibe = (c.req.query("vibe") ?? "all").trim().toLowerCase() || "all";
  const crateLimit = Math.min(parseInt(c.req.query("limit") ?? "36", 10), 80);
  const cacheKey = searchCacheKey("soundcloud:discover-feed", vibe, crateLimit);
  const hit = scDiscoverFeedCache.get(cacheKey);
  if (hit) {
    c.header("Cache-Control", CACHEABLE_HEADERS["Cache-Control"]);
    return c.json({ data: hit });
  }
  try {
    const payload = await buildDiscoverFeedPayload(vibe, crateLimit);
    scDiscoverFeedCache.set(cacheKey, payload);
    c.header("Cache-Control", CACHEABLE_HEADERS["Cache-Control"]);
    return c.json({ data: payload });
  } catch (e) {
    console.error("[SoundCloud] discover-feed:", e);
    return c.json({ data: { collections: [], crateTracks: [] } }, 200);
  }
});

/**
 * Resolve a SoundCloud track page to a direct CDN/HLS URL (shared cache with GET /stream-url).
 */
export async function resolveSoundcloudPageStreamUrl(pageUrl: string): Promise<string> {
  if (!SC_URL_RE.test(pageUrl)) {
    throw new Error("Invalid SoundCloud URL");
  }
  const cacheKey = `sc:${pageUrl}`;
  const hit = scStreamUrlCache.get(cacheKey);
  if (hit) return hit;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28_000);
  try {
    const output = await ytDlp.execPromise(
      [
        pageUrl,
        "-f",
        "ba[protocol^=m3u8][abr>=128]/ba[ext=m3u8]/bestaudio[abr>=128]/bestaudio[protocol^=https][ext=mp3]/bestaudio[ext=mp3]/bestaudio[ext=m4a]/bestaudio",
        "--get-url",
        "--no-playlist",
        "--no-warnings",
        "--quiet",
      ],
      {},
      controller.signal,
    );
    clearTimeout(timer);
    const line =
      output
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .pop() ?? "";
    if (!line.startsWith("http")) {
      throw new Error("Could not resolve stream URL");
    }
    scStreamUrlCache.set(cacheKey, line);
    return line;
  } catch (e) {
    clearTimeout(timer);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * GET /api/soundcloud/stream-url?url=
 * Resolve a playable CDN/HLS URL via yt-dlp --get-url (cached ~4h).
 * Mobile should prefer this for AVPlayer; fall back to /audio?quality=low on failure.
 */
soundcloudRouter.get("/stream-url", async (c) => {
  const url = c.req.query("url");
  if (!url || !SC_URL_RE.test(url)) {
    return c.json({ error: { message: "Missing or invalid SoundCloud URL", code: "INVALID_URL" } }, 400);
  }
  try {
    const line = await resolveSoundcloudPageStreamUrl(url);
    return c.json({ data: { url: line } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "resolve failed";
    console.error("[SoundCloud] stream-url:", msg);
    return c.json({ data: { url: "" } }, 200);
  }
});

/**
 * GET /api/soundcloud/audio
 * Proxy-stream SoundCloud audio via yt-dlp for in-app playback and download.
 * Query params:
 *   url  — full SoundCloud track URL (required)
 *   dl   — set to "1" to return as attachment download
 */
soundcloudRouter.get("/audio", async (c) => {
  const url = c.req.query("url");
  const isDownload = c.req.query("dl") === "1";
  // quality=low: fastest start (lowest bitrate); quality=high (default): best available
  const quality = c.req.query("quality") ?? "high";

  if (!url) {
    return c.json({ error: { message: "Missing url parameter", code: "MISSING_URL" } }, 400);
  }

  if (!SC_URL_RE.test(url)) {
    return c.json({ error: { message: "Invalid SoundCloud URL", code: "INVALID_URL" } }, 400);
  }

  // Format selection based on quality param
  // low  → worstaudio (lowest bitrate, fastest server-side download ~48kbps)
  // high → prefer HLS/m4a AAC (up to 256kbps on Go+ tracks), fall back to MP3 (128kbps) for free tracks
  const formatArg = quality === "low"
    ? "worstaudio[ext=mp3]/worstaudio[ext=m4a]/worstaudio"
    : "bestaudio[protocol^=m3u8][abr>=128]/bestaudio[ext=m4a]/bestaudio[protocol=https][ext=mp3]/bestaudio[protocol=http][ext=mp3]/bestaudio[ext=mp3]/bestaudio";

  // Use a unique base path; let yt-dlp append the real extension via %(ext)s
  const tmpBase = `/tmp/sc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpTemplate = `${tmpBase}.%(ext)s`;
  let actualPath = "";

  try {
    actualPath = await (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      try {
        const output = await ytDlp.execPromise([
          url,
          "-f", formatArg,
          "--no-playlist",
          "-o", tmpTemplate,
          "--no-warnings",
          "--no-part",
          "--print", "after_move:filepath",
        ], {}, controller.signal);
        clearTimeout(timer);
        const finalPath = output.trim().split("\n").pop()?.trim() ?? "";
        if (finalPath) return finalPath;
        throw new Error("yt-dlp produced no output file");
      } catch (e: any) {
        clearTimeout(timer);
        throw new Error(e.message?.includes("aborted") ? "yt-dlp timed out after 120s" : e.message);
      }
    })();

    const file = Bun.file(actualPath);
    const size = file.size;

    if (size === 0) {
      throw new Error("yt-dlp produced an empty file");
    }

    // Detect audio type from extension
    const ext = actualPath.split(".").pop()?.toLowerCase() ?? "mp3";
    const contentType = ext === "mp3" ? "audio/mpeg" : "audio/mp4";
    const dlFilename = ext === "mp3" ? "soundcloud-track.mp3" : "soundcloud-track.m4a";

    const buffer = await file.arrayBuffer();
    Bun.spawn(["rm", "-f", actualPath]);

    console.log(`[SoundCloud] serving ${actualPath} (${buffer.byteLength} bytes, ${contentType})`);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.byteLength.toString(),
        "Content-Disposition": isDownload
          ? `attachment; filename="${dlFilename}"`
          : `inline; filename="${dlFilename}"`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    // Cleanup any partial files
    if (actualPath) Bun.spawn(["rm", "-f", actualPath]);
    Bun.spawn(["sh", "-c", `rm -f ${tmpBase}.* 2>/dev/null`]);
    const msg = e instanceof Error ? e.message : "Download failed";
    console.error("[SoundCloud] audio download error:", msg);
    return c.json({ error: { message: msg, code: "DOWNLOAD_FAILED" } }, 502);
  }
});

/**
 * GET /api/soundcloud/download?url=...
 * Downloads a SoundCloud track to a temp file via yt-dlp then serves it with
 * Content-Length — identical pattern to /api/youtube/download/:videoId.
 * Preferred over /audio?dl=1 for offline saves because it pre-downloads
 * server-side first so the mobile gets a known-size file in one shot.
 */
soundcloudRouter.get("/download", async (c) => {
  const pageUrl = c.req.query("url");
  if (!pageUrl || !SC_URL_RE.test(pageUrl)) {
    return c.json({ error: "Missing or invalid SoundCloud URL" }, 400);
  }

  const resolvedDownloadUrl: string = pageUrl;

  const safeBase = `/tmp/sc_dl_${Date.now()}`;

  type DlResult = { ok: true; path: string; ext: string } | { ok: false; reason: string };

  async function runYtdlp(extraArgs: string[] = []): Promise<DlResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 300_000);
    try {
      await ytDlp.execPromise([
        resolvedDownloadUrl,
        "-f", "bestaudio[protocol^=m3u8][abr>=128]/bestaudio[ext=m4a]/bestaudio[protocol=https][ext=mp3]/bestaudio[protocol=http][ext=mp3]/bestaudio[ext=mp3]/bestaudio",
        "-o", `${safeBase}.%(ext)s`,
        "--no-playlist",
        "--quiet",
        ...extraArgs,
      ], {}, controller.signal);
      clearTimeout(timer);
    } catch (e: any) {
      clearTimeout(timer);
      if (e.message?.includes("aborted")) return { ok: false, reason: "Download timed out" };
      return { ok: false, reason: (e.message ?? "").slice(0, 200) };
    }
    for (const ext of ["mp3", "m4a", "opus", "ogg", "webm"]) {
      const candidate = `${safeBase}.${ext}`;
      if (await Bun.file(candidate).exists()) return { ok: true, path: candidate, ext };
    }
    return { ok: false, reason: "Output file not found after download" };
  }

  let result = await runYtdlp();
  if (!result.ok) {
    console.error("[SoundCloud /download]", result.reason);
    return c.json({ error: result.reason }, 502);
  }

  try {
    const file = Bun.file(result.path);
    const buffer = await file.arrayBuffer();
    Bun.spawn(["rm", "-f", result.path]);

    const contentType = result.ext === "mp3" ? "audio/mpeg" : "audio/mp4";
    console.log(`[SoundCloud /download] serving ${result.path} (${buffer.byteLength} bytes)`);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.byteLength.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    Bun.spawn(["rm", "-f", result.path]);
    const msg = e instanceof Error ? e.message : "Serve failed";
    console.error("[SoundCloud /download] serve error:", msg);
    return c.json({ error: msg }, 502);
  }
});

/**
 * GET /api/soundcloud/playlists
 * Curated SoundCloud sets (primary discovery playlists — replaces YouTube catalog in mobile).
 */
soundcloudRouter.get("/playlists", async (c) => {
  try {
    if (
      soundcloudCuratedPlaylistsCache &&
      Date.now() < soundcloudCuratedPlaylistsCache.expiresAt
    ) {
      c.header("Cache-Control", "public, max-age=900");
      return c.json({ data: soundcloudCuratedPlaylistsCache.results });
    }
    const results = await buildSoundcloudCuratedPlaylists();
    soundcloudCuratedPlaylistsCache = {
      results,
      expiresAt: Date.now() + SOUNDcloud_CURATED_PLAYLISTS_TTL_MS,
    };
    c.header("Cache-Control", "public, max-age=900");
    return c.json({ data: results });
  } catch (e) {
    console.error("[SoundCloud] /playlists:", e);
    return c.json({ data: [] }, 200);
  }
});

/**
 * GET /api/soundcloud/playlist-tracks?url=
 * Flat track list for playlist-detail when opening a SoundCloud set URL.
 */
soundcloudRouter.get("/playlist-tracks", async (c) => {
  const url = c.req.query("url")?.trim();
  if (!url) return c.json({ error: { message: "Missing url", code: "MISSING_URL" } }, 400);
  const normalized = normalizeSoundCloudUrl(url);
  if (!normalized) return c.json({ error: { message: "Invalid SoundCloud URL", code: "INVALID_URL" } }, 400);
  try {
    const { tracks, playlistTitle, canonicalUrl } = await fetchSoundcloudPlaylistDump(normalized, 200);
    if (tracks.length === 0) {
      return c.json({ error: { message: "No tracks found", code: "NO_TRACKS" } }, 400);
    }
    const thumb = tracks[0]?.thumbnailUrl ?? "";
    return c.json({
      data: {
        tracks,
        playlistTitle,
        thumbnailUrl: thumb,
        canonicalUrl,
        playlistId: scPlaylistStableId(canonicalUrl),
      },
    });
  } catch (error) {
    console.error("[SoundCloud] playlist-tracks:", error);
    return c.json({ data: EMPTY_PLAYLIST_TRACKS }, 200);
  }
});

/**
 * POST /api/soundcloud/import-playlist
 * Import all tracks from a SoundCloud playlist URL using yt-dlp flat-playlist dump.
 */
soundcloudRouter.post("/import-playlist", async (c) => {
  try {
    const body = await c.req.json();
    const { url } = body as { url: string };
    if (!url) return c.json({ error: { message: "URL required", code: "MISSING_URL" } }, 400);

    const normalized = normalizeSoundCloudUrl(url);
    if (!normalized) return c.json({ error: { message: "Invalid SoundCloud URL", code: "INVALID_URL" } }, 400);

    let canonicalUrl = normalized;
    if (normalized.includes("on.soundcloud.com")) {
      canonicalUrl = await expandShortUrl(normalized);
    }

    const isPlaylist = canonicalUrl.includes("/sets/");
    const { tracks: rows, playlistTitle } = await fetchSoundcloudPlaylistDump(normalized, 500);

    const tracks = rows.map((t) => ({
      id: `soundcloud-${t.videoId}`,
      title: t.title,
      artist: t.channelName,
      artwork: t.thumbnailUrl,
      duration: 0,
      soundcloudUrl: t.soundcloudUrl,
      source: "soundcloud" as const,
    }));

    if (tracks.length === 0) {
      return c.json({ error: { message: "No tracks found", code: "NO_TRACKS" } }, 400);
    }

    return c.json({ data: { tracks, isPlaylist: isPlaylist || tracks.length > 1, playlistTitle } });
  } catch (error) {
    console.error("[SoundCloud] import-playlist error:", error);
    return c.json({ data: { tracks: [], isPlaylist: false, playlistTitle: "" } }, 200);
  }
});

export { soundcloudRouter };
