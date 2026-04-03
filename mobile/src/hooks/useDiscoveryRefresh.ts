import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useDiscoveryAlgorithmStore } from '@/stores/discoveryAlgorithmStore';

/**
 * Hook that refreshes discovery on app open
 * Attach this to the main app layout
 */
export function useDiscoveryRefresh() {
  const fetchDiscoverySections = useDiscoveryAlgorithmStore(s => s.fetchDiscoverySections);
  const fetchTasteProfile = useDiscoveryAlgorithmStore(s => s.fetchTasteProfile);
  const flushSignalQueue = useDiscoveryAlgorithmStore(s => s.flushSignalQueue);

  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Initial fetch on mount
    console.log('[Discovery] Initial refresh on app open');
    fetchTasteProfile();
    fetchDiscoverySections();

    // Listen for app state changes
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      // App came to foreground
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('[Discovery] App came to foreground, refreshing');
        fetchDiscoverySections();
      }

      // App going to background - flush signals
      if (nextAppState.match(/inactive|background/) && appState.current === 'active') {
        console.log('[Discovery] App going to background, flushing signals');
        flushSignalQueue();
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [fetchDiscoverySections, fetchTasteProfile, flushSignalQueue]);
}
