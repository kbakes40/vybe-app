import { makeMutable, type SharedValue } from 'react-native-reanimated';

/**
 * Google Music-style cross-fade link between `NowPlayingSheet` and `MiniPlayer`.
 *
 * Value semantics:
 *   0 → sheet fully collapsed (mini strip visible, at full opacity)
 *   1 → sheet fully expanded  (mini strip hidden, sheet covers it)
 *
 * The sheet writes to this shared value every frame from its pan/animation worklet.
 * The mini player reads it inside a `useAnimatedStyle` and interpolates its own opacity
 * so the two feel like one continuous surface morphing — instead of a threshold snap.
 *
 * NOTE: Shared values are safe at module scope. React does not re-create them; both the
 * sheet and the mini attach to this exact reference across renders.
 */
export const sheetProgressSV: SharedValue<number> = makeMutable(0);
