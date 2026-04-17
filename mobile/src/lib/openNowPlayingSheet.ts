import { router } from 'expo-router';
import { useNowPlayingSheetStore } from '@/stores/nowPlayingSheetStore';

/** Prefer the bottom sheet when mounted; otherwise navigate to the Now Playing route. */
export function openNowPlayingSheet(): void {
  const expand = useNowPlayingSheetStore.getState().expand;
  if (expand) {
    expand();
    return;
  }
  router.push('/(app)/nowPlaying' as never);
}
