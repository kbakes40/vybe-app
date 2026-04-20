import { Easing, makeMutable, withTiming } from 'react-native-reanimated';
import { EXPANDED_PILL_MIN_HEIGHT_PT } from '@/constants/pillIslandGeometry';

/**
 * DISABLE_NOW_PLAYING_SNAP — kick timing matches the pill geometry timing in
 * {@link DynamicIsland} (Easing.out(Easing.exp), 360ms). Page content only ever
 * shifts DOWN to make room for the expanded pill — never up.
 */
const KICK_TIMING = { duration: 360, easing: Easing.out(Easing.exp) } as const;

const PLAYING_BAR_H = 44;

/**
 * Extra `translateY` on tab roots while the pill is expanded (Louis only — driven from {@link DynamicIsland}).
 * Always non-negative: positive values push content downward, the value never goes negative
 * so the page can't snap upward to meet the pill.
 */
export const louisPillExpandKickInsetSV = makeMutable(0);

/** Drive kick inset from measured expanded pill height minus the playing bar (pt). Clamped to >= 0. */
export function syncLouisPillKickDelta(deltaPt: number): void {
  louisPillExpandKickInsetSV.value = withTiming(Math.max(0, deltaPt), KICK_TIMING);
}

/** Legacy boolean API — maps to min expanded kick or zero. */
export function syncLouisPillExpandKickExpanded(isExpanded: boolean): void {
  syncLouisPillKickDelta(isExpanded ? EXPANDED_PILL_MIN_HEIGHT_PT - PLAYING_BAR_H : 0);
}
