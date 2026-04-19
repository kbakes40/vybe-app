import { create } from 'zustand';

/** `top` = status-area micro toast; `dock` = above mini player (vault reconnect). */
export type ShadowPlaybackToastPlacement = 'top' | 'dock';

type State = {
  message: string | null;
  placement: ShadowPlaybackToastPlacement;
  showReconnectingVault: () => void;
  /** Short geometric micro-toast (e.g. Radio Heart / Fire). */
  showMicroToast: (message: string, opts?: { placement?: ShadowPlaybackToastPlacement; durationMs?: number }) => void;
  hide: () => void;
};

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useShadowPlaybackToastStore = create<State>((set) => ({
  message: null,
  placement: 'dock',
  showReconnectingVault: () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    set({ message: 'RE-CONNECTING TO VAULT...', placement: 'dock' });
    hideTimer = setTimeout(() => {
      hideTimer = null;
      set({ message: null });
    }, 4500);
  },
  showMicroToast: (message, opts) => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    const placement = opts?.placement ?? 'top';
    const durationMs = opts?.durationMs ?? 1800;
    set({ message: message.slice(0, 48), placement });
    hideTimer = setTimeout(() => {
      hideTimer = null;
      set({ message: null });
    }, durationMs);
  },
  hide: () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    set({ message: null });
  },
}));
