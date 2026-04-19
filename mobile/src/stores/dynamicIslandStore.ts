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
}

export const useDynamicIslandSignal = create<DynamicIslandSignalState>((set) => ({
  successAt: 0,
  successLabel: null,
  flashSuccess: (label?: string) =>
    set({ successAt: Date.now(), successLabel: label?.slice(0, 42) ?? null }),
}));
