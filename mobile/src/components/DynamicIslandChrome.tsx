import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedReaction,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { usePlaybackController } from '@/stores/playbackController';
import { VYBE_WAVE_PATH, VYBE_WAVE_MAGENTA_LEG } from '@/constants/vybeLogoPaths';
import { islandAlignedTraceTop } from '@/constants/iosIslandLayout';
import { usePillLockStore } from '@/stores/pillLockStore';

const VIBRANT_BLUE = '#00E5FF';
const OUTER_GLOW = '#00B0FF';
const NEON_MAGENTA = '#FF00D4';

/**
 * Global chrome: machined trace under the Dynamic Island — same wave geometry as the app icon.
 * Cyan titanium line + soft #00B0FF bloom + minimal neon magenta “online” pulse on the leading leg.
 * Transport-driven breath modulates overall opacity while playing.
 */
export function DynamicIslandChrome() {
  const insets = useSafeAreaInsets();
  const allowIslandSurfaces = usePillLockStore((s) => s.allowIslandSurfaces);
  const breathOpacity = useSharedValue(0);

  const suppressChrome = !allowIslandSurfaces;
  const [ghostTime, setGhostTime] = useState(() => new Date());
  const lastProgressRef = useRef(0);

  const playbackState = usePlaybackController((s) => s.playbackState);
  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const progress = usePlaybackController((s) => s.progress);
  const duration = usePlaybackController((s) => s.duration);

  const isPlaying = playbackState === 'playing' && currentTrack != null;

  const progressSV = useSharedValue(0);
  const durationSV = useSharedValue(0);
  const playingSV = useSharedValue(0);
  const energySV = useSharedValue(0);

  const magPulse = useSharedValue(1);

  useEffect(() => {
    magPulse.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 720, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 880, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reanimated SV
  }, []);

  useEffect(() => {
    progressSV.value = progress;
  }, [progress, progressSV]);

  useEffect(() => {
    durationSV.value = duration;
  }, [duration, durationSV]);

  useEffect(() => {
    playingSV.value = isPlaying ? 1 : 0;
    if (!isPlaying) {
      lastProgressRef.current = progress;
      energySV.value = withTiming(0, { duration: 380 });
      breathOpacity.value = withTiming(0, { duration: 380 });
    }
  }, [isPlaying, playingSV, breathOpacity, progress, energySV]);

  useEffect(() => {
    if (!isPlaying) return;
    const dp = Math.abs(progress - lastProgressRef.current);
    lastProgressRef.current = progress;
    const spike = Math.min(1, dp * 12 + 0.15);
    energySV.value = Math.min(1, spike * 0.62 + energySV.value * 0.74);
  }, [progress, isPlaying, energySV]);

  useEffect(() => {
    if (!isPlaying) return () => {};
    const id = setInterval(() => {
      energySV.value *= 0.88;
    }, 90);
    return () => clearInterval(id);
  }, [isPlaying, energySV]);

  useAnimatedReaction(
    () => ({
      p: progressSV.value,
      d: durationSV.value,
      on: playingSV.value,
      e: energySV.value,
    }),
    (cur) => {
      if (cur.on === 0) return;
      const phase = cur.d > 1 ? (cur.p / cur.d) * Math.PI * 12 : cur.p * 0.92;
      const wave = 0.52 + 0.26 * Math.sin(phase);
      const peak = 0.2 + 0.8 * cur.e;
      breathOpacity.value = Math.max(0.22, Math.min(0.92, wave * peak));
    },
  );

  useEffect(() => {
    if (!isPlaying) return () => {};
    setGhostTime(new Date());
    const id = setInterval(() => setGhostTime(new Date()), 30000);
    return () => clearInterval(id);
  }, [isPlaying]);

  const traceStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0.34, breathOpacity.value * 0.88 + 0.36)),
  }));

  const magentaStyle = useAnimatedStyle(() => ({
    opacity: magPulse.value * Math.min(1, 0.38 + breathOpacity.value * 0.58),
  }));

  const timeStr = useMemo(
    () =>
      ghostTime.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
    [ghostTime],
  );

  if (suppressChrome) {
    return null;
  }

  const w = 96;
  const h = 22;
  const traceTop = islandAlignedTraceTop(insets.top, h);

  return (
    <Animated.View
      pointerEvents="none"
      collapsable={false}
      style={[
        StyleSheet.absoluteFill,
        {
          top: 0,
          zIndex: 9999,
          elevation: 9999,
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: traceTop,
          left: 0,
          right: 0,
          alignItems: 'center',
          height: h,
        }}
      >
        <Animated.View style={[{ width: w, height: h }, traceStyle]}>
          <Svg width={w} height={h} viewBox="0 15 100 55">
            <Path
              d={VYBE_WAVE_PATH}
              stroke={OUTER_GLOW}
              strokeWidth={1.4}
              strokeLinecap="round"
              fill="none"
              opacity={0.08}
            />
            <Path
              d={VYBE_WAVE_PATH}
              stroke={VIBRANT_BLUE}
              strokeWidth={1.05}
              strokeLinecap="round"
              fill="none"
              opacity={0.55}
            />
          </Svg>
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', width: w, height: h, top: 0 }, magentaStyle]}
        >
          <Svg width={w} height={h} viewBox="0 15 100 55">
            <Path
              d={VYBE_WAVE_MAGENTA_LEG}
              stroke={NEON_MAGENTA}
              strokeWidth={0.75}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
      </View>

      {isPlaying ? (
        <Text
          style={{
            position: 'absolute',
            top: Platform.OS === 'ios' ? 8 : Math.min(insets.top - 4, 12),
            left: insets.left + 18,
            fontSize: 13,
            fontWeight: '900',
            fontVariant: ['tabular-nums'],
            color: 'rgba(245,245,250,0.09)',
            letterSpacing: 0.35,
          }}
        >
          {timeStr}
        </Text>
      ) : null}
    </Animated.View>
  );
}
