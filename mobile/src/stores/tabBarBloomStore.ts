import { create } from 'zustand';

/**
 * Press-driven tab icon bloom (Machined Blue scale + shadow) — decoupled from
 * React Navigation `focused` so every tap replays the 300ms bloom.
 */
interface TabBarBloomState {
  /** Monotonic — subscribers compare to last seen to fire a bloom pulse. */
  pulseAt: number;
  /** Route name from the tab screen (`index`, `search`, …). */
  pulseRoute: string | null;
  pulse: (route: string) => void;
}

export const useTabBarBloomStore = create<TabBarBloomState>((set) => ({
  pulseAt: 0,
  pulseRoute: null,
  pulse: (route) =>
    set({
      pulseAt: Date.now(),
      pulseRoute: route,
    }),
}));
