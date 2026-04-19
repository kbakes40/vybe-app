import { create } from 'zustand';

/**
 * PILL_LOCK_V2 — single source for whether Dynamic Island / Now Playing native
 * metadata and in-app chrome may run. Synced from root `PillLockSync` (auth + route).
 */
export type PillLockState = {
  /** When false: do not start/update native Now Playing; hide in-app pill chrome. */
  allowIslandSurfaces: boolean;
  setAllowIslandSurfaces: (v: boolean) => void;
};

export const usePillLockStore = create<PillLockState>((set) => ({
  /**
   * Default TRUE. PillLockSync fires in a useLayoutEffect (before paint) and
   * flips to false on the real sign-in / onboarding / verify-otp surfaces,
   * so the "cold sign-in" flash is still prevented — but a default of `false`
   * leaves the pill permanently invisible whenever session resolution hiccups
   * (Better Auth token refresh can briefly drop `session.user`), which is the
   * failure mode users actually report.
   */
  allowIslandSurfaces: true,
  setAllowIslandSurfaces: (v) => set({ allowIslandSurfaces: v }),
}));

/** True when user is signed in and not on login / onboarding / OTP surfaces. */
export function computeAllowIslandSurfaces(opts: {
  isPending: boolean;
  hasUser: boolean;
  pathname: string;
  segments: string[];
}): boolean {
  // Do not gate on `isPending`: Better Auth often leaves `isPending` true during
  // background refresh while `user` is still populated — that hid the in-app
  // pill + native Now Playing bridge for long stretches.
  if (!opts.hasUser) return false;
  const p = (opts.pathname || '').toLowerCase();
  if (/(^|[/])(sign-in|login|verify-otp|onboarding)([/]|$)/.test(p)) return false;
  const s0 = (opts.segments[0] || '').toLowerCase();
  if (s0 === 'sign-in' || s0 === 'login' || s0 === 'verify-otp' || s0 === 'onboarding') return false;
  return true;
}
