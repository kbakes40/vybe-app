/** Fixed tab bar chrome height (icon-only + machined indicator; `tabBarStyle` adds `insets.bottom` for home indicator). */
export const TAB_BAR_HEIGHT = 56;

/** Collapsed mini-player strip (must match `MiniPlayer` + `NowPlayingSheet` math). */
export const MINI_PLAYER_HEIGHT = 64;

/**
 * Physical dock: tab strip + mini strip (numeric chrome only).
 * Treat as the floor for scrollable content on tab routes (add safe-area + breathing room via helpers below).
 */
export const BOTTOM_DOCK_HEIGHT = TAB_BAR_HEIGHT + MINI_PLAYER_HEIGHT;

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
 * the pinned tab bar + mini player + home indicator.
 */
export function tabScreenContentContainerPaddingBottom(insetsBottom: number): number {
  return BOTTOM_DOCK_HEIGHT + BOTTOM_DOCK_CONTENT_INSET_EXTRA + insetsBottom;
}

/**
 * Stack routes while the main tab bar is still visible (e.g. pushed playlist):
 * same floor as tab routes so the last row clears tab bar + mini player.
 */
export function stackScreenContentContainerPaddingBottom(insetsBottom: number): number {
  return BOTTOM_DOCK_HEIGHT + BOTTOM_DOCK_CONTENT_INSET_EXTRA + insetsBottom;
}

/** Main tab vertical scroll bottom pad without separate `insets.bottom` term (callers add insets). */
export const TAB_MAIN_SCROLL_PADDING_BOTTOM = BOTTOM_DOCK_HEIGHT + BOTTOM_DOCK_CONTENT_INSET_EXTRA;

/** Search tab — "Browse All" genre grid: extra inset so the last row clears the docked mini-player. */
export const SEARCH_BROWSE_GRID_PADDING_EXTRA = 92;

/**
 * Fixed-value alias of the dock floor + 16pt gap — stops any ScrollView /
 * FlashList exactly 16pt above the MiniPlayer so nothing scrolls behind it.
 * Does NOT include safe-area bottom (callers that need the home-indicator
 * inset should add `insets.bottom` or use {@link tabScreenContentContainerPaddingBottom}).
 */
export const SCROLL_VIEW_BOTTOM_PADDING = TAB_BAR_HEIGHT + MINI_PLAYER_HEIGHT + 16;
