import React, { createContext, useContext } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlaybackController } from '@/stores/playbackController';
import { TAB_BAR_HEIGHT } from '@/constants/Layout';

// Mini player height constants
export const MINI_PLAYER_HEIGHT = 64; // 48px artwork + 8px padding top + 8px padding bottom
export const MINI_PLAYER_MARGIN = 8; // margin bottom
export const MINI_PLAYER_TOTAL_HEIGHT = MINI_PLAYER_HEIGHT + MINI_PLAYER_MARGIN + 2; // +2 for progress bar

interface MiniPlayerContextValue {
  miniPlayerHeight: number;
  tabBarHeight: number;
  totalBottomInset: number;
  isPlayerVisible: boolean;
}

const MiniPlayerContext = createContext<MiniPlayerContextValue>({
  miniPlayerHeight: 0,
  tabBarHeight: 0,
  totalBottomInset: 0,
  isPlayerVisible: false,
});

export function MiniPlayerProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const currentTrack = usePlaybackController(s => s.currentTrack);

  const isPlayerVisible = !!currentTrack;
  const tabBarHeight = TAB_BAR_HEIGHT + insets.bottom;
  const miniPlayerHeight = isPlayerVisible ? MINI_PLAYER_TOTAL_HEIGHT : 0;
  const totalBottomInset = tabBarHeight + miniPlayerHeight;

  return (
    <MiniPlayerContext.Provider
      value={{
        miniPlayerHeight,
        tabBarHeight,
        totalBottomInset,
        isPlayerVisible,
      }}
    >
      {children}
    </MiniPlayerContext.Provider>
  );
}

export function useMiniPlayer() {
  return useContext(MiniPlayerContext);
}
