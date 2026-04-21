import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { PILL_CYAN } from '@/constants/garagebandLibrary';
import type { VinylHeroRect } from '@/stores/vinylHeroTransitionStore';

/** True 33⅓ RPM ≈ 200°/s — scaled down for a calmer on-screen spin. */
const VINYL_SPIN_SPEED_SCALE = 0.58;
const PLAY_DEG_PER_SEC = ((360 * 100) / 3 / 60) * VINYL_SPIN_SPEED_SCALE;

type RotatingVinylProps = {
  artworkUri: string;
  diameter: number;
  isPlaying: boolean;
  trackId: string;
  /** One-shot: scale up from Home carousel disc size. */
  heroFromRect?: VinylHeroRect | null;
};

function VinylGrooveOverlay({ diameter }: { diameter: number }) {
  const cx = diameter / 2;
  const cy = diameter / 2;
  const rings = [0.42, 0.52, 0.62, 0.72, 0.82, 0.92].map((t) => (diameter / 2) * t);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={diameter} height={diameter}>
        {rings.map((r, i) => (
          <Circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            stroke={PILL_CYAN}
            strokeWidth={i % 2 === 0 ? 0.55 : 0.35}
            opacity={0.22 + (i % 3) * 0.06}
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

export function RotatingVinyl({
  artworkUri,
  diameter,
  isPlaying,
  trackId,
  heroFromRect,
}: RotatingVinylProps) {
  const angleDeg = useSharedValue(0);
  const speedDegPerSec = useSharedValue(0);
  const playingSv = useSharedValue(isPlaying ? 1 : 0);

  const scale = useSharedValue(1);

  useEffect(() => {
    angleDeg.value = 0;
  }, [trackId, angleDeg]);

  useEffect(() => {
    playingSv.value = isPlaying ? 1 : 0;
    if (isPlaying) {
      speedDegPerSec.value = PLAY_DEG_PER_SEC;
    }
  }, [isPlaying, playingSv, speedDegPerSec]);

  useFrameCallback((frame) => {
    'worklet';
    const dt = frame.timeSincePreviousFrame ?? 16.67;
    if (playingSv.value === 1) {
      speedDegPerSec.value = PLAY_DEG_PER_SEC;
      angleDeg.value += (speedDegPerSec.value * dt) / 1000;
    } else {
      const s = speedDegPerSec.value;
      if (Math.abs(s) < 0.35) {
        speedDegPerSec.value = 0;
        return;
      }
      angleDeg.value += (s * dt) / 1000;
      const decay = Math.pow(0.94, dt / 16.67);
      speedDegPerSec.value *= decay;
    }
  }, true);

  useEffect(() => {
    return () => {
      cancelAnimation(angleDeg);
    };
  }, [angleDeg]);

  useEffect(() => {
    if (!heroFromRect || heroFromRect.width <= 0) {
      scale.value = 1;
      return;
    }
    scale.value = Math.max(0.42, Math.min(0.92, heroFromRect.width / diameter));
    scale.value = withSpring(1, { damping: 22, stiffness: 150 });
  }, [heroFromRect, diameter, scale]);

  /** Label (art) spins on-axis; hero scale wraps the whole disc. */
  const labelSpinStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${angleDeg.value}deg` }],
  }));

  const heroScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const sleevePad = Math.round(diameter * 0.08);
  const sleeveW = diameter + sleevePad * 2;
  const sleeveH = diameter + sleevePad * 2 + 10;

  return (
    <View style={{ width: sleeveW, height: sleeveH, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 4,
          height: sleeveH - 4,
          borderRadius: 20,
          backgroundColor: '#0a0b0d',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      />
      <Animated.View style={heroScaleStyle}>
        <View
          style={{
            width: diameter,
            height: diameter,
            borderRadius: diameter / 2,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: PILL_CYAN,
            backgroundColor: '#111',
          }}
        >
          <Animated.View
            style={[
              labelSpinStyle,
              {
                position: 'absolute',
                left: 0,
                top: 0,
                width: diameter,
                height: diameter,
              },
            ]}
          >
            {artworkUri ? (
              <Image
                source={{ uri: artworkUri }}
                style={{ width: diameter, height: diameter }}
                contentFit="cover"
                cachePolicy="memory-disk"
                priority="high"
                allowDownscaling={false}
                recyclingKey={`vinyl-label-${trackId}`}
              />
            ) : null}
          </Animated.View>
          <VinylGrooveOverlay diameter={diameter} />
        </View>
      </Animated.View>
    </View>
  );
}
