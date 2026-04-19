import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * Minimal "HAHA VENDING" silhouette — 90s G-Funk decade easter egg used for
 * empty / loading chrome. The whole silhouette flickers like a dying neon
 * sign: two irregular dips in the signage (HAHA + VENDING) loop independently
 * so it reads as broken vending machine glow, not a steady fade.
 */
export function HahaVendingSilhouette({ compact }: { compact?: boolean }) {
  const frame = useSharedValue(0.22);
  const hahaSV = useSharedValue(0.9);
  const vendSV = useSharedValue(0.55);

  useEffect(() => {
    // Frame: gentle base pulse so the whole egg breathes slowly.
    frame.value = withRepeat(
      withSequence(
        withTiming(0.28, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.2, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );

    // HAHA: hard flicker — short dark blips, slightly offset from VENDING.
    hahaSV.value = withRepeat(
      withSequence(
        withTiming(0.9, { duration: 640 }),
        withTiming(0.18, { duration: 60 }),
        withTiming(0.9, { duration: 90 }),
        withTiming(0.35, { duration: 50 }),
        withTiming(0.9, { duration: 1200 }),
        withTiming(0.5, { duration: 220 }),
        withTiming(0.9, { duration: 900 }),
      ),
      -1,
      false,
    );

    // VENDING: dimmer + delayed flicker so the two signs feel independent.
    vendSV.value = withDelay(
      420,
      withRepeat(
        withSequence(
          withTiming(0.55, { duration: 1500 }),
          withTiming(0.12, { duration: 70 }),
          withTiming(0.55, { duration: 110 }),
          withTiming(0.28, { duration: 180 }),
          withTiming(0.55, { duration: 1400 }),
        ),
        -1,
        false,
      ),
    );
  }, [frame, hahaSV, vendSV]);

  const wrapStyle = useAnimatedStyle(() => ({ opacity: frame.value }));
  const hahaStyle = useAnimatedStyle(() => ({ opacity: hahaSV.value }));
  const vendStyle = useAnimatedStyle(() => ({ opacity: vendSV.value }));

  return (
    <Animated.View
      style={[styles.wrap, compact && styles.wrapCompact, wrapStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.machine}>
        <View style={styles.slot} />
        <View style={styles.knob} />
      </View>
      <Animated.Text style={[styles.haha, hahaStyle]}>HAHA</Animated.Text>
      <Animated.Text style={[styles.vend, vendStyle]}>VENDING</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  wrapCompact: {
    paddingVertical: 8,
  },
  machine: {
    width: 44,
    height: 56,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
    marginBottom: 10,
    alignItems: 'center',
    paddingTop: 8,
  },
  slot: {
    width: 28,
    height: 4,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 10,
  },
  knob: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  haha: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 4,
  },
  vend: {
    marginTop: 2,
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
  },
});
