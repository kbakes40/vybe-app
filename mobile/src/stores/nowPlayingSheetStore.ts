import { create } from 'zustand';

type SheetActions = {
  expand: (() => void) | null;
  collapse: (() => void) | null;
  register: (expand: (() => void) | null, collapse: (() => void) | null) => void;
};

export const useNowPlayingSheetStore = create<SheetActions>((set) => ({
  expand: null,
  collapse: null,
  register: (expand, collapse) => set({ expand, collapse }),
}));
