import { MINI_PLAYER_HEIGHT, TAB_BAR_BASE_HEIGHT } from '@/constants/miniPlayer';

/** Tab bar chrome (matches `TAB_BAR_BASE_HEIGHT` in tabs layout). */
export const TAB_BAR_HEIGHT = TAB_BAR_BASE_HEIGHT;

export { MINI_PLAYER_HEIGHT } from '@/constants/miniPlayer';

/** Extra breathing room below docked chrome (Home / playlists). */
export const TAB_MAIN_SCROLL_PADDING_EXTRA = 20;

/**
 * Docked: tab bar + mini player + breathing room — use for playlist `FlashList` /
 * `ScrollView` `contentContainerStyle.paddingBottom` (+ safe-area inset when needed).
 */
export const TAB_MAIN_SCROLL_PADDING_BOTTOM =
  TAB_BAR_HEIGHT + MINI_PLAYER_HEIGHT + TAB_MAIN_SCROLL_PADDING_EXTRA;

export const PLAYLIST_DOCKED_PADDING_BOTTOM = TAB_MAIN_SCROLL_PADDING_BOTTOM;

export const TOTAL_BOTTOM_OFFSET = TAB_BAR_HEIGHT + MINI_PLAYER_HEIGHT;
