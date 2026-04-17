import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkState {
  /** Whether the device currently has a network connection (auto-detected). */
  isOnline: boolean;

  /** Whether the user has manually toggled offline mode in settings. */
  isOfflineMode: boolean;

  /** Toggle manual offline mode on/off. */
  setOfflineMode: (value: boolean) => void;

  /** Called internally by the NetInfo listener — not for external use. */
  _setOnline: (value: boolean) => void;
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set) => ({
      isOnline: true,
      isOfflineMode: false,

      setOfflineMode: (value: boolean) => set({ isOfflineMode: value }),

      _setOnline: (value: boolean) => set({ isOnline: value }),
    }),
    {
      name: 'vybe-network-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the user's manual toggle — connectivity is always re-detected.
      partialize: (state) => ({
        isOfflineMode: state.isOfflineMode,
      }),
    },
  ),
);

// ── NetInfo listener (module-level, runs once on import) ──────────────────────
// Subscribes to connectivity changes and updates the store. The unsubscribe
// function is intentionally ignored — the listener should live for the entire
// app session.
NetInfo.addEventListener((state: NetInfoState) => {
  const isConnected = state.isConnected ?? false;
  useNetworkStore.getState()._setOnline(isConnected);
});

// Also do an immediate fetch so the store is accurate on cold start.
NetInfo.fetch().then((state: NetInfoState) => {
  const isConnected = state.isConnected ?? false;
  useNetworkStore.getState()._setOnline(isConnected);
});

// ── Convenience hook ──────────────────────────────────────────────────────────
/**
 * Returns `true` when the app should behave as if offline:
 * either the device has no connection OR the user toggled offline mode.
 */
export function useIsOffline(): boolean {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const isOfflineMode = useNetworkStore((s) => s.isOfflineMode);
  return !isOnline || isOfflineMode;
}
