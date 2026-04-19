import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MAX_ENTRIES = 500;

export type HighEnergyRadioEntry = {
  id: string;
  artist: string;
  title: string;
  at: number;
};

interface HighEnergyRadioState {
  entries: HighEnergyRadioEntry[];
  /** Append on-air row (dedupes rapid double-taps). */
  logRadioOnAir: (artist: string, title: string) => void;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useHighEnergyRadioStore = create<HighEnergyRadioState>()(
  persist(
    (set, get) => ({
      entries: [],

      logRadioOnAir: (artist, title) => {
        const a = artist.trim();
        const t = title.trim();
        if (!a && !t) return;

        const prev = get().entries[0];
        const now = Date.now();
        if (
          prev &&
          prev.artist.toLowerCase() === a.toLowerCase() &&
          prev.title.toLowerCase() === t.toLowerCase() &&
          now - prev.at < 2500
        ) {
          return;
        }

        const row: HighEnergyRadioEntry = {
          id: makeId(),
          artist: a || 'Unknown',
          title: t || 'Unknown',
          at: now,
        };

        set((s) => ({
          entries: [row, ...s.entries].slice(0, MAX_ENTRIES),
        }));
      },
    }),
    {
      name: 'vybe-high-energy-radio',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
);
