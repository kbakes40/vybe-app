import { useCallback, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  cancelNativePrefetchQueue,
  ensurePrefetchListeners,
  queueYoutubeAudioPrefetch,
} from '@/stores/prefetchStore';
import type { Track } from '@/types/music';

/**
 * Clears the native prefetch queue when the current screen loses focus
 * (e.g. user leaves Search / Discover tabs).
 *
 * Uses React Navigation focus/blur listeners instead of `expo-router`'s
 * `useFocusEffect` fork — that fork has been associated with Hermes
 * `TypeError: _b.call is not a function` when optional navigation isn't ready.
 */
export function useCancelPrefetchOnBlur(): void {
  const navigation = useNavigation();

  useEffect(() => {
    const onFocus = () => {
      ensurePrefetchListeners();
    };
    const onBlur = () => {
      cancelNativePrefetchQueue();
    };

    if (navigation.isFocused()) {
      onFocus();
    }

    const unsubFocus = navigation.addListener('focus', onFocus);
    const unsubBlur = navigation.addListener('blur', onBlur);

    return () => {
      unsubFocus();
      unsubBlur();
      cancelNativePrefetchQueue();
    };
  }, [navigation]);
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
