import { create } from 'zustand';
import { api } from '@/lib/api/api';
import type { TasteProfile, DiscoverySection, ListeningSignal } from '@/types/discovery';

interface SignalQueue {
  signal: ListeningSignal;
  timestamp: number;
}

interface DiscoveryAlgorithmState {
  // Taste profile
  tasteProfile: TasteProfile | null;
  isProfileLoading: boolean;

  // Discovery sections
  sections: DiscoverySection[];
  isSectionsLoading: boolean;
  lastSectionsFetch: number | null;

  // Signal queue (batch uploads)
  signalQueue: SignalQueue[];
  isUploadingSignals: boolean;

  // Adaptation state
  recentSkipCount: number;
  recentCompleteCount: number;
  adaptationMode: 'normal' | 'conservative' | 'exploratory';

  // Actions
  fetchTasteProfile: () => Promise<void>;
  fetchDiscoverySections: () => Promise<void>;
  recordSignal: (signal: ListeningSignal) => void;
  flushSignalQueue: () => Promise<void>;
  hideArtist: (artistId: string, artistName: string) => Promise<void>;
  dislikeTrack: (trackId: string) => Promise<void>;
  resetProfile: () => Promise<void>;
  updateAdaptation: () => void;
}

// Debounce interval for signal uploads (5 seconds)
const SIGNAL_FLUSH_INTERVAL = 5000;

/** Strict payload for POST /api/discovery/signal (API expects safe integers). */
function listeningSignalForApi(signal: ListeningSignal): ListeningSignal {
  return {
    trackId: signal.trackId,
    signalType: signal.signalType,
    listenDuration:
      signal.listenDuration != null
        ? Math.floor(Number(signal.listenDuration))
        : undefined,
    trackDuration:
      signal.trackDuration != null
        ? Math.floor(Number(signal.trackDuration))
        : undefined,
    skipPosition:
      signal.skipPosition != null
        ? Math.floor(Number(signal.skipPosition))
        : undefined,
  };
}
// Cache duration for sections (5 minutes)
const SECTIONS_CACHE_DURATION = 5 * 60 * 1000;

let flushTimeout: ReturnType<typeof setTimeout> | null = null;

