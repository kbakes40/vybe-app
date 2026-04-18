import type { SharedValue } from 'react-native-reanimated';
import {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

/**
 * Subtle “motion” read on aggressive vertical flick: opacity + scale (Reanimated-safe proxy for motion blur).
 * Optionally drives an external `scrollY` shared value (e.g. hero fade).
 */
export function useFastVerticalScrollMotion(scrollYRef?: SharedValue<number>) {
  const velocity = useSharedValue(0);
  const lastY = useSharedValue(0);

  /** ~ms between throttled scroll events at scrollEventThrottle={16} */
  const SCROLL_DT_MS = 16;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      if (scrollYRef) scrollYRef.value = y;
      const dy = Math.abs(y - lastY.value);
      lastY.value = y;
      const vy = (dy / SCROLL_DT_MS) * 1000;
      velocity.value = vy * 0.28 + velocity.value * 0.72;
    },
    onBeginDrag: (e) => {
      lastY.value = e.contentOffset.y;
    },
    onEndDrag: () => {
      velocity.value = withSpring(0, { damping: 20, stiffness: 180 });
    },
    onMomentumEnd: () => {
      velocity.value = withSpring(0, { damping: 22, stiffness: 160 });
    },
  });

  const listMotionStyle = useAnimatedStyle(() => {
    const v = Math.min(velocity.value, 4200);
    const o = interpolate(v, [0, 900, 2600], [1, 0.975, 0.92], Extrapolation.CLAMP);
    const s = interpolate(v, [0, 1100, 2800], [1, 0.997, 0.989], Extrapolation.CLAMP);
    return {
      opacity: o,
      transform: [{ scale: s }],
    };
  });

  return { scrollHandler, listMotionStyle };
}
