import { create } from 'zustand';
import { Image } from 'react-native';

/**
 * SoundCloud Preload Store
 *
 * Manages preloading of SoundCloud track metadata and embed URLs
 * to minimize playback start latency.
 *
 * Optimization layers:
 * A) Link resolution caching - cache canonical URLs and embed URLs
 * B) WebView warm state tracking
 * C) Artwork prefetching for instant display
 */

interface PreloadedTrack {
  trackId: string;
  soundcloudUrl: string;
  embedUrl: string;
  artwork: string;
  title: string;
  artist: string;
  duration: number;
  preloadedAt: number;
  artworkPrefetched: boolean;
}

interface SoundCloudPreloadState {
  // Preloaded track data keyed by track ID
  preloadedTracks: Map<string, PreloadedTrack>;

  // Track IDs currently being preloaded
  preloadingIds: Set<string>;

  // Whether a warm WebView is ready
  warmWebViewReady: boolean;

  // Current track loaded in the warm WebView (for reuse)
  warmWebViewTrackId: string | null;

  // Cache TTL in ms (10 minutes for better reuse)
  cacheTtl: number;

  // Actions
  preloadTrack: (trackId: string, soundcloudUrl: string, metadata: {
    artwork: string;
    title: string;
    artist: string;
    duration: number;
  }) => void;

  preloadBatch: (tracks: Array<{
    id: string;
    soundcloudUrl: string;
    artwork: string;
    title: string;
    artist: string;
    duration: number;
  }>) => void;

  prefetchNextBatch: (tracks: Array<{
    id: string;
    soundcloudUrl?: string;
    artwork: string;
    title: string;
    artist: string;
    duration: number;
  }>, startIndex: number) => void;

  getPreloadedTrack: (trackId: string) => PreloadedTrack | null;

  getEmbedUrl: (trackId: string) => string | null;

  isPreloaded: (trackId: string) => boolean;

  isPreloading: (trackId: string) => boolean;

  setWarmWebViewReady: (ready: boolean) => void;

  setWarmWebViewTrackId: (trackId: string | null) => void;

  clearExpiredCache: () => void;

  clearAll: () => void;
}

// Build embed URL from SoundCloud track URL
const buildEmbedUrl = (soundcloudUrl: string): string => {
  const encodedUrl = encodeURIComponent(soundcloudUrl);
  return `https://w.soundcloud.com/player/?url=${encodedUrl}&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=true&color=%23FF5500`;
};

// Prefetch artwork image
const prefetchArtwork = (uri: string): void => {
  try {
    Image.prefetch(uri);
  } catch {
    // Ignore prefetch errors
  }
};

