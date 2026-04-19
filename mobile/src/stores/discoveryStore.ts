import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track, RelatedTrack } from '@/types/music';
import { api } from '@/lib/api/api';
import { raceWithDiscoverTimeout, isDiscoverBackendFailure } from '@/lib/discoverRace';

export interface SeedTrack {
  id: string;
  title: string;
  artist: string;
  tags: string[];
  addedAt: number;
  playCount: number;
  isLiked: boolean;
}

export interface DiscoveredTrack extends Track {
  discoveredAt: number;
  sourceTrackId: string; // The seed track that led to this discovery
  isNew: boolean; // Show as "new" in UI
}

interface DiscoverResponse {
  tracks: RelatedTrack[];
  basedOnTags: string[];
}

interface DiscoveryState {
  // Seed tracks that drive discovery
  seedTracks: SeedTrack[];

  // Discovered tracks pool
  discoveredTracks: DiscoveredTrack[];

  // Tracks already shown to user (for deduping)
  seenTrackIds: Set<string>;

  // Catalog of imported track IDs (to avoid re-importing)
  importedTrackIds: Set<string>;

  // Last refresh timestamp
  lastRefreshAt: number | null;

  // Settings
  autoRefreshEnabled: boolean;

  // Loading state
  isRefreshing: boolean;

  // Actions
  addSeedTrack: (track: Track, tags?: string[]) => void;
  removeSeedTrack: (trackId: string) => void;
  incrementPlayCount: (trackId: string) => void;
  toggleSeedLiked: (trackId: string) => void;

  addDiscoveredTracks: (tracks: DiscoveredTrack[]) => void;
  markTrackAsSeen: (trackId: string) => void;
  markTrackAsImported: (trackId: string) => void;

  refreshDiscovery: () => Promise<void>;
  clearDiscoveryCache: () => void;

  setAutoRefreshEnabled: (enabled: boolean) => void;

  // Getters
  getFreshFinds: () => DiscoveredTrack[];
  getMoreLikeThis: (trackId: string) => DiscoveredTrack[];
  getNewTracksCount: () => number;
}

// Diversity rules
const MAX_TRACKS_PER_ARTIST = 2;
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

