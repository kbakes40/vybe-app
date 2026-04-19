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
  /** Default false until `PillLockSync` confirms auth + route (avoids native pill on cold sign-in). */
  allowIslandSurfaces: false,
  setAllowIslandSurfaces: (v) => set({ allowIslandSurfaces: v }),
}));

/** True when user is signed in and not on login / onboarding / OTP surfaces. */
export function computeAllowIslandSurfaces(opts: {
  isPending: boolean;
  hasUser: boolean;
  pathname: string;
  segments: string[];
}): boolean {
  if (opts.isPending || !opts.hasUser) return false;
  const p = (opts.pathname || '').toLowerCase();
  if (/(^|[/])(sign-in|verify-otp|onboarding)([/]|$)/.test(p)) return false;
  const s0 = (opts.segments[0] || '').toLowerCase();
  if (s0 === 'sign-in' || s0 === 'verify-otp' || s0 === 'onboarding') return false;
  return true;
}
