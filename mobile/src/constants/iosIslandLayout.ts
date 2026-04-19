import { Platform } from 'react-native';

/** Before SafeAreaProvider resolves, `top` can be 0 — assume a typical DI phone. */
function effectiveTopInset(insetsTop: number): number {
  if (insetsTop >= 20) return insetsTop;
  if (Platform.OS === 'ios') return 56;
  return 28;
}

/**
 * Approximate vertical center (pt from top of screen) of the Dynamic Island /
 * sensor housing, using only `useSafeAreaInsets().top` so we avoid native
 * bridge calls. Tuned for Pro / Max; notch phones get a lower band.
 */
export function hardwareIslandCenterY(insetsTop: number): number {
  const t = effectiveTopInset(insetsTop);
  if (Platform.OS !== 'ios') {
    return Math.max(18, t * 0.38);
  }
  // Dynamic Island class — large top inset (≈54–62+ on current Pro models).
  if (t >= 53) {
    return t * 0.43;
  }
  // Classic notch — center under the earpiece / status cluster.
  if (t >= 44) {
    return 14 + t * 0.18;
  }
  return Math.max(18, t * 0.42);
}

/** `top` style so a pill of height `h` is vertically centered on the island band. */
export function islandAlignedPillTop(insetsTop: number, h: number): number {
  const c = hardwareIslandCenterY(insetsTop);
  return Math.max(Platform.OS === 'ios' ? 2 : 10, Math.round(c - h / 2));
}

/** `top` for a short trace / chrome layer (height `traceH`) centered on the same band. */
export function islandAlignedTraceTop(insetsTop: number, traceH: number): number {
  const c = hardwareIslandCenterY(insetsTop);
  return Math.max(0, Math.round(c - traceH / 2));
}
