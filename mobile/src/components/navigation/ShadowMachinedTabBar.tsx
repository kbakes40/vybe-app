import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent, Platform } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { VIBRANT_BLUE } from '@/constants/machinedTheme';

/** Five-tab doc — indicator tracks active slot. */
const INDICATOR_W = 16;
const INDICATOR_H = 2;

const SPRING = { damping: 22, stiffness: 300, mass: 0.55 };

/** Blur behind the dock (iOS intensity; Android falls back to dark scrim). */
const DOCK_BLUR_INTENSITY = 25;

/**
 * Bottom tab bar: 25pt-style blur underlay + 1px cyan top hairline (pill-adjacent spec).
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
      <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFill} />
      {Platform.OS === 'android' ? (
        <View style={[StyleSheet.absoluteFill, styles.androidBlurFallback]} pointerEvents="none" />
      ) : null}
      <BottomTabBar {...props} />
      <Animated.View
        pointerEvents="none"
        style={[styles.indicatorHost, { bottom: bottomOffset }, lineStyle]}
      >
        <View style={[styles.line, { backgroundColor: VIBRANT_BLUE, shadowColor: VIBRANT_BLUE }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: VIBRANT_BLUE,
  },
  androidBlurFallback: {
    backgroundColor: 'rgba(0,0,0,0.72)',
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
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 4,
    elevation: 6,
  },
});
