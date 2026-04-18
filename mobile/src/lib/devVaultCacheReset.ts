import { clearCuratedPlaylistWarmSession } from '@/lib/curatedPlaylistWarmup';
import { clearAllYoutubeResolveCaches } from '@/lib/youtubeResolvePreloadCache';
import { usePrefetchStore, cancelNativePrefetchQueue } from '@/stores/prefetchStore';
import { useDiscoverFeedStore } from '@/stores/discoverFeedStore';
import { useSoundCloudPreloadStore } from '@/stores/soundcloudPreloadStore';

/**
 * Best-effort warm-cache purge for the secret dev console. Does not wipe user playlists or downloads.
 */
export function resetDevPlaybackCaches(): void {
  clearAllYoutubeResolveCaches();
  clearCuratedPlaylistWarmSession();
  usePrefetchStore.getState().clearAll();
  try {
    cancelNativePrefetchQueue();
  } catch {
    /* noop */
  }
  useDiscoverFeedStore.getState().clearCache();
  useSoundCloudPreloadStore.getState().clearAll();
}
