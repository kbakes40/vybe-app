import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Flame, Speaker } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
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
import { useThemeStore } from '@/stores/themeStore';
import { hexToRgb } from '@/lib/themeColorUtils';

const HIT = 44;
const SPARK_COUNT = 7;
const SPARK_SIZE = 5;

const IS_ANDROID = Platform.OS === 'android';

function sparkAnglesForBurst(seed: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const base = (i / SPARK_COUNT) * Math.PI * 2 - Math.PI / 2;
    const jitter = (((seed * 9301 + 49297 + i * 17) % 233) / 233 - 0.5) * 0.85;
    out.push(base + jitter);
  }
  return out;
}

function SparkParticle({
  burst,
  angle,
  color,
  distance,
}: {
  burst: SharedValue<number>;
  angle: number;
  color: string;
  distance: number;
}) {
  const style = useAnimatedStyle(() => {
    const t = burst.value;
    const d = distance * t;
    const up = -14 * t;
    return {
      opacity: interpolate(t, [0, 0.12, 1], [0, 1, 0]),
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
          backgroundColor: color,
          left: HIT / 2 - SPARK_SIZE / 2,
          top: HIT / 2 - SPARK_SIZE / 2,
        },
        style,
      ]}
    />
  );
}

function SparkBurstLayer({
  burst,
  angles,
  color,
  distance,
}: {
  burst: SharedValue<number>;
  angles: number[];
  color: string;
  distance: number;
}) {
  return (
    <>
      {angles.map((angle, idx) => (
        <SparkParticle key={`sp-${idx}`} burst={burst} angle={angle} color={color} distance={distance} />
      ))}
    </>
  );
}

type FireProps = {
  count: number;
  onPress: () => void;
};

const FIRE_MUTED = 'rgba(180, 130, 100, 0.5)';