export const useSoundCloudPreloadStore = create<SoundCloudPreloadState>((set, get) => ({
  preloadedTracks: new Map(),
  preloadingIds: new Set(),
  warmWebViewReady: false,
  warmWebViewTrackId: null,
  cacheTtl: 10 * 60 * 1000, // 10 minutes for better reuse

  preloadTrack: (trackId, soundcloudUrl, metadata) => {
    const { preloadedTracks, preloadingIds, cacheTtl } = get();

    // Skip if already preloaded and not expired
    const existing = preloadedTracks.get(trackId);
    if (existing && Date.now() - existing.preloadedAt < cacheTtl) {
      return;
    }

    // Skip if already preloading
    if (preloadingIds.has(trackId)) {
      return;
    }

    // Validate URL - must be canonical soundcloud.com URL
    try {
      const parsed = new URL(soundcloudUrl);
      if (parsed.hostname !== 'soundcloud.com' && parsed.hostname !== 'www.soundcloud.com') {
        console.log('[SoundCloud Preload] Skipping non-canonical URL:', soundcloudUrl);
        return;
      }
    } catch {
      return;
    }

    console.log('[SoundCloud Preload] Preloading track:', trackId);

    // Mark as preloading
    const newPreloadingIds = new Set(preloadingIds);
    newPreloadingIds.add(trackId);
    set({ preloadingIds: newPreloadingIds });

    // Build embed URL (synchronous)
    const embedUrl = buildEmbedUrl(soundcloudUrl);

    // Prefetch artwork for instant display
    prefetchArtwork(metadata.artwork);

    // Store preloaded data
    const preloadedTrack: PreloadedTrack = {
      trackId,
      soundcloudUrl,
      embedUrl,
      artwork: metadata.artwork,
      title: metadata.title,
      artist: metadata.artist,
      duration: metadata.duration,
      preloadedAt: Date.now(),
      artworkPrefetched: true,
    };

    const newPreloadedTracks = new Map(get().preloadedTracks);
    newPreloadedTracks.set(trackId, preloadedTrack);

    const updatedPreloadingIds = new Set(get().preloadingIds);
    updatedPreloadingIds.delete(trackId);

    set({
      preloadedTracks: newPreloadedTracks,
      preloadingIds: updatedPreloadingIds,
    });

    console.log('[SoundCloud Preload] Track preloaded:', trackId, 'embed:', embedUrl.substring(0, 80) + '...');
  },

  preloadBatch: (tracks) => {
    const { preloadTrack } = get();

    // Preload first 10 SoundCloud tracks
    const soundcloudTracks = tracks
      .filter(t => t.soundcloudUrl)
      .slice(0, 10);

    console.log('[SoundCloud Preload] Batch preloading', soundcloudTracks.length, 'tracks');

    for (const track of soundcloudTracks) {
      preloadTrack(track.id, track.soundcloudUrl, {
        artwork: track.artwork,
        title: track.title,
        artist: track.artist,
        duration: track.duration,
      });
    }
  },

  prefetchNextBatch: (tracks, startIndex) => {
    const { preloadTrack } = get();

    // Prefetch next 5 tracks from the given index
    const nextTracks = tracks
      .slice(startIndex, startIndex + 5)
      .filter(t => t.soundcloudUrl);

    if (nextTracks.length > 0) {
      console.log('[SoundCloud Preload] Lazy prefetching', nextTracks.length, 'tracks from index', startIndex);

      for (const track of nextTracks) {
        if (track.soundcloudUrl) {
          preloadTrack(track.id, track.soundcloudUrl, {
            artwork: track.artwork,
            title: track.title,
            artist: track.artist,
            duration: track.duration,
          });
        }
      }
    }
  },

  getPreloadedTrack: (trackId) => {
    const { preloadedTracks, cacheTtl } = get();
    const track = preloadedTracks.get(trackId);

    if (!track) {
      return null;
    }

    // Check if expired
    if (Date.now() - track.preloadedAt > cacheTtl) {
      // Remove expired entry
      const newPreloadedTracks = new Map(preloadedTracks);
      newPreloadedTracks.delete(trackId);
      set({ preloadedTracks: newPreloadedTracks });
      return null;
    }

    return track;
  },

  getEmbedUrl: (trackId) => {
    const track = get().getPreloadedTrack(trackId);
    return track?.embedUrl ?? null;
  },

  isPreloaded: (trackId) => {
    return get().getPreloadedTrack(trackId) !== null;
  },

  isPreloading: (trackId) => {
    return get().preloadingIds.has(trackId);
  },

  setWarmWebViewReady: (ready) => {
    console.log('[SoundCloud Preload] Warm WebView ready:', ready);
    set({ warmWebViewReady: ready });
  },

  setWarmWebViewTrackId: (trackId) => {
    set({ warmWebViewTrackId: trackId });
  },

  clearExpiredCache: () => {
    const { preloadedTracks, cacheTtl } = get();
    const now = Date.now();
    const newPreloadedTracks = new Map<string, PreloadedTrack>();

    preloadedTracks.forEach((track, id) => {
      if (now - track.preloadedAt < cacheTtl) {
        newPreloadedTracks.set(id, track);
      }
    });

    if (newPreloadedTracks.size !== preloadedTracks.size) {
      console.log('[SoundCloud Preload] Cleared', preloadedTracks.size - newPreloadedTracks.size, 'expired entries');
      set({ preloadedTracks: newPreloadedTracks });
    }
  },

  clearAll: () => {
    console.log('[SoundCloud Preload] Clearing all cache');
    set({
      preloadedTracks: new Map(),
      preloadingIds: new Set(),
      warmWebViewTrackId: null,
    });
  },
}));
