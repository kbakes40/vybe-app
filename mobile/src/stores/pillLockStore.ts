import { create } from 'zustand';

/**
 * AUTH_LOCK_SYNC — session mirror for chrome that must not thrash on scroll/navigation.
 * `hasUser` and `allowIslandSurfaces` stay in lockstep; update only via `syncAuthLockFromSession`.
 */
export type PillLockState = {
  /** Mirrors Better Auth `!!session?.user` — MiniPlayer + top masks read this. */
  hasUser: boolean;
  /** Same as `hasUser` — native Now Playing / Dynamic Island bridge + in-app pill. */
  allowIslandSurfaces: boolean;
  /** Prefer this over ad-hoc setters — keeps `hasUser` / `allow` aligned (AUTH_LOCK_SYNC). */
  syncAuthLockFromSession: (hasUser: boolean) => void;
};

export const usePillLockStore = create<PillLockState>((set) => ({
  hasUser: false,
  allowIslandSurfaces: false,
  syncAuthLockFromSession: (hasUser) =>
    set((s) => {
      if (s.hasUser === hasUser && s.allowIslandSurfaces === hasUser) {
        if (__DEV__) console.log('[PillLock] sync no-op', { hasUser, allow: s.allowIslandSurfaces });
        return s;
      }
      if (__DEV__) {
        console.log('[PillLock] sync FLIP', {
          from: { hasUser: s.hasUser, allow: s.allowIslandSurfaces },
          to: { hasUser, allow: hasUser },
        });
      }
      return { hasUser, allowIslandSurfaces: hasUser };
    }),
}));

/**
 * In-app sign-in / verify-otp modals while authenticated do **not** change `hasUser`
 * (session stays populated), so this stays TRUE and the pill remains visible.
 */
export function computeAllowIslandSurfaces(opts: {
  isPending: boolean;
  hasUser: boolean;
  pathname: string;
  segments: string[];
}): boolean {
  void opts.isPending;
  void opts.pathname;
  void opts.segments;
  return opts.hasUser;
}
