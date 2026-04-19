/**
 * YouTube / YouTube Music → expo-av playback bridge.
 * Stream URLs come from the Railway resolver (CDN) with /api/youtube/audio/:id proxy fallback.
 */

import type { Track } from '@/types/music';
import {
  resolveYoutubeUrlForPlayback,
  resolveYoutubeUrlForPlaybackWithBudget,
  invalidateYoutubeResolveCache,
} from '@/lib/youtubeResolvePreloadCache';

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
};

/**
 * Resolve a playable URL: try CDN within budget, else backend progressive proxy.
 * Performs a second resolve pass (cache-busted) when the first pass misses CDN, to recover from flaky handshakes.
 */
export async function resolveYoutubeStreamForVideoId(
  videoId: string,
  backendBaseNoSlash: string,
  options?: { forceRefresh?: boolean },
): Promise<YoutubeStreamResolution> {
  const proxyUrl = `${backendBaseNoSlash}/api/youtube/audio/${videoId}`;

  if (options?.forceRefresh) {
    invalidateYoutubeResolveCache(videoId);
  }

  const tryDirect = async (): Promise<string | null> => {
    void resolveYoutubeUrlForPlayback(videoId);
    return resolveYoutubeUrlForPlaybackWithBudget(videoId, RESOLVE_BUDGET_MS);
  };

  let direct = await tryDirect();
  if (direct) {
    return { playUri: direct, fromCdn: true };
  }

  if (!options?.forceRefresh) {
    invalidateYoutubeResolveCache(videoId);
    direct = await tryDirect();
    if (direct) {
      return { playUri: direct, fromCdn: true };
    }
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