export const useDiscoveryStore = create<DiscoveryState>()(
  persist(
    (set, get) => ({
      seedTracks: [],
      discoveredTracks: [],
      seenTrackIds: new Set(),
      importedTrackIds: new Set(),
      lastRefreshAt: null,
      autoRefreshEnabled: true,
      isRefreshing: false,

      addSeedTrack: (track, tags = []) => {
        set((state) => {
          // Don't add duplicates
          if (state.seedTracks.some(s => s.id === track.id)) {
            return state;
          }

          const seedTrack: SeedTrack = {
            id: track.id,
            title: track.title,
            artist: track.artist,
            tags: tags.length > 0 ? tags : (track.tags || []),
            addedAt: Date.now(),
            playCount: 1,
            isLiked: false,
          };

          return {
            seedTracks: [...state.seedTracks, seedTrack],
          };
        });
      },

      removeSeedTrack: (trackId) => {
        set((state) => ({
          seedTracks: state.seedTracks.filter(s => s.id !== trackId),
        }));
      },

      incrementPlayCount: (trackId) => {
        set((state) => ({
          seedTracks: state.seedTracks.map(s =>
            s.id === trackId ? { ...s, playCount: s.playCount + 1 } : s
          ),
        }));
      },

      toggleSeedLiked: (trackId) => {
        set((state) => ({
          seedTracks: state.seedTracks.map(s =>
            s.id === trackId ? { ...s, isLiked: !s.isLiked } : s
          ),
        }));
      },

      addDiscoveredTracks: (tracks) => {
        set((state) => {
          const existingIds = new Set(state.discoveredTracks.map(t => t.id));
          const importedIds = state.importedTrackIds;

          // Filter out duplicates and already imported
          const newTracks = tracks.filter(t =>
            !existingIds.has(t.id) && !importedIds.has(t.id)
          );

          // Apply diversity rules - limit tracks per artist
          const artistCounts: Record<string, number> = {};
          state.discoveredTracks.forEach(t => {
            artistCounts[t.artist] = (artistCounts[t.artist] || 0) + 1;
          });

          const diverseTracks = newTracks.filter(t => {
            const count = artistCounts[t.artist] || 0;
            if (count >= MAX_TRACKS_PER_ARTIST) return false;
            artistCounts[t.artist] = count + 1;
            return true;
          });

          const merged = [...diverseTracks, ...state.discoveredTracks];

          return { discoveredTracks: merged };
        });
      },

      markTrackAsSeen: (trackId) => {
        set((state) => {
          const newSeen = new Set(state.seenTrackIds);
          newSeen.add(trackId);
          return {
            seenTrackIds: newSeen,
            discoveredTracks: state.discoveredTracks.map(t =>
              t.id === trackId ? { ...t, isNew: false } : t
            ),
          };
        });
      },

      markTrackAsImported: (trackId) => {
        set((state) => {
          const newImported = new Set(state.importedTrackIds);
          newImported.add(trackId);
          return { importedTrackIds: newImported };
        });
      },

      refreshDiscovery: async () => {
        const state = get();

        // Check cooldown
        if (state.lastRefreshAt && Date.now() - state.lastRefreshAt < REFRESH_COOLDOWN_MS) {
          console.log('Discovery refresh on cooldown');
          return;
        }

        if (state.isRefreshing) return;
        if (state.seedTracks.length === 0) return;

        const discoveredSnapshot = state.discoveredTracks;

        set({ isRefreshing: true });

        try {
          // Get top seed tracks by play count and recency
          const topSeeds = [...state.seedTracks].sort((a, b) => {
            const scoreA = a.playCount + (a.isLiked ? 5 : 0);
            const scoreB = b.playCount + (b.isLiked ? 5 : 0);
            return scoreB - scoreA;
          });

          // Collect all tags from top seeds
          const allTags = Array.from(new Set(topSeeds.flatMap(s => s.tags)));

          // Get existing track IDs to exclude
          const excludeIds = [
            ...state.discoveredTracks.map(t => t.id),
            ...Array.from(state.importedTrackIds),
          ];

          // Fetch new discoveries
          const response = await raceWithDiscoverTimeout(
            api.post<DiscoverResponse>('/api/soundcloud/discover', {
              seedTrackIds: topSeeds.map(s => s.id),
              tags: allTags,
              excludeIds,
              limit: 20,
            }),
          );

          if (response?.tracks && response.tracks.length > 0) {
            const discovered: DiscoveredTrack[] = response.tracks.map(t => ({
              ...t,
              discoveredAt: Date.now(),
              sourceTrackId: topSeeds[0]?.id || '',
              isNew: true,
            }));

            get().addDiscoveredTracks(discovered);
          }

          set({ lastRefreshAt: Date.now() });
        } catch (error) {
          console.error('Discovery refresh failed:', error);
          if (isDiscoverBackendFailure(error) && discoveredSnapshot.length > 0) {
            set({ discoveredTracks: discoveredSnapshot });
          }
        } finally {
          set({ isRefreshing: false });
        }
      },

      clearDiscoveryCache: () => {
        set({
          discoveredTracks: [],
          seenTrackIds: new Set(),
          lastRefreshAt: null,
        });
      },

      setAutoRefreshEnabled: (enabled) => {
        set({ autoRefreshEnabled: enabled });
      },

      getFreshFinds: () => {
        const state = get();
        return state.discoveredTracks.filter(t => t.isNew);
      },

      getMoreLikeThis: (trackId) => {
        const state = get();
        return state.discoveredTracks.filter(t => t.sourceTrackId === trackId);
      },

      getNewTracksCount: () => {
        return get().discoveredTracks.filter(t => t.isNew).length;
      },
    }),
    {
      name: 'vybe-discovery',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        seedTracks: state.seedTracks,
        discoveredTracks: state.discoveredTracks,
        seenTrackIds: Array.from(state.seenTrackIds),
        importedTrackIds: Array.from(state.importedTrackIds),
        lastRefreshAt: state.lastRefreshAt,
        autoRefreshEnabled: state.autoRefreshEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert arrays back to Sets after rehydration
          state.seenTrackIds = new Set(state.seenTrackIds as unknown as string[]);
          state.importedTrackIds = new Set(state.importedTrackIds as unknown as string[]);
        }
      },
    }
  )
);

/** Discover tab feed sections — 5s race + cached fallback live in `discoverFeedStore`. */
export { fetchSections } from './discoverFeedStore';

/**
 * Runs the home “mix rails” pipeline under a 5s cap. Caller supplies the async
 * body (Home tab); on timeout/reject the caller should re-hydrate from MMKV.
 */
export async function fetchMixes(runPipeline: () => Promise<void>): Promise<void> {
  await raceWithDiscoverTimeout(runPipeline());
}

export { isDiscoverBackendFailure, raceWithDiscoverTimeout } from '@/lib/discoverRace';
