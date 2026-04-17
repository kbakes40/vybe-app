import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import { Track } from '@/types/music';

const storage = new MMKV({ id: 'vybe-liked-songs' });
const mmkvStorage = {
  getItem: (name: string) => {
    const v = storage.getString(name);
    return v ?? null;
  },
  setItem: (name: string, value: string) => storage.set(name, value),
  removeItem: (name: string) => storage.delete(name),
};

interface LikedSongsState {
  likedSongs: Track[];
  toggle: (track: Track) => void;
  remove: (trackId: string) => void;
  isLiked: (trackId: string) => boolean;
}

export const useLikedSongsStore = create<LikedSongsState>()(
  persist(
    (set, get) => ({
      likedSongs: [],

      toggle: (track) =>
        set((state) => {
          const idx = state.likedSongs.findIndex((t) => t.id === track.id);
          if (idx >= 0) {
            return { likedSongs: state.likedSongs.filter((t) => t.id !== track.id) };
          }
          return { likedSongs: [track, ...state.likedSongs] };
        }),

      remove: (trackId) =>
        set((state) => ({
          likedSongs: state.likedSongs.filter((t) => t.id !== trackId),
        })),

      isLiked: (trackId) => get().likedSongs.some((t) => t.id === trackId),
    }),
    {
      name: 'vybe-liked-songs',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
