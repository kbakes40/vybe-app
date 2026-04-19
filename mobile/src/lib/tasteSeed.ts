import { tracks } from '@/data/mockData';
import type { Track } from '@/types/music';
import { usePlaybackController } from '@/stores/playbackController';
import { useRecentsStore } from '@/stores/recentsStore';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';

/**
 * Resolve liked track IDs to full `Track` rows from recents, downloads, discovery, and static catalog.
 */
export function getTasteSeedTracks(): Track[] {
  const liked = usePlaybackController.getState().likedTracks;
  if (liked.size === 0) return [];

  const recent = useRecentsStore.getState().recentTracks;
  const downloads = useDownloadsStore.getState().downloads;
  const discovered = useDiscoveryStore.getState().discoveredTracks;
  const pools: Track[][] = [recent, downloads, discovered, tracks as Track[]];

  const byId = new Map<string, Track>();
  for (const pool of pools) {
    for (const t of pool) {
      if (liked.has(t.id)) byId.set(t.id, t);
    }
  }
  return Array.from(byId.values());
}
