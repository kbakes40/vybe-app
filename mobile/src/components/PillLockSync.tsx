import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname, useSegments } from 'expo-router';
import { authClient } from '@/lib/auth/auth-client';
import {
  computeAllowIslandSurfaces,
  usePillLockStore,
} from '@/stores/pillLockStore';
import {
  startNowPlayingActivity,
  terminateAllPillNative,
} from '@/lib/NowPlayingActivityManager';
import { usePlaybackController } from '@/stores/playbackController';

/**
 * Root-only sync: maps session + route → pill lock store (layout effect so
 * consumers read the correct flag before first paint), terminates native
 * pill / ActivityKit when disallowed, and re-seeds MPNowPlaying when allowed
 * again with an active track (tab-hopping safe).
 */
export function PillLockSync() {
  const { data: session, isPending } = authClient.useSession();
  const pathname = usePathname();
  const segments = useSegments();

  const allow = computeAllowIslandSurfaces({
    isPending,
    hasUser: !!session?.user,
    pathname: String(pathname ?? ''),
    segments: segments as string[],
  });

  useLayoutEffect(() => {
    usePillLockStore.getState().setAllowIslandSurfaces(allow);
  }, [allow]);

  const prevAllow = useRef(allow);
  useEffect(() => {
    const prev = prevAllow.current;
    prevAllow.current = allow;

    if (prev && !allow) {
      terminateAllPillNative();
      return;
    }

    if (!prev && allow) {
      const { currentTrack, playbackState } = usePlaybackController.getState();
      if (
        currentTrack &&
        (playbackState === 'playing' || playbackState === 'buffering' || playbackState === 'loading')
      ) {
        void startNowPlayingActivity(
          currentTrack.title,
          currentTrack.artist,
          currentTrack.artwork ?? '',
          currentTrack.duration || 0,
          currentTrack.globalRadioIslandAlbum,
        );
      }
    }
  }, [allow]);

  return null;
}
