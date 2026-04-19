import { create } from "zustand";

/**
 * Lightweight ephemeral signal store for the DynamicIsland.
 *
 * Used by features (e.g. Social PostComposer) to flash a SUCCESS state on
 * the pill without coupling them to the DI internals. The DI subscribes to
 * `successAt` and renders a Shadow Cyan checkmark for ~2s when it changes.
 */
interface DynamicIslandSignalState {
  /** Monotonically updated timestamp; bump to trigger a SUCCESS flash. */
  successAt: number;
  /** Optional one-line label rendered next to the checkmark. */
  successLabel: string | null;
  /** Trigger a SUCCESS flash on the pill. */
  flashSuccess: (label?: string) => void;

  /**
   * Overrides the default "MACHINED_RECOVERY" label when the pill is in
   * its recovery state. Set to "TOKEN_REFRESH" while the backend is
   * minting a fresh PO token, so the user knows the app is "thinking"
   * rather than just stuck on a network error.
   */
  recoveryLabel: string | null;
  /** Set the recovery label override. Pass null to clear. */
  setRecoveryLabel: (label: string | null) => void;
}

export const useDynamicIslandSignal = create<DynamicIslandSignalState>((set) => ({
  successAt: 0,
  successLabel: null,
  flashSuccess: (label?: string) =>
    set({ successAt: Date.now(), successLabel: label?.slice(0, 42) ?? null }),

  recoveryLabel: null,
  setRecoveryLabel: (label: string | null) =>
    set({ recoveryLabel: label?.slice(0, 28) ?? null }),
}));
