import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  cancelNativePrefetchQueue,
  ensurePrefetchListeners,
  queueYoutubeAudioPrefetch,
} from '@/stores/prefetchStore';
import type { Track } from '@/types/music';

/**
 * Clears the native prefetch queue when the current screen loses focus
 * (e.g. user leaves Search / Discover tabs).
 */
export function useCancelPrefetchOnBlur(): void {
  useFocusEffect(
    useCallback(() => {
      ensurePrefetchListeners();
      return () => {
        cancelNativePrefetchQueue();
      };
    }, []),
  );
}

export function usePrefetch(): {
  prefetchCategoryTracks: (tracks: Track[]) => void;
  cancelPrefetch: () => void;
} {
  ensurePrefetchListeners();

  const prefetchCategoryTracks = useCallback((tracks: Track[]) => {
    void queueYoutubeAudioPrefetch(tracks);
  }, []);

  const cancelPrefetch = useCallback(() => {
    cancelNativePrefetchQueue();
  }, []);

  return { prefetchCategoryTracks, cancelPrefetch };
}
