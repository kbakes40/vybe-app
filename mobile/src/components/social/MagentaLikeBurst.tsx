import React, { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Heart } from 'lucide-react-native';
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  cancelAnimation,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const HIT = 48;
const BURST_ANGLES = Array.from({ length: 8 }, (_, i) => (i * Math.PI * 2) / 8);
const BURST_DISTANCE = 30;
const SPARK_SIZE = 4;

function MagentaSpark({
  burst,
  angle,
  distance,
}: {
  burst: SharedValue<number>;
  angle: number;
  distance: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = burst.value;
    const d = distance * t;
    const up = -16 * t;
    return {
      opacity: interpolate(t, [0, 0.1, 1], [0, 1, 0]),
      transform: [
        { translateX: Math.cos(angle) * d },
        { translateY: Math.sin(angle) * d + up },
      ],
    };
  }, [angle, distance]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: SPARK_SIZE,
          height: SPARK_SIZE,
          borderRadius: SPARK_SIZE / 2,
          backgroundColor: '#FF00FF',
          left: HIT / 2 - SPARK_SIZE / 2,
          top: HIT / 2 - SPARK_SIZE / 2,
        },
        style,
      ]}
    />
  );
}

type Props = {
  liked: boolean;
  onToggle: () => void;
  iconSize?: number;
};

/**
 * Magenta heart — Reanimated spring, Success haptic on like, hold-glow pulse, particle burst.
 */
export function MagentaLikeBurst({ liked, onToggle, iconSize = 22 }: Props) {
  const scale = useSharedValue(1);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0);
  const burst = useSharedValue(0);
  const pressed = useSharedValue(false);
  const glowPulse = useSharedValue(0);
  const likedSv = useSharedValue(liked);

  useEffect(() => {
    likedSv.value = liked;
  }, [liked, likedSv]);

  useAnimatedReaction(
    () => pressed.value,
    (p, prev) => {
      if (p === prev) return;
      if (p) {
        glowPulse.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 200, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.35, { duration: 200, easing: Easing.inOut(Easing.sin) }),
          ),
          -1,
          true,
        );
      } else {
        cancelAnimation(glowPulse);
        glowPulse.value = withTiming(0, { duration: 160 });
      }
    },
    [],
  );

  const heartScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const heartGlowStyle = useAnimatedStyle(() => {
    const on = likedSv.value;
    const g = glowPulse.value;
    const baseOp = on ? 0.62 : 0;
    const baseRad = on ? 10 : 2;
    const baseEl = on ? 8 : 0;
    return {
      shadowColor: '#FF00FF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: Math.min(1, baseOp + g * 0.38),
      shadowRadius: baseRad + g * 12,
      ...Platform.select({
        android: { elevation: baseEl + g * 8 },
        default: {},
      }),
    };
  });

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  const runLikeAnimation = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    burst.value = 0;
    burst.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withSpring(1.35, { damping: 10, stiffness: 400 }),
      withSpring(1, { damping: 10, stiffness: 440 }),
    );
    ringScale.value = 1;
    ringOpacity.value = 0;
    ringScale.value = withSequence(
      withTiming(1.55, { duration: 220 }),
      withTiming(1, { duration: 40 }),
    );
    ringOpacity.value = withSequence(
      withTiming(1, { duration: 90 }),
      withTiming(0, { duration: 130 }),
    );
  }, [burst, ringOpacity, ringScale, scale]);

  return (
    <Pressable
      onPressIn={() => {
        pressed.value = true;
      }}
      onPressOut={() => {
        pressed.value = false;
      }}
      onPress={() => {
        if (liked) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onToggle();
          return;
        }
        runLikeAnimation();
        onToggle();
      }}
      style={styles.hit}
      accessibilityRole="button"
      accessibilityLabel={liked ? 'Unlike' : 'Like'}
    >
      {BURST_ANGLES.map((angle, idx) => (
        <MagentaSpark key={`m-${idx}`} burst={burst} angle={angle} distance={BURST_DISTANCE} />
      ))}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            left: HIT / 2 - 13,
            top: HIT / 2 - 13,
          },
          ringStyle,
        ]}
      />
      <Animated.View style={[heartGlowStyle, heartScaleStyle, styles.heartCenter]}>
        <Heart
          size={iconSize}
          color={liked ? '#FF00FF' : 'rgba(255,255,255,0.85)'}
          fill={liked ? '#FF00FF' : 'transparent'}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#FF00FF',
    backgroundColor: 'transparent',
  },
});
