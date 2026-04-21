import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { usePathname } from 'expo-router';
import { authClient } from '@/lib/auth/auth-client';
import { usePillLockStore } from '@/stores/pillLockStore';
import {
  startNowPlayingActivity,
  activityTerminateAll,
} from '@/lib/NowPlayingActivityManager';
import { usePlaybackController } from '@/stores/playbackController';

/**
 * AUTH_LOCK_SYNC — root `_layout.tsx` only.
 * - Writes `hasUser` / `allowIslandSurfaces` only when session **identity** changes
 *   (`hasUser` boolean + id/email key), not on pathname / scroll.
 * - In-app `sign-in` modal while authenticated: session user remains → stays TRUE → pill visible.
 * - Logout: `hasUser` false → `activityTerminateAll()` on the falling edge (hardware clear).
 */
export function PillLockSync() {
  const { data: session, isPending } = authClient.useSession();
  const pathname = usePathname();

  const hasUser = !!session?.user;
  /** Auth stack / cold boot — never show in-app pill chrome until we are in the main app shell. */
  const suppressIslandSurfaces =
    pathname === '/sign-in' ||
    pathname === '/verify-otp' ||
    pathname?.endsWith('/sign-in') ||
    pathname?.endsWith('/verify-otp') ||
    pathname === '/onboarding';
  const authSyncKey = useMemo(() => {
    const u = session?.user;
    if (!u) return null;
    const id = (u as { id?: string }).id;
    const email = (u as { email?: string }).email;
    return `${id ?? ''}|${email ?? ''}`;
  }, [session?.user?.id, session?.user?.email]);

  useLayoutEffect(() => {
    if (isPending) {
      usePillLockStore.setState({ hasUser: false, allowIslandSurfaces: false });
      return;
    }
    if (suppressIslandSurfaces) {
      usePillLockStore.setState({ hasUser, allowIslandSurfaces: false });
      return;
    }
    if (__DEV__) console.log('[PillLockSync] layoutEffect → sync', { hasUser, authSyncKey });
    usePillLockStore.getState().syncAuthLockFromSession(hasUser);
  }, [hasUser, authSyncKey, isPending, suppressIslandSurfaces]);

  const prevHasUser = useRef(false);
  useEffect(() => {
    const prev = prevHasUser.current;
    prevHasUser.current = hasUser;
    if (__DEV__) console.log('[PillLockSync] transition', { prev, hasUser });

    if (prev && !hasUser) {
      if (__DEV__) console.log('[PillLockSync] → terminate (sign-out)');
      activityTerminateAll();
      return;
    }

    if (!prev && hasUser) {
      const { currentTrack, playbackState } = usePlaybackController.getState();
      if (__DEV__) {
        console.log('[PillLockSync] sign-in reseed check', {
          hasTrack: !!currentTrack,
          playbackState,
          title: currentTrack?.title,
          album: currentTrack?.globalRadioIslandAlbum,
        });
      }
      if (
        currentTrack &&
        (playbackState === 'playing' || playbackState === 'buffering' || playbackState === 'loading')
      ) {
        if (__DEV__) console.log('[PillLockSync] → startNowPlayingActivity (reseed)');
        void startNowPlayingActivity(
          currentTrack.title,
          currentTrack.artist,
          currentTrack.artwork ?? '',
          currentTrack.duration || 0,
        );
      }
    }
  }, [hasUser]);

  return null;
}
