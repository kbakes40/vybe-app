import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import { VIBRANT_BLUE, NAVY_TRACK, NAVY_TRACK_ACTIVE } from '@/constants/machinedTheme';

const TRACK_W = 51;
const TRACK_H = 31;
const THUMB = 27;
const PAD = 2;
const TRAVEL = TRACK_W - THUMB - PAD * 2;

type Props = {
  value: boolean;
  onValueChange: (v: boolean) => void;
};

export function ShadowNeonSwitch({ value, onValueChange }: Props) {
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, { damping: 18, stiffness: 220 });
  }, [value, progress]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * TRAVEL }],
    shadowColor: VIBRANT_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35 + progress.value * 0.45,
    shadowRadius: 6 + progress.value * 4,
    elevation: Platform.OS === 'android' ? 2 + progress.value * 4 : 0,
  }));

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [NAVY_TRACK, NAVY_TRACK_ACTIVE]),
    borderColor: interpolateColor(progress.value, [0, 1], ['rgba(0,229,255,0.15)', 'rgba(0,229,255,0.45)']),
  }));

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View
          style={[
            styles.thumb,
            {
              position: 'absolute',
              left: PAD,
              top: (TRACK_H - THUMB) / 2,
            },
            thumbStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    borderWidth: 1,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: VIBRANT_BLUE,
  },
});
