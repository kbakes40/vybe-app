import { EXPANDED_PILL_MAX_HEIGHT_PT } from '@/constants/pillIslandGeometry';

/**
 * Top padding under the status bar for main tab roots so content clears the
 * in-app Dynamic Island pill (expanded mini-controller, max wrap height) + glow gap.
 */
export const TAB_SCREEN_TOP_INSET_BELOW_PILL_PT = EXPANDED_PILL_MAX_HEIGHT_PT + 2 + 4;

/**
 * Fixed tab bar: 5 icons + 10pt small-caps labels + machined indicator.
 * `tabBarStyle` adds `useSafeAreaInsets().bottom` so the Doc clears the home indicator
 * (~34pt on iPhone 14/15 Pro Max class devices — do not hardcode 34).
 */
export const TAB_BAR_HEIGHT = 64;

/**
 * Extra padding below tab labels so taps sit comfortably above the iOS home indicator
 * (avoids swipe gesture conflicts with tab targets).
 */
export const TAB_BAR_HOME_CLEARANCE_PT = 16;

/**
 * Horizontal row under status bar / Dynamic Island — matches {@link useLouisOledChrome}
 * (`insets.top + 48` list baseline).
 */
export const LOUIS_TAB_CONTENT_START_OFFSET_PT = 48;

/** Visual gap between the mini-player strip and the top of the tab dock. */
export const MINI_PLAYER_ABOVE_TAB_GAP_PT = 6;

/** Total tab bar chrome height from the bottom of the screen (safe area + label clearance). */
export function tabBarChromeHeight(insetsBottom: number): number {
  return TAB_BAR_HEIGHT + insetsBottom + TAB_BAR_HOME_CLEARANCE_PT;
}

/**
 * `MiniPlayer` / `NowPlayingSheet` bottom offset: dock height + gap above tabs, before overlap subtraction.
 * App layout subtracts `MINI_PLAYER_TAB_FLUSH_OVERLAP_PX` from `miniPlayer.ts` when present.
 */
export function miniPlayerBottomOffsetRaw(insetsBottom: number): number {
  return tabBarChromeHeight(insetsBottom) + MINI_PLAYER_ABOVE_TAB_GAP_PT;
}

/** Vertical gap between tab icon row and 10pt label (NAV_DOC_VISUAL_FINAL_LOCK). */
export const DOC_LABEL_GAP_PT = 4;
/** Min height for the icon row so SAX / Vybe / SVG slots align before the label. */
export const DOC_ICON_ROW_MIN_HEIGHT_PT = 38;

/** Collapsed mini-player strip (must match `MiniPlayer` + `NowPlayingSheet` math). */
export const MINI_PLAYER_HEIGHT = 64;

/**
 * Tab bar strip — bottom mini-player bar is hidden; playback chrome lives in Dynamic Island + full player sheet.
 */
export const BOTTOM_DOCK_HEIGHT = TAB_BAR_HEIGHT;

/**
 * Docked chrome — alias of {@link BOTTOM_DOCK_HEIGHT} for legacy imports.
 */
export const TOTAL_BOTTOM_OFFSET = BOTTOM_DOCK_HEIGHT;

/** Breathing room below the dock for the last list row (pt). */
export const BOTTOM_DOCK_CONTENT_INSET_EXTRA = 30;

/** @deprecated Prefer {@link tabScreenContentContainerPaddingBottom} or {@link BOTTOM_DOCK_CONTENT_INSET_EXTRA}. */
export const TAB_MAIN_SCROLL_PADDING_EXTRA = BOTTOM_DOCK_CONTENT_INSET_EXTRA;

/**
 * Tab routes: `FlatList` / `ScrollView` `contentContainerStyle.paddingBottom` so the final row clears
 * the pinned tab bar + home indicator.
 */
export function tabScreenContentContainerPaddingBottom(insetsBottom: number): number {
  return (
    BOTTOM_DOCK_HEIGHT +
    BOTTOM_DOCK_CONTENT_INSET_EXTRA +
    insetsBottom +
    TAB_BAR_HOME_CLEARANCE_PT +
    MINI_PLAYER_ABOVE_TAB_GAP_PT
  );
}

/**
 * Stack routes while the main tab bar is still visible (e.g. pushed playlist):
 * same floor as tab routes so the last row clears the tab bar.
 */
export function stackScreenContentContainerPaddingBottom(insetsBottom: number): number {
  return (
    BOTTOM_DOCK_HEIGHT +
    BOTTOM_DOCK_CONTENT_INSET_EXTRA +
    insetsBottom +
    TAB_BAR_HOME_CLEARANCE_PT +
    MINI_PLAYER_ABOVE_TAB_GAP_PT
  );
}

/** Main tab vertical scroll bottom pad without separate `insets.bottom` term (callers add insets). */
export const TAB_MAIN_SCROLL_PADDING_BOTTOM = BOTTOM_DOCK_HEIGHT + BOTTOM_DOCK_CONTENT_INSET_EXTRA;

/** Search tab — "Browse All" genre grid: extra inset so the last row clears the tab dock. */
export const SEARCH_BROWSE_GRID_PADDING_EXTRA = 92;

/**
 * Fixed-value alias of the dock floor + 16pt gap — stops ScrollViews / FlashLists above the tab bar.
 * Does NOT include safe-area bottom (callers that need the home-indicator
 * inset should add `insets.bottom` or use {@link tabScreenContentContainerPaddingBottom}).
 */
export const SCROLL_VIEW_BOTTOM_PADDING =
  TAB_BAR_HEIGHT +
  TAB_BAR_HOME_CLEARANCE_PT +
  MINI_PLAYER_ABOVE_TAB_GAP_PT +
  16;
