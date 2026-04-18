import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedReaction,
  withTiming,
} from 'react-native-reanimated';
import { usePlaybackController } from '@/stores/playbackController';

/**
 * Global chrome: machined hairline under the notch / Dynamic Island.
 * Opacity follows a phase-locked “breath” plus a transport-derived energy proxy
 * (true peak/RMS metering is not exposed for remote streams in expo-av).
 * pointerEvents="none" — does not intercept touches.
 */
export function DynamicIslandChrome() {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const breathOpacity = useSharedValue(0);

  /** Purple/cyan chrome reads as a “glitch” on auth — keep those routes visually clean (#000 stack). */
  const suppressChrome = useMemo(() => {
    const root = segments[0];
    return root === 'sign-in' || root === 'onboarding' || root === 'verify-otp';
  }, [segments]);
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
    if (!isPlaying) return undefined;
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
    if (!isPlaying) return undefined;
    setGhostTime(new Date());
    const id = setInterval(() => setGhostTime(new Date()), 30000);
    return () => clearInterval(id);
  }, [isPlaying]);

  const lineStyle = useAnimatedStyle(() => ({
    opacity: breathOpacity.value,
  }));

  const blurHeight = insets.top + 20;
  const mistInset = 10;

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

  return (
    <Animated.View
      pointerEvents="none"
      collapsable={false}
      style={[
        StyleSheet.absoluteFill,
        {
          top: 0,
          zIndex: 99,
        },
      ]}
    >
      {isPlaying ? (
        <>
          <BlurView
            intensity={Platform.OS === 'ios' ? 14 : 12}
            tint="dark"
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={{
              position: 'absolute',
              top: 0,
              left: mistInset,
              right: mistInset,
              height: blurHeight,
              borderBottomLeftRadius: 20,
              borderBottomRightRadius: 20,
              overflow: 'hidden',
            }}
          />
          <LinearGradient
            colors={['rgba(234,88,12,0.18)', 'rgba(220,38,38,0.1)', 'rgba(251,191,36,0.1)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: 'absolute',
              top: 0,
              left: mistInset,
              right: mistInset,
              height: blurHeight,
              borderBottomLeftRadius: 20,
              borderBottomRightRadius: 20,
            }}
          />
        </>
      ) : null}

      <Animated.View
        style={[
          {
            position: 'absolute',
            top: insets.top,
            left: 0,
            right: 0,
            height: 1,
          },
          lineStyle,
        ]}
      >
        <LinearGradient
          colors={['#EA580C', '#F59E0B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

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
