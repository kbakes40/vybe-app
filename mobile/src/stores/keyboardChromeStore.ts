import { create } from 'zustand';

/**
 * When the software keyboard is visible, tab bar + mini player hide to free space for search/results.
 */
export const useKeyboardChromeStore = create<{
  keyboardVisible: boolean;
  setKeyboardVisible: (v: boolean) => void;
}>((set) => ({
  keyboardVisible: false,
  setKeyboardVisible: (keyboardVisible) => set({ keyboardVisible }),
}));
