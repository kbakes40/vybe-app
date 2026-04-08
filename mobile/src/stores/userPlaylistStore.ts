import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import { Track } from '@/types/music';

const storage = new MMKV({ id: 'vybe-user-playlists' });
const mmkvStorage = {
  getItem: (name: string) => storage.getString(name) ?? null,
  setItem: (name: string, value: string) => storage.set(name, value),
  removeItem: (name: string) => storage.delete(name),
};

export interface UserPlaylist {
  id: string;
  name: string;
  tracks: Track[];
  createdAt: number;
  artwork?: string; // first track's artwork
}

interface UserPlaylistState {
  playlists: UserPlaylist[];
  createPlaylist: (name: string, tracks: Track[], id?: string) => void;
  deletePlaylist: (id: string) => void;
  addTracksToPlaylist: (id: string, tracks: Track[]) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
}

export const useUserPlaylistStore = create<UserPlaylistState>()(
  persist(
    (set) => ({
      playlists: [],

      createPlaylist: (name, tracks, id) =>
        set((state) => ({
          playlists: [
            ...state.playlists,
            {
              id: id ?? `pl-${Date.now()}`,
              name,
              tracks,
              createdAt: Date.now(),
              artwork: tracks[0]?.artwork,
            },
          ],
        })),

      deletePlaylist: (id) =>
        set((state) => ({
          playlists: state.playlists.filter((p) => p.id !== id),
        })),

      addTracksToPlaylist: (id, newTracks) =>
        set((state) => ({
          playlists: state.playlists.map((p) => {
            if (p.id !== id) return p;
            const existingIds = new Set(p.tracks.map((t) => t.id));
            const added = newTracks.filter((t) => !existingIds.has(t.id));
            return { ...p, tracks: [...p.tracks, ...added] };
          }),
        })),

      removeTrackFromPlaylist: (playlistId, trackId) =>
        set((state) => ({
          playlists: state.playlists.map((p) =>
            p.id === playlistId
              ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) }
              : p
          ),
        })),
    }),
    {
      name: 'vybe-user-playlists',
      storage: mmkvStorage,
    }
  )
);
