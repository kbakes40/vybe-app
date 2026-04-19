import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SHADOW_TAB_ACTIVE } from '@/components/navigation/ShadowTabBarIcons';

/** Slightly narrower so eight dock slots stay legible without crowding the cyan line. */
const INDICATOR_W = 15;
const INDICATOR_H = 2;

const SPRING = { damping: 22, stiffness: 300, mass: 0.55 };

/**
 * Default bottom tab bar plus a thin neon “machined” line that springs under the active tab.
 */
export function ShadowMachinedTabBar(props: BottomTabBarProps) {
  const { state, insets } = props;
  const [barWidth, setBarWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const prevBarWidth = useRef(0);

  const n = state.routes.length;
  const idx = state.index;

  useEffect(() => {
    if (barWidth <= 0 || n <= 0) return;
    const ph = Math.max(insets.left, insets.right);
    const inner = barWidth - 2 * ph;
    const seg = inner / n;
    const target = ph + seg * (idx + 0.5) - INDICATOR_W / 2;

    const widthJustMeasured = prevBarWidth.current === 0 && barWidth > 0;
    prevBarWidth.current = barWidth;

    if (widthJustMeasured) {
      indicatorX.value = target;
      return;
    }
    indicatorX.value = withSpring(target, SPRING);
  }, [idx, barWidth, n, insets.left, insets.right]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setBarWidth((prev) => (prev === w ? prev : w));
  };

  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const bottomOffset = Math.max(7, insets.bottom + 3);

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <BottomTabBar {...props} />
      <Animated.View
        pointerEvents="none"
        style={[styles.indicatorHost, { bottom: bottomOffset }, lineStyle]}
      >
        <View style={styles.line} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  indicatorHost: {
    position: 'absolute',
    left: 0,
    width: INDICATOR_W,
    height: INDICATOR_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    width: INDICATOR_W,
    height: INDICATOR_H,
    borderRadius: 1,
    backgroundColor: SHADOW_TAB_ACTIVE,
    shadowColor: SHADOW_TAB_ACTIVE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 4,
    elevation: 6,
  },
});
