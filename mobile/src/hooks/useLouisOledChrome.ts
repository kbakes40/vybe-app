import { useAnimatedStyle } from 'react-native-reanimated';
import { louisPillExpandKickInsetSV } from '@/lib/louisPillExpandKick';

/**
 * UNIFY_PRO_MAX_LAYOUT — canonical tab chrome math for both 14 Pro Max and
 * 15 Pro Max.
 *
 *   - Base header padding sits exactly 12px below the collapsed pill's bottom
 *     edge. Pill top = `insets.top - 8`, collapsed height = 44, so bottom =
 *     `insets.top + 36`, and the list starts at `insets.top + 48`.
 *   - When the pill expands, `louisPillExpandKickInsetSV` (driven by
 *     `DynamicIsland`) animates the Kick translate to push page content down
 *     in lockstep — never upward, never overlapping the pill.
 *
 * The returned `louis` flag stays `true` to keep caller gates
 * (`louis && kickTranslateStyle`) a no-op while preserving the symbol.
 */
export function useLouisOledChrome(insetsTop: number) {
  const louis = true;

  const kickTranslateStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: louisPillExpandKickInsetSV.value }],
  }), []);

  // 12pt below the collapsed pill bottom (insets.top + 36 + 12 = insets.top + 48).
  const tabListTopPadding = insetsTop + 48;

  return { louis, kickTranslateStyle, tabListTopPadding };
}
