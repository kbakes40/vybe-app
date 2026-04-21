/**
 * YouTube / YouTube Music → expo-av playback bridge.
 * Stream URLs come from the Railway resolver (CDN) with /api/youtube/audio/:id proxy fallback.
 *
 * SoundCloud: playable URLs are resolved server-side (`/api/soundcloud/stream-url`, `/api/soundcloud/audio`).
 * Do not embed `client_id` in the mobile app — backend holds credentials.
 */

import { Image } from 'react-native';
import type { AVPlaybackStatus } from 'expo-av';
import type { Track } from '@/types/music';
import {
  resolveYoutubeEnvelopeForPlaybackWithBudget,
  invalidateYoutubeResolveCache,
  preResolveYoutubeVideoId,
} from '@/lib/youtubeResolvePreloadCache';
import type { YoutubeHealMeta } from '@/lib/youtubeResolvePreloadCache';

/** Budget (ms) to wait for direct CDN URL before falling back to proxy. */
const RESOLVE_BUDGET_MS = 2_800;

/**
 * Headers passed through to AVPlayer / expo-av for YouTube CDN + proxy streams.
 * Mirrors mobile Safari + YouTube referer to reduce -1008 / resource-unavailable failures.
 */
export const YOUTUBE_AV_PLAYER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  Referer: 'https://www.youtube.com/',
};

export function createYoutubeAvPlaybackSource(playUri: string): { uri: string; headers: Record<string, string> } {
  return { uri: playUri, headers: YOUTUBE_AV_PLAYER_HEADERS };
}

/** Match Bandcamp tag/album fetches — bcbits streams often 403 without browser-ish headers. */
const BANDCAMP_STREAM_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * Direct `*.bcbits.com` preview URL + headers (used when backend has no
 * `/api/bandcamp` deploy or proxy load fails with 404 / JSON body).
 */
export function bandcampDirectPlaybackSource(track: Track): { uri: string; headers: Record<string, string> } {
  const stream = track.audioUrl?.trim() ?? '';
  const tr = track.bandcampTralbumUrl?.trim();
  let referer = 'https://bandcamp.com/';
  let origin = 'https://bandcamp.com';
  if (tr) {
    try {
      const u = new URL(tr);
      origin = u.origin;
      referer = `${u.origin}${u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`}`;
    } catch {
      /* keep defaults */
    }
  }
  return {
    uri: stream,
    headers: {
      'User-Agent': BANDCAMP_STREAM_UA,
      Referer: referer,
      Origin: origin,
    },
  };
}

/**
 * Bandcamp previews: play through the Vybe backend (`/api/bandcamp/audio`) so
 * expo-av hits our origin (Range / TLS friendly). Direct `*.bcbits.com` URLs
 * often fail or 403 on device. Falls back to direct URL + headers if no backend.
 */
export function createBandcampAvPlaybackSource(
  track: Track,
): { uri: string; headers?: Record<string, string> } {
  const stream = track.audioUrl?.trim() ?? '';
  if (!stream.startsWith('http')) {
    return { uri: stream };
  }

  const backend = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '').trim();
  if (backend) {
    const ref = (track.bandcampTralbumUrl ?? 'https://bandcamp.com').trim();
    const q = new URLSearchParams();
    q.set('url', stream);
    q.set('ref', ref);
    return { uri: `${backend}/api/bandcamp/audio?${q.toString()}` };
  }

  return bandcampDirectPlaybackSource(track);
}

/** Long signed bcbits URLs in a query string can exceed iOS URL limits — use POST session + short path. */
const MAX_BANDCAMP_PROXY_URI_CHARS = 3800;

/**
 * Resolves the expo-av source for Bandcamp previews (proxy or direct). Prefer this over
 * {@link createBandcampAvPlaybackSource} for playback so oversized proxy URLs become `/stream/:token`.
 */
export async function resolveBandcampAvPlaybackSourceAsync(
  track: Track,
): Promise<{ uri: string; headers?: Record<string, string> }> {
  const base = createBandcampAvPlaybackSource(track);
  if (base.headers) return base;
  if (base.uri.length <= MAX_BANDCAMP_PROXY_URI_CHARS) return base;

  const backend = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '').trim();
  const stream = track.audioUrl?.trim() ?? '';
  const ref = (track.bandcampTralbumUrl ?? 'https://bandcamp.com').trim();

  try {
    const res = await fetch(`${backend}/api/bandcamp/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ url: stream, ref }),
    });
    if (!res.ok) {
      console.warn('[Bandcamp] session POST failed', res.status);
      return base;
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token || typeof data.token !== 'string') return base;
    return { uri: `${backend}/api/bandcamp/stream/${data.token}` };
  } catch (e) {
    console.warn('[Bandcamp] session POST error', e);
    return base;
  }
}

