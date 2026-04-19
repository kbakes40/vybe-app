import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DEFAULT_ACCENT_HEX, normalizeAccentHex } from '@/lib/themeColorUtils';
import { updateNativeThemeAccent } from '@/lib/NowPlayingActivityManager';

const STORAGE_KEY = 'vybe_theme_accent_hex';
const SYNC_ARTWORK_KEY = 'vybe_theme_sync_artwork';

export const THEME_COLOR_PRESETS = [
  { id: 'cyan', label: 'Cyan', hex: '#00FFFF' as const },
  { id: 'lava', label: 'Lava Red', hex: '#FF2D55' as const },
  { id: 'toxic', label: 'Toxic Green', hex: '#39FF14' as const },
  { id: 'royal', label: 'Royal Purple', hex: '#A855F7' as const },
] as const;

type ThemeState = {
  accentColor: string;
  /** When true, `ThemeArtworkAccentSync` drives accent from the current track artwork. */
  syncToArtwork: boolean;
  hydrated: boolean;
  hydrateTheme: () => Promise<void>;
  setAccentColor: (hex: string) => void;
  setSyncToArtwork: (on: boolean) => void;
};

export const useThemeStore = create<ThemeState>((set, get) => ({
  accentColor: DEFAULT_ACCENT_HEX,
  syncToArtwork: false,
  hydrated: false,

  hydrateTheme: async () => {
    try {
      const [rawAccent, rawSync] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(SYNC_ARTWORK_KEY),
      ]);
      const nextAccent = rawAccent ? normalizeAccentHex(rawAccent) : null;
      const syncOn = rawSync === '1' || rawSync === 'true';
      if (nextAccent) {
        set({ accentColor: nextAccent, syncToArtwork: syncOn, hydrated: true });
        updateNativeThemeAccent(nextAccent);
      } else {
        set({ syncToArtwork: syncOn, hydrated: true });
        updateNativeThemeAccent(get().accentColor);
      }
    } catch {
      set({ hydrated: true });
    }
  },

  setAccentColor: (hex: string) => {
    const n = normalizeAccentHex(hex);
    if (!n) return;
    set({ accentColor: n });
    void AsyncStorage.setItem(STORAGE_KEY, n);
    updateNativeThemeAccent(n);
  },

  setSyncToArtwork: (on: boolean) => {
    set({ syncToArtwork: on });
    void AsyncStorage.setItem(SYNC_ARTWORK_KEY, on ? '1' : '0');
  },
}));