export const useDiscoveryAlgorithmStore = create<DiscoveryAlgorithmState>((set, get) => ({
  tasteProfile: null,
  isProfileLoading: false,
  sections: [],
  isSectionsLoading: false,
  lastSectionsFetch: null,
  signalQueue: [],
  isUploadingSignals: false,
  recentSkipCount: 0,
  recentCompleteCount: 0,
  adaptationMode: 'normal',

  fetchTasteProfile: async () => {
    set({ isProfileLoading: true });
    try {
      const profile = await api.get<TasteProfile>('/api/discovery/profile');
      set({ tasteProfile: profile, isProfileLoading: false });
    } catch (error) {
      console.log('[Discovery] Failed to fetch taste profile:', error);
      set({ isProfileLoading: false });
    }
  },

  fetchDiscoverySections: async () => {
    const { lastSectionsFetch, isSectionsLoading } = get();

    // Check cache
    if (lastSectionsFetch && Date.now() - lastSectionsFetch < SECTIONS_CACHE_DURATION) {
      console.log('[Discovery] Using cached sections');
      return;
    }

    if (isSectionsLoading) return;

    set({ isSectionsLoading: true });
    try {
      const sections = await api.get<DiscoverySection[]>('/api/discovery/sections');
      set({
        sections: sections || [],
        isSectionsLoading: false,
        lastSectionsFetch: Date.now(),
      });
      console.log('[Discovery] Fetched', sections?.length || 0, 'sections');
    } catch (error) {
      console.log('[Discovery] Failed to fetch sections:', error);
      set({ isSectionsLoading: false });
    }
  },

  recordSignal: (signal: ListeningSignal) => {
    const { signalQueue, updateAdaptation } = get();

    const normalized = listeningSignalForApi(signal);

    // Add to queue
    set({
      signalQueue: [...signalQueue, { signal: normalized, timestamp: Date.now() }]
    });

    // Update skip/complete counts for adaptation
    if (signal.signalType === 'skip') {
      set(state => ({ recentSkipCount: state.recentSkipCount + 1 }));
    } else if (signal.signalType === 'complete') {
      set(state => ({ recentCompleteCount: state.recentCompleteCount + 1 }));
    }

    // Update adaptation mode
    updateAdaptation();

    // Schedule flush
    if (flushTimeout) clearTimeout(flushTimeout);
    flushTimeout = setTimeout(() => {
      get().flushSignalQueue();
    }, SIGNAL_FLUSH_INTERVAL);

    console.log('[Discovery] Recorded signal:', signal.signalType, 'for track:', signal.trackId);
  },

  flushSignalQueue: async () => {
    const { signalQueue, isUploadingSignals } = get();

    if (signalQueue.length === 0 || isUploadingSignals) return;

    set({ isUploadingSignals: true });

    // Take current queue and clear it
    const toUpload = [...signalQueue];
    set({ signalQueue: [] });

    try {
      // Upload signals one by one (could batch in future)
      for (const item of toUpload) {
        await api.post('/api/discovery/signal', listeningSignalForApi(item.signal));
      }
      console.log('[Discovery] Flushed', toUpload.length, 'signals');
    } catch (error) {
      console.log('[Discovery] Failed to upload signals:', error);
      // Re-add failed signals to queue
      set(state => ({
        signalQueue: [...toUpload, ...state.signalQueue]
      }));
    } finally {
      set({ isUploadingSignals: false });
    }
  },

  hideArtist: async (artistId: string, artistName: string) => {
    try {
      await api.post('/api/discovery/hide-artist', { artistId, artistName });
      // Refresh sections to remove hidden artist
      set({ lastSectionsFetch: null });
      get().fetchDiscoverySections();
      console.log('[Discovery] Hidden artist:', artistName);
    } catch (error) {
      console.log('[Discovery] Failed to hide artist:', error);
    }
  },

  dislikeTrack: async (trackId: string) => {
    try {
      await api.post('/api/discovery/dislike', { trackId });
      // Remove from current sections
      set(state => ({
        sections: state.sections.map(section => ({
          ...section,
          tracks: section.tracks.filter(t => t.id !== trackId),
        })),
      }));
      console.log('[Discovery] Disliked track:', trackId);
    } catch (error) {
      console.log('[Discovery] Failed to dislike track:', error);
    }
  },

  resetProfile: async () => {
    try {
      await api.delete('/api/discovery/profile');
      set({
        tasteProfile: null,
        sections: [],
        lastSectionsFetch: null,
        recentSkipCount: 0,
        recentCompleteCount: 0,
        adaptationMode: 'normal',
      });
      console.log('[Discovery] Reset taste profile');
    } catch (error) {
      console.log('[Discovery] Failed to reset profile:', error);
    }
  },

  updateAdaptation: () => {
    const { recentSkipCount, recentCompleteCount } = get();

    // Reset counts after 10 tracks
    const totalRecent = recentSkipCount + recentCompleteCount;
    if (totalRecent >= 10) {
      const skipRate = recentSkipCount / totalRecent;

      let newMode: 'normal' | 'conservative' | 'exploratory' = 'normal';

      if (skipRate > 0.5) {
        // User is skipping a lot - go conservative
        newMode = 'conservative';
        console.log('[Discovery] Switching to conservative mode (high skip rate)');
      } else if (skipRate < 0.2 && recentCompleteCount >= 5) {
        // User is completing tracks - can explore more
        newMode = 'exploratory';
        console.log('[Discovery] Switching to exploratory mode (high completion rate)');
      }

      set({
        adaptationMode: newMode,
        recentSkipCount: 0,
        recentCompleteCount: 0,
      });
    }
  },
}));