export function FireReactionButton({ count, onPress }: FireProps) {
  const accentHex = useThemeStore((s) => s.accentColor);
  const accentR = useSharedValue(0);
  const accentG = useSharedValue(255);
  const accentB = useSharedValue(255);
  useEffect(() => {
    const { r, g, b } = hexToRgb(accentHex);
    accentR.value = r;
    accentG.value = g;
    accentB.value = b;
  }, [accentHex, accentR, accentG, accentB]);

  const scale = useSharedValue(1);
  const heat = useSharedValue(0);
  const burst = useSharedValue(0);
  const pressed = useSharedValue(false);
  const glowPulse = useSharedValue(0);
  const angles = useMemo(() => sparkAnglesForBurst(Math.floor(Math.random() * 1_000_000_000)), []);

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

  const iconScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowWrapStyle = useAnimatedStyle(() => {
    const g = Math.max(glowPulse.value, heat.value * 0.95);
    const rim = `rgb(${Math.round(accentR.value)}, ${Math.round(accentG.value)}, ${Math.round(accentB.value)})`;
    return {
      shadowColor: rim,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.55 + g * 0.4,
      shadowRadius: 6 + g * 16,
      ...(IS_ANDROID ? { elevation: 4 + g * 10 } : {}),
    };
  });

  const gradientStyle = useAnimatedStyle(() => ({
    opacity: heat.value * 0.95,
  }));

  const hotFlameStyle = useAnimatedStyle(() => ({
    opacity: heat.value,
  }));

  const trigger = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    burst.value = 0;
    burst.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withSpring(1.4, { damping: 10, stiffness: 380 }),
      withSpring(1, { damping: 10, stiffness: 420 }),
    );
    heat.value = withSequence(
      withTiming(1, { duration: 90 }),
      withTiming(0.88, { duration: 280 }),
      withTiming(0, { duration: 380 }),
    );
    onPress();
  }, [burst, heat, onPress, scale]);

  return (
    <View style={styles.row}>
      <Pressable
        onPressIn={() => {
          pressed.value = true;
        }}
        onPressOut={() => {
          pressed.value = false;
        }}
        onPress={trigger}
        style={styles.hit}
        accessibilityRole="button"
        accessibilityLabel="Fire reaction"
      >
        <View style={styles.iconBox}>
          <SparkBurstLayer burst={burst} angles={angles} color="#FFFF99" distance={40} />
          <Animated.View style={[styles.fireIconWrap, glowWrapStyle, iconScaleStyle]}>
            <Animated.View style={[styles.gradientBehind, gradientStyle]} pointerEvents="none">
              <LinearGradient
                colors={['#FF4500', '#FFFF00']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradientBlob}
              />
            </Animated.View>
            <View style={styles.flameStack}>
              <Flame size={22} color={FIRE_MUTED} strokeWidth={2} />
              <Animated.View style={[styles.flameHot, hotFlameStyle]} pointerEvents="none">
                <Flame size={22} color="#FF4500" strokeWidth={2.2} />
              </Animated.View>
            </View>
          </Animated.View>
        </View>
      </Pressable>
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

type SpeakerProps = {
  count: number;
  onPress: () => void;
};

const SPEAKER_MUTED = 'rgba(148, 163, 184, 0.55)';

export function CyanSpeakerReactionButton({ count, onPress }: SpeakerProps) {
  const accent = useThemeStore((s) => s.accentColor);
  const scale = useSharedValue(1);
  const ripple = useSharedValue(0);
  const burst = useSharedValue(0);
  const pressed = useSharedValue(false);
  const glowPulse = useSharedValue(0);
  const angles = useMemo(() => sparkAnglesForBurst(Math.floor(Math.random() * 1_000_000_000) + 777), []);

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

  const iconScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ripple.value, [0, 0.25, 1], [0.65, 0.35, 0]),
    transform: [{ scale: interpolate(ripple.value, [0, 1], [0.6, 2.2]) }],
  }));

  const glowWrapStyle = useAnimatedStyle(() => {
    const g = Math.max(glowPulse.value, ripple.value * 0.5);
    return {
      shadowColor: accent,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45 + g * 0.45,
      shadowRadius: 5 + g * 14,
      ...(IS_ANDROID ? { elevation: 3 + g * 10 } : {}),
    };
  }, [accent]);

  const hotIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ripple.value, [0, 0.15, 1], [0, 1, 0.85]),
  }));

  const trigger = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    burst.value = 0;
    burst.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    ripple.value = 0;
    ripple.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withSpring(1.4, { damping: 10, stiffness: 380 }),
      withSpring(1, { damping: 10, stiffness: 420 }),
    );
    onPress();
  }, [burst, onPress, ripple, scale]);

  return (
    <View style={styles.row}>
      <Pressable
        onPressIn={() => {
          pressed.value = true;
        }}
        onPressOut={() => {
          pressed.value = false;
        }}
        onPress={trigger}
        style={styles.hit}
        accessibilityRole="button"
        accessibilityLabel="Speaker reaction"
      >
        <View style={styles.iconBox}>
          <SparkBurstLayer burst={burst} angles={angles} color={accent} distance={38} />
          <Animated.View style={[styles.speakerIconWrap, glowWrapStyle, iconScaleStyle]}>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.rippleRing,
                { borderColor: accent },
                rippleStyle,
              ]}
            />
            <View style={styles.speakerStack}>
              <Speaker size={22} color={SPEAKER_MUTED} strokeWidth={2} />
              <Animated.View style={[styles.speakerHot, hotIconStyle]} pointerEvents="none">
                <Speaker size={22} color={accent} strokeWidth={2.2} />
              </Animated.View>
            </View>
          </Animated.View>
        </View>
      </Pressable>
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hit: {
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBox: {
    width: HIT,
    height: HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fireIconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientBehind: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientBlob: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  flameStack: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameHot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerIconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rippleRing: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    left: -3,
    top: -3,
  },
  speakerStack: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerHot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '700',
    minWidth: 20,
    marginLeft: 6,
  },
});
