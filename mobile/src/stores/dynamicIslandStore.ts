import { create } from "zustand";

/**
 * Lightweight ephemeral signal store for the DynamicIsland.
 *
 * Used by features (e.g. Social PostComposer) to flash a SUCCESS state on
 * the pill without coupling them to the DI internals. The DI subscribes to
 * `successAt` and renders a Shadow Cyan checkmark for ~2s when it changes.
 */
interface DynamicIslandSignalState {
  /** True while server may be auto-healing a failed YouTube vault (baby blue pulse). */
  healingStreamActive: boolean;
  setHealingStreamActive: (active: boolean) => void;

  /**
   * After a SoundCloud-first `scMatchPromise` resolves with a match, pill glow
   * shifts to SoundCloud Orange until cleared (e.g. next non-SC play).
   */
  scIgnitionGlow: boolean;
  setScIgnitionGlow: (on: boolean) => void;

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

  /**
   * Monotonic timestamp; bump from the Now Playing screen when the user taps
   * the Fire icon. The pill flares its border to SoundCloud Orange and emits
   * a fire-particle burst for ~1.6s before settling back.
   */
  firedAt: number;
  /** Trigger a Fire flash on the pill. */
  flashFire: () => void;

  /**
   * Radio "HYPE" — short Machined Cyan border / glow pulse on the pill (~1s).
   * Distinct from {@link flashFire} (SoundCloud-orange like burst).
   */
  radioMachinedPulseAt: number;
  flashRadioMachinedPulse: () => void;
}

export const useDynamicIslandSignal = create<DynamicIslandSignalState>((set) => ({
  healingStreamActive: false,
  setHealingStreamActive: (active) => set({ healingStreamActive: active }),

  scIgnitionGlow: false,
  setScIgnitionGlow: (on) => set({ scIgnitionGlow: on }),

  successAt: 0,
  successLabel: null,
  flashSuccess: (label?: string) =>
    set({ successAt: Date.now(), successLabel: label?.slice(0, 42) ?? null }),

  recoveryLabel: null,
  setRecoveryLabel: (label: string | null) =>
    set({ recoveryLabel: label?.slice(0, 28) ?? null }),

  firedAt: 0,
  flashFire: () => set({ firedAt: Date.now() }),

  radioMachinedPulseAt: 0,
  flashRadioMachinedPulse: () => set({ radioMachinedPulseAt: Date.now() }),
}));
