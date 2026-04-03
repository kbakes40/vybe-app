import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/lib/api/api';
import { Track } from '@/types/music';
import { tracks as mockTracks } from '@/data/mockData';

export interface BeatMatchSettings {
  moodLevel: number; // 0-1: chill to hype
  tempoLevel: number; // 0-1: slow to fast
  discoveryLevel: number; // 0-1: safe to adventurous
}

interface BeatMatchRadioState {
  queue: Track[];
  queuePosition: number;
  seedTracks: Track[];
  settings: BeatMatchSettings;
  isLoading: boolean;
  isPlaying: boolean;
  lastFetchTime: number | null;

  // Actions
  startRadio: () => Promise<void>;
  generateMoreTracks: () => Promise<void>;
  skipTrack: () => void;
  previousTrack: () => void;
  updateSettings: (settings: Partial<BeatMatchSettings>) => void;
  saveState: () => Promise<void>;
  loadState: () => Promise<void>;
  resetStation: () => void;
  setQueuePosition: (position: number) => void;
}

// Generate mock queue based on settings
const generateMockQueue = (settings: BeatMatchSettings, count: number): Track[] => {
  // Shuffle and select tracks based on settings
  const shuffled = [...mockTracks].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));

  // Add match reasons based on settings
  return selected.map(track => ({
    ...track,
    // Extend with match reason as a computed property for display
  }));
};

// Get seed tracks (user's favorites or recently played)
const getMockSeedTracks = (): Track[] => {
  const likedTracks = mockTracks.filter(t => t.isLiked);
  return likedTracks.slice(0, 5);
};

export const useBeatMatchRadioStore = create<BeatMatchRadioState>()(
  persist(
    (set, get) => ({
      queue: [],
      queuePosition: 0,
      seedTracks: [],
      settings: {
        moodLevel: 0.5,
        tempoLevel: 0.5,
        discoveryLevel: 0.3,
      },
      isLoading: false,
      isPlaying: false,
      lastFetchTime: null,

      startRadio: async () => {
        set({ isLoading: true });
        try {
          // Try to fetch from backend first
          const response = await api.post<{
            queue: Track[];
            seedTracks: Track[];
            settings: BeatMatchSettings;
          }>('/api/discovery/beat-match-radio/queue', {
            settings: get().settings,
            count: 50,
          });

          if (response?.queue && response.queue.length > 0) {
            set({
              queue: response.queue,
              seedTracks: response.seedTracks || [],
              queuePosition: 0,
              isPlaying: true,
              lastFetchTime: Date.now(),
              isLoading: false,
            });
            return;
          }
        } catch (error) {
          console.log('[BeatMatchRadio] Backend unavailable, using mock data:', error);
        }

        // Fallback to mock data
        const mockQueue = generateMockQueue(get().settings, 50);
        const mockSeedTracks = getMockSeedTracks();

        set({
          queue: mockQueue,
          seedTracks: mockSeedTracks,
          queuePosition: 0,
          isPlaying: true,
          lastFetchTime: Date.now(),
          isLoading: false,
        });
      },

      generateMoreTracks: async () => {
        const { queue, queuePosition, settings } = get();

        // Generate more when nearing end of queue
        if (queue.length - queuePosition > 10) return;

        try {
          const response = await api.post<{
            queue: Track[];
            seedTracks: Track[];
          }>('/api/discovery/beat-match-radio/queue', {
            settings,
            count: 30,
          });

          if (response?.queue && response.queue.length > 0) {
            set(state => ({
              queue: [...state.queue, ...response.queue],
            }));
            return;
          }
        } catch (error) {
          console.log('[BeatMatchRadio] Failed to generate more, using mock:', error);
        }

        // Fallback to mock data
        const moreTracksMock = generateMockQueue(settings, 30);
        set(state => ({
          queue: [...state.queue, ...moreTracksMock],
        }));
      },

      skipTrack: () => {
        const { queue, queuePosition, generateMoreTracks } = get();
        if (queuePosition < queue.length - 1) {
          set({ queuePosition: queuePosition + 1 });
          // Check if we need more tracks
          generateMoreTracks();
        }
      },

      previousTrack: () => {
        const { queuePosition } = get();
        if (queuePosition > 0) {
          set({ queuePosition: queuePosition - 1 });
        }
      },

      updateSettings: (newSettings) => {
        set(state => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      saveState: async () => {
        const { queuePosition, settings } = get();
        try {
          await api.post('/api/discovery/beat-match-radio/state', {
            queuePosition,
            settings,
          });
        } catch (error) {
          console.log('[BeatMatchRadio] Failed to save state:', error);
        }
      },

      loadState: async () => {
        try {
          const state = await api.get<{
            queuePosition: number;
            settings: BeatMatchSettings;
          } | null>('/api/discovery/beat-match-radio/state');

          if (state) {
            set({
              queuePosition: state.queuePosition,
              settings: state.settings,
            });
          }
        } catch (error) {
          console.log('[BeatMatchRadio] Failed to load state:', error);
        }
      },

      resetStation: () => {
        set({
          queue: [],
          queuePosition: 0,
          settings: {
            moodLevel: 0.5,
            tempoLevel: 0.5,
            discoveryLevel: 0.3,
          },
          isPlaying: false,
          lastFetchTime: null,
        });
      },

      setQueuePosition: (position: number) => {
        set({ queuePosition: position });
      },
    }),
    {
      name: 'beat-match-radio-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        settings: state.settings,
        queuePosition: state.queuePosition,
      }),
    }
  )
);
