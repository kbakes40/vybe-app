import { create } from 'zustand';

type State = {
  message: string | null;
  showReconnectingVault: () => void;
  hide: () => void;
};

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useShadowPlaybackToastStore = create<State>((set) => ({
  message: null,
  showReconnectingVault: () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    set({ message: 'RE-CONNECTING TO VAULT...' });
    hideTimer = setTimeout(() => {
      hideTimer = null;
      set({ message: null });
    }, 4500);
  },
  hide: () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    set({ message: null });
  },
}));
