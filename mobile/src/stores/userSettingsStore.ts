import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'vybe-user-settings-v2' });
const mmkvStorage = {
  getItem: (name: string) => storage.getString(name) ?? null,
  setItem: (name: string, value: string) => storage.set(name, value),
  removeItem: (name: string) => storage.delete(name),
};

interface UserSettingsState {
  // Playback
  gapless: boolean;
  normalizeVolume: boolean;
  autoplay: boolean;
  audioQuality: 'Low' | 'Normal' | 'High';

  // Data
  dataSaver: boolean;
  cellularStreamingQuality: 'Low' | 'Normal' | 'High';
  downloadCellular: boolean;
  downloadQuality: 'Low' | 'Normal' | 'High';

  // Notifications
  newMusicNotifications: boolean;
  productAnnouncements: boolean;

  // Privacy
  privateSession: boolean;
  listeningActivity: boolean;

  // Content
  explicitContent: boolean;

  setGapless: (v: boolean) => void;
  setNormalizeVolume: (v: boolean) => void;
  setAutoplay: (v: boolean) => void;
  setAudioQuality: (v: 'Low' | 'Normal' | 'High') => void;
  setDataSaver: (v: boolean) => void;
  setCellularStreamingQuality: (v: 'Low' | 'Normal' | 'High') => void;
  setDownloadCellular: (v: boolean) => void;
  setDownloadQuality: (v: 'Low' | 'Normal' | 'High') => void;
  setNewMusicNotifications: (v: boolean) => void;
  setProductAnnouncements: (v: boolean) => void;
  setPrivateSession: (v: boolean) => void;
  setListeningActivity: (v: boolean) => void;
  setExplicitContent: (v: boolean) => void;
}

export const useUserSettingsStore = create<UserSettingsState>()(
  persist(
    (set) => ({
      gapless: true,
      normalizeVolume: true,
      autoplay: true,
      audioQuality: 'High',
      dataSaver: false,
      cellularStreamingQuality: 'Normal',
      downloadCellular: false,
      downloadQuality: 'High',
      newMusicNotifications: true,
      productAnnouncements: false,
      privateSession: false,
      listeningActivity: true,
      explicitContent: true,

      setGapless: (v) => set({ gapless: v }),
      setNormalizeVolume: (v) => set({ normalizeVolume: v }),
      setAutoplay: (v) => set({ autoplay: v }),
      setAudioQuality: (v) => set({ audioQuality: v }),
      setDataSaver: (v) => set({ dataSaver: v }),
      setCellularStreamingQuality: (v) => set({ cellularStreamingQuality: v }),
      setDownloadCellular: (v) => set({ downloadCellular: v }),
      setDownloadQuality: (v) => set({ downloadQuality: v }),
      setNewMusicNotifications: (v) => set({ newMusicNotifications: v }),
      setProductAnnouncements: (v) => set({ productAnnouncements: v }),
      setPrivateSession: (v) => set({ privateSession: v }),
      setListeningActivity: (v) => set({ listeningActivity: v }),
      setExplicitContent: (v) => set({ explicitContent: v }),
    }),
    {
      name: 'vybe-user-settings-v2',
      storage: mmkvStorage,
      version: 1,
      migrate: (_: unknown) => ({
        gapless: true,
        normalizeVolume: true,
        autoplay: true,
        audioQuality: 'High' as const,
        dataSaver: false,
        cellularStreamingQuality: 'Normal' as const,
        downloadCellular: false,
        downloadQuality: 'High' as const,
        newMusicNotifications: true,
        productAnnouncements: false,
        privateSession: false,
        listeningActivity: true,
        explicitContent: true,
      }),
    }
  )
);
