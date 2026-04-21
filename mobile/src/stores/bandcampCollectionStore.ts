import { create } from 'zustand';
import type { BandcampCollectionItem } from '@/lib/bandcampService';
import { syncBandcampFanCollection } from '@/lib/bandcampService';
import { getActiveBandcampIdentity } from '@/lib/bandcampLocalConfig';

interface BandcampCollectionState {
  items: BandcampCollectionItem[];
  lastSyncedAt: number | null;
  isSyncing: boolean;
  syncError: string | null;
  syncFromBandcamp: () => Promise<void>;
  clear: () => void;
}

export const useBandcampCollectionStore = create<BandcampCollectionState>((set) => ({
  items: [],
  lastSyncedAt: null,
  isSyncing: false,
  syncError: null,

  clear: () => set({ items: [], lastSyncedAt: null, syncError: null }),

  syncFromBandcamp: async () => {
    if (!getActiveBandcampIdentity()) {
      set({ items: [], syncError: null });
      return;
    }
    set({ isSyncing: true, syncError: null });
    try {
      const items = await syncBandcampFanCollection();
      set({ items, lastSyncedAt: Date.now(), isSyncing: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sync failed';
      set({ isSyncing: false, syncError: msg });
    }
  },
}));
