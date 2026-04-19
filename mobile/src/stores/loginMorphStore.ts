import { create } from 'zustand';

export type LoginMorphPayload = {
  fromX: number;
  fromY: number;
  fromW: number;
  fromH: number;
  screenW: number;
  screenH: number;
  insetBottom: number;
};

/** Tab index (0-based) where the Vybe app icon sits — matches `discover` in `(tabs)/_layout`. */
export const LOGIN_MORPH_TAB_INDEX = 2;

type LoginMorphState = {
  morph: LoginMorphPayload | null;
  start: (payload: LoginMorphPayload) => void;
  clear: () => void;
};

export const useLoginMorphStore = create<LoginMorphState>((set) => ({
  morph: null,
  start: (payload) => set({ morph: payload }),
  clear: () => set({ morph: null }),
}));
