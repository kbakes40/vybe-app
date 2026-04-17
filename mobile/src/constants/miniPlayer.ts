/**
 * Must match `TAB_BAR_CONTENT_HEIGHT` in `src/app/(app)/(tabs)/_layout.tsx`.
 */
export const TAB_BAR_BASE_HEIGHT = 76;

/** Locked shelf: mini sits flush on the tab bar — no float gap. */
export const MINI_PLAYER_FLOAT_GAP = 0;

/**
 * Optional nudge into the tab bar to kill a 1px seam; keep 0 unless a device still shows a hairline.
 */
export const MINI_PLAYER_TAB_FLUSH_OVERLAP_PX = 0;

/**
 * Collapsed mini-player strip height (8+8 padding + 44 artwork row + 2 progress).
 * Must match `MiniPlayer` — if this is too large, the sheet sits “too high” when open and leaves a dead band.
 */
export const MINI_PLAYER_HEIGHT = 62;

/**
 * Bottom padding for main tab `ScrollView`s so content clears the tab bar + optional mini player.
 */
export function tabScreenScrollBottomPad(insetsBottom: number, hasMiniPlayer: boolean): number {
  const tabBar = TAB_BAR_BASE_HEIGHT + insetsBottom;
  if (!hasMiniPlayer) return tabBar + 28;
  return tabBar + MINI_PLAYER_HEIGHT + 12;
}
