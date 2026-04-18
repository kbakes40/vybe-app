import {
  TAB_BAR_HEIGHT,
  MINI_PLAYER_HEIGHT,
  TAB_MAIN_SCROLL_PADDING_BOTTOM,
} from '@/constants/Layout';

/** @deprecated Use TAB_BAR_HEIGHT from `@/constants/Layout` */
export const TAB_BAR_BASE_HEIGHT = TAB_BAR_HEIGHT;

export { MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT };

/** Locked shelf: mini sits flush on the tab bar — no float gap. */
export const MINI_PLAYER_FLOAT_GAP = 0;

/**
 * Optional nudge into the tab bar to kill a 1px seam; keep 0 unless a device still shows a hairline.
 */
export const MINI_PLAYER_TAB_FLUSH_OVERLAP_PX = 0;

/**
 * Bottom padding for main tab `ScrollView`s (tab bar + mini + gap).
 * Arguments ignored — kept for call-site compatibility.
 */
export function tabScreenScrollBottomPad(_insetsBottom?: number, _hasMiniPlayer?: boolean): number {
  return TAB_MAIN_SCROLL_PADDING_BOTTOM;
}
