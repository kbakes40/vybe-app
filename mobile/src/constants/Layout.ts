/** Fixed tab bar chrome height (icon + uppercase label; add `insets.bottom` in `tabBarStyle` for home indicator). */
export const TAB_BAR_HEIGHT = 78;

/** Collapsed mini-player strip (must match `MiniPlayer` + `NowPlayingSheet` math). */
export const MINI_PLAYER_HEIGHT = 64;

/**
 * Docked chrome: tab bar + mini strip. Use for `contentContainerStyle.paddingBottom` so lists
 * end flush above the player, not behind it.
 */
export const TOTAL_BOTTOM_OFFSET = TAB_BAR_HEIGHT + MINI_PLAYER_HEIGHT;

/** Extra scroll clearance below tab bar + mini. */
export const TAB_MAIN_SCROLL_PADDING_EXTRA = 20;

/** Main tab vertical `ScrollView` `contentContainerStyle.paddingBottom`. */
export const TAB_MAIN_SCROLL_PADDING_BOTTOM =
  TAB_BAR_HEIGHT + MINI_PLAYER_HEIGHT + TAB_MAIN_SCROLL_PADDING_EXTRA;

/** Search tab — "Browse All" genre grid: extra inset so the last row clears the docked mini-player. */
export const SEARCH_BROWSE_GRID_PADDING_EXTRA = 92;
