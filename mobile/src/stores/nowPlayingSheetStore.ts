import { create } from 'zustand';

type SheetActions = {
  expand: (() => void) | null;
  collapse: (() => void) | null;
  register: (expand: (() => void) | null, collapse: (() => void) | null) => void;
  /** True while the full-player sheet covers most of the screen (mini sits under it). */
  isExpanded: boolean;
  setSheetExpanded: (v: boolean) => void;
};

export const useNowPlayingSheetStore = create<SheetActions>((set) => ({
  expand: null,
  collapse: null,
  isExpanded: false,
  setSheetExpanded: (v) => set({ isExpanded: v }),
  register: (expand, collapse) => set({ expand, collapse }),
}));