/** Safe duration for progress UI — avoids NaN when `track.duration` is missing. */
export function durationMillisFromPlaybackStatus(status: AVPlaybackStatus, track: Track): number {
  if (!status.isLoaded) return 0;
  const dm = status.durationMillis;
  if (typeof dm === 'number' && Number.isFinite(dm) && dm > 0) return dm;
  const td = track.duration;
  if (typeof td === 'number' && Number.isFinite(td) && td > 0) return td * 1000;
  return 0;
}

/**
 * Extract YouTube video id from API-shaped tracks or legacy `ytm-` / `yt-` ids.
 */
export function extractYoutubeVideoId(track: Track): string | null {
  const a = track.youtubeMusicId?.trim();
  if (a) return a;
  const b = track.youtubeId?.trim();
  if (b) return b;
  const id = track.id?.trim() ?? '';
  let m = id.match(/^ytm-([^/]+)$/);
  if (m?.[1]) return m[1];
  m = id.match(/^yt-([^/]+)$/);
  if (m?.[1]) return m[1];
  return null;
}

/**
 * Ensure `youtubeMusicId` / `youtubeId` are populated when inferable from `id`.
 */
export function normalizeYoutubeTrackForPlayback(track: Track): Track {
  const vid = extractYoutubeVideoId(track);
  if (!vid) return track;

  let next: Track = { ...track };

  if (next.source === 'youtube_music' && !next.youtubeMusicId) {
    next = { ...next, youtubeMusicId: vid };
  }
  if (next.source === 'youtube' && !next.youtubeId) {
    next = { ...next, youtubeId: vid };
  }

  if (!next.source && next.id.startsWith('ytm-')) {
    next = { ...next, source: 'youtube_music', youtubeMusicId: next.youtubeMusicId ?? vid };
  }
  if (!next.source && next.id.startsWith('yt-') && !next.id.startsWith('ytm-')) {
    next = { ...next, source: 'youtube', youtubeId: next.youtubeId ?? vid };
  }

  return next;
}

export type YoutubeStreamResolution = {
  /** Final URI passed to expo-av `loadAsync` */
  playUri: string;
  /** True when using cached /resolve CDN URL */
  fromCdn: boolean;
  /** Server substituted a SoundCloud stream for a failed vault resolve. */
  healedMeta?: YoutubeHealMeta | null;
  xHealed?: boolean;
};

/**
 * Resolve a playable URL: try CDN within budget, else backend progressive proxy.
 * Performs a second resolve pass (cache-busted) when the first pass misses CDN, to recover from flaky handshakes.
 */
export async function resolveYoutubeStreamForVideoId(
  videoId: string,
  backendBaseNoSlash: string,
  options?: {
    forceRefresh?: boolean;
    skipDirect?: boolean;
    soundcloudUrl?: string;
    soundcloudId?: string;
  },
): Promise<YoutubeStreamResolution> {
  const scQ = new URLSearchParams();
  if (options?.soundcloudUrl?.trim()) scQ.set('soundcloudUrl', options.soundcloudUrl.trim());
  if (options?.soundcloudId?.trim()) scQ.set('soundcloudId', options.soundcloudId.trim());
  const scQs = scQ.toString();
  const proxyUrl = scQs
    ? `${backendBaseNoSlash}/api/youtube/audio/${videoId}?${scQs}`
    : `${backendBaseNoSlash}/api/youtube/audio/${videoId}`;

  if (options?.forceRefresh) {
    invalidateYoutubeResolveCache(videoId);
  }

  // Retry path: a previously-returned CDN URL just 403'd in AVPlayer.
  // Skip CDN entirely and go straight to the proxy — which re-resolves
  // server-side with fresh tokens and streams bytes directly. Saves ~5s.
  if (options?.skipDirect) {
    return { playUri: proxyUrl, fromCdn: false };
  }

  const tryDirect = async () => {
    preResolveYoutubeVideoId(videoId, options?.soundcloudUrl, options?.soundcloudId);
    return resolveYoutubeEnvelopeForPlaybackWithBudget(videoId, RESOLVE_BUDGET_MS, {
      fresh: options?.forceRefresh ?? false,
      soundcloudUrl: options?.soundcloudUrl,
      soundcloudId: options?.soundcloudId,
    });
  };

  const direct = await tryDirect();
  if (direct?.healedMeta) {
    return {
      playUri: direct.url,
      fromCdn: true,
      healedMeta: direct.healedMeta,
      xHealed: direct.xHealed,
    };
  }
  if (direct?.url) {
    return { playUri: direct.url, fromCdn: true };
  }

  if (!backendBaseNoSlash) {
    console.error(
      '[playbackService] resolveYoutubeStreamForVideoId: empty backend base — proxy URL would be non-absolute',
    );
  } else if (!/^https?:\/\//i.test(proxyUrl)) {
    console.error('[playbackService] resolveYoutubeStreamForVideoId: invalid proxy URL:', proxyUrl);
  } else {
    console.log('[playbackService] YouTube using backend proxy (CDN resolve miss)', {
      videoId,
      proxyPrefix: proxyUrl.split('?')[0].slice(0, 72),
    });
  }

  return { playUri: proxyUrl, fromCdn: false };
}

