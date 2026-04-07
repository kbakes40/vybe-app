import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'vybe-playback-settings' });

const mmkvStorage = {
  getItem: (name: string) => storage.getString(name) ?? null,
  setItem: (name: string, value: string) => storage.set(name, value),
  removeItem: (name: string) => storage.delete(name),
};

interface PlaybackSettingsState {
  crossfadeEnabled: boolean;
  crossfadeDuration: number; // seconds, 1–12

  setCrossfadeEnabled: (v: boolean) => void;
  setCrossfadeDuration: (v: number) => void;
}

export const usePlaybackSettingsStore = create<PlaybackSettingsState>()(
  persist(
    (set) => ({
      crossfadeEnabled: true,
      crossfadeDuration: 12,

      setCrossfadeEnabled: (v) => set({ crossfadeEnabled: v }),
      setCrossfadeDuration: (v) => set({ crossfadeDuration: Math.round(Math.min(12, Math.max(1, v))) }),
    }),
    {
      name: 'vybe-playback-settings',
      storage: mmkvStorage,
      version: 2,
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          return { ...persisted, crossfadeEnabled: true, crossfadeDuration: 12 };
        }
        return persisted;
      },
    }
  )
);
