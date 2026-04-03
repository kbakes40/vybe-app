import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Track } from '@/types/music';

const MAX_RECENTS = 50;

interface RecentsState {
  recentTracks: Track[];

  // Actions
  addToRecents: (track: Track) => void;
  removeFromRecents: (trackId: string) => void;
  clearRecents: () => void;
  getRecents: (limit?: number) => Track[];
}

export const useRecentsStore = create<RecentsState>()(
  persist(
    (set, get) => ({
      recentTracks: [],

      addToRecents: (track: Track) => {
        set((state) => {
          // Remove if already exists (to move to front)
          const filtered = state.recentTracks.filter(t => t.id !== track.id);
          // Add to front, limit to MAX_RECENTS
          const updated = [track, ...filtered].slice(0, MAX_RECENTS);
          return { recentTracks: updated };
        });
      },

      removeFromRecents: (trackId: string) => {
        set((state) => ({
          recentTracks: state.recentTracks.filter(t => t.id !== trackId),
        }));
      },

      clearRecents: () => {
        set({ recentTracks: [] });
      },

      getRecents: (limit = 20) => {
        return get().recentTracks.slice(0, limit);
      },
    }),
    {
      name: 'vybe-recents',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ recentTracks: state.recentTracks }),
    }
  )
);