/**
 * Shape useful for logging / debug parity with TrackPlayer-style payloads.
 * Internal `Track.id` may remain `ytm-*`; `videoId` is the raw YouTube id.
 */
export function trackToPlayerDebugPayload(
  track: Track,
  streamingUrl: string,
  videoId: string,
): {
  id: string;
  videoId: string;
  url: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
} {
  return {
    id: track.id,
    videoId,
    url: streamingUrl,
    title: track.title,
    artist: track.artist,
    artwork: track.artwork ?? '',
    duration: track.duration ?? 0,
  };
}

/** Local bundled fallback — `assets/8k/placeholder-artwork.png` (copy of app icon until a dedicated 8K asset ships). */
const PLACEHOLDER_ARTWORK_MODULE = require('../../../assets/8k/placeholder-artwork.png');

function getSoundcloudPlaceholderArtworkUri(): string {
  const src = Image.resolveAssetSource(PLACEHOLDER_ARTWORK_MODULE);
  return src?.uri ?? '';
}

/**
 * Maps SoundCloud API-style `artwork_url` (or mobile `artwork`) to a safe high-res HTTPS URL.
 * Null / empty / invalid URIs fall back to the bundled placeholder so native image loaders never get `null`.
 */
export function resolveSoundcloudArtworkUrl(raw?: string | null): string {
  const fallback = getSoundcloudPlaceholderArtworkUri();
  if (raw == null || typeof raw !== 'string') return fallback;
  const t = raw.trim();
  if (!t) return fallback;
  if (!/^https?:\/\//i.test(t)) return fallback;
  return t.replace('-large', '-t500x500');
}

/**
 * Strict defaults + artwork normalization before expo-av / lock-screen handoff.
 * Call at the start of `playTrack` for `source === 'soundcloud'`.
 */
export function normalizeSoundcloudTrackForPlayback(track: Track): Track {
  const title = (track.title && String(track.title).trim()) || 'Unknown Technical Track';
  const artist = (track.artist && String(track.artist).trim()) || 'Unknown Artist';
  const artwork = resolveSoundcloudArtworkUrl(track.artwork);
  const soundcloudUrl = track.soundcloudUrl?.trim();
  const soundcloudId = track.soundcloudId?.trim();
  const duration = Number.isFinite(track.duration) && track.duration >= 0 ? track.duration : 0;

  return {
    ...track,
    title,
    artist,
    artwork,
    duration,
    soundcloudUrl: soundcloudUrl || track.soundcloudUrl,
    soundcloudId: soundcloudId || track.soundcloudId,
  };
}

/** JSON-safe snapshot for `FINAL_TRACK_OBJECT` logging (expo-av — not react-native-track-player). */
export function serializeTrackForPlaybackLog(track: Track, playUri?: string): Record<string, unknown> {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    artwork: track.artwork,
    duration: track.duration,
    source: track.source,
    soundcloudUrl: track.soundcloudUrl,
    soundcloudId: track.soundcloudId,
    playUri: playUri ?? null,
  };
}

/** Classify expo-AV / NSURLError strings from SoundCloud stream failures. */
export function classifySoundcloudStreamError(message: string): '401' | '404' | 'other' {
  const m = message.toLowerCase();
  if (/\b401\b|unauthorized/.test(m)) return '401';
  if (/\b404\b|not\s*found/.test(m)) return '404';
  return 'other';
}
