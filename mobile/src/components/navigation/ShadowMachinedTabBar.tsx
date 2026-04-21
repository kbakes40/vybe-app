import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent, Platform } from 'react-native';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { DOCK_CYAN, OLED_BLACK } from '@/constants/machinedTheme';
import { TAB_BAR_HEIGHT } from '@/constants/Layout';

/** Five-tab doc — indicator tracks active slot. */
const INDICATOR_W = 16;
const INDICATOR_H = 3;

const SPRING = { damping: 22, stiffness: 300, mass: 0.55 };

/** Architectural blur behind the Doc (iOS BlurView intensity; Android uses dark scrim). */
const DOCK_BLUR_INTENSITY = 25;

/**
 * Bottom tab bar (the Doc): OLED #000 base + 25 blur underlay + 1px {@link DOCK_CYAN} top hairline.
 * Renders {@link BottomTabBar} so tabs stay a child of the TabNavigator (never a separate stack).
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

  const dockMinHeight = TAB_BAR_HEIGHT + insets.bottom;
  const bottomOffset = Math.max(7, insets.bottom + 3);

  return (
    <View style={[styles.wrap, { minHeight: dockMinHeight }]} onLayout={onLayout}>
      <View style={[StyleSheet.absoluteFill, styles.oledBase]} pointerEvents="none" />
      {/* Pass taps through — otherwise blur can eat touches in tab strip dead zones. */}
      <BlurView intensity={DOCK_BLUR_INTENSITY} tint="dark" style={StyleSheet.absoluteFill} pointerEvents="none" />
      {Platform.OS === 'android' ? (
        <View style={[StyleSheet.absoluteFill, styles.androidBlurFallback]} pointerEvents="none" />
      ) : null}
      {/* Full-bleed 1px hairline above blur so DOCK_CYAN reads edge-to-edge on 14/15 Pro Max. */}
      <View style={styles.topHairline} pointerEvents="none" />
      <BottomTabBar {...props} />
      <Animated.View
        pointerEvents="none"
        style={[styles.indicatorHost, { bottom: bottomOffset }, lineStyle]}
      >
        <View style={[styles.line, { backgroundColor: DOCK_CYAN, shadowColor: DOCK_CYAN }]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    zIndex: 100000,
    elevation: 100000,
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: OLED_BLACK,
  },
  /** Single 1px DOCK_CYAN line (not hairlineWidth) — full width on 14/15 Pro Max. */
  topHairline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: DOCK_CYAN,
    zIndex: 2,
  },
  /** OLED black under 25-intensity glass blur (Louis 14/15 Pro Max). */
  oledBase: {
    backgroundColor: OLED_BLACK,
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
