import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Pressable, Animated, StyleSheet, Easing, Platform } from 'react-native';
import { Svg, Circle, Path } from 'react-native-svg';
import { XCircle, Cloud } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AnimatedRN, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { downloadYouTubeTrack, downloadSoundCloudTrack, useDownloadsStore, enqueueDownload } from '@/stores/downloadsStore';
import { ensurePrefetchListeners, usePrefetchStore } from '@/stores/prefetchStore';
import { Track } from '@/types/music';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

const CYAN_GLOW = '#00FFFF';
const CLOUD_OUTLINE = 'rgba(255,255,255,0.95)';

const AnimatedPressableRN = AnimatedRN.createAnimatedComponent(Pressable);

/** “Shadow” palette — stealth, not corporate blue/green */
const SHADOW = {
  pillBg: 'rgba(6,6,8,0.92)',
  pillBorder: 'rgba(255,255,255,0.14)',
  vStroke: 'rgba(255,255,255,0.48)',
  ringTrack: 'rgba(255,255,255,0.1)',
  ringSweep: 'rgba(255,255,255,0.52)',
  ringProgress: 'rgba(255,255,255,0.65)',
  prefetchAccent: 'rgba(255,255,255,0.38)',
} as const;

// ── ShadowSavedMark ───────────────────────────────────────────────────────────
/** Dark pill + minimal V (story-led / “machinery” — not a social check badge) */
export function ShadowSavedMark({ size }: { size: number }) {
  const stroke = Math.max(1.15, size * 0.085);
  const glyph = size * 0.42;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: SHADOW.pillBg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: SHADOW.pillBorder,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
        <Path
          d="M5.5 12.5 L10 17 L18.5 8.5"
          fill="none"
          stroke={SHADOW.vStroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

// ── GhostSweepRing ─────────────────────────────────────────────────────────────
/** Indeterminate thin ring — white segment sweeps (radar / precision instrument) */
export function GhostSweepRing({ size = 28 }: { size?: number }) {
  const STROKE = Math.max(1, size * 0.045);
  const R = (size - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const arc = C * 0.24;
  const rot = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rot, {
        toValue: 1,
        duration: 1050,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [rot]);

  const spin = rot.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ width: size, height: size, transform: [{ rotate: spin }] }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke={SHADOW.ringTrack}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke={SHADOW.ringSweep}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${arc} ${C}`}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
    </Animated.View>
  );
}

// ── DownloadButton ────────────────────────────────────────────────────────────

interface DownloadButtonProps {
  track: Track & { youtubeId?: string; youtubeMusicId?: string; soundcloudUrl?: string };
  size?: number;
  onDownloadComplete?: () => void;
  /**
   * `ghost` — OLED outline (transparent fill, thin white ring) + light haptic on enqueue.
   * `brand` — source-colored ring (default).
   */
  chrome?: 'brand' | 'ghost';
  /**
   * Accent color for the idle download icon (arrow + ring border).
   * If omitted, auto-derives from the track's source:
   *  - youtube / youtube_music → #FF0000 (red)
   *  - soundcloud → #FF7700 (orange)
   *  - other → white at 75%
   */
  idleColor?: string;
}

export function DownloadButton({
  track,
  size = 28,
  onDownloadComplete,
  chrome = 'brand',
  idleColor: _idleColor,
}: DownloadButtonProps) {
  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);
  const downloaded = isTrackDownloaded(track.id);
  const prefetchReady = usePrefetchStore(s => s.byTrackId[track.id]?.ready ?? false);
  const prefetchProgress = usePrefetchStore(s => s.byTrackId[track.id]?.progress ?? 0);

  useEffect(() => {
    ensurePrefetchListeners();
  }, []);

  useEffect(() => {
    if (downloaded) {
      usePrefetchStore.getState().removeTrack(track.id);
    }
  }, [downloaded, track.id]);

  const [progress, setProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Spin (0→1 = 0°→360°)
  const spinAnim = useRef(new Animated.Value(0)).current;
  // Fly-into-folder: translate down then vanish
  const flyY = useRef(new Animated.Value(0)).current;
  const flyScale = useRef(new Animated.Value(1)).current;
  const flyOpacity = useRef(new Animated.Value(1)).current;
  // Check pop-in
  const checkScale = useRef(new Animated.Value(downloaded ? 1 : 0)).current;

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const runCompletionAnimation = useCallback(() => {
    setAnimating(true);
    spinAnim.setValue(0);
    flyY.setValue(0);
    flyScale.setValue(1);
    flyOpacity.setValue(1);
    checkScale.setValue(0);

    Animated.sequence([
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(flyY, {
          toValue: size * 1.2,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(flyScale, {
          toValue: 0.1,
          duration: 480,
          useNativeDriver: true,
        }),
        Animated.timing(flyOpacity, {
          toValue: 0,
          duration: 360,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(100),
      Animated.timing(checkScale, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setAnimating(false);
    });
  }, [spinAnim, flyY, flyScale, flyOpacity, checkScale, size]);

  const RADIUS = (size - 4) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const cloudScale = useSharedValue(1);
  const rain0 = useSharedValue(0);
  const rain1 = useSharedValue(0);
  const rain2 = useSharedValue(0);
  const rainOpacity = useSharedValue(0);

  const triggerRain = useCallback(() => {
    rain0.value = 0;
    rain1.value = 0;
    rain2.value = 0;
    rainOpacity.value = 1;
    rain0.value = withTiming(10, { duration: 280 });
    rain1.value = withDelay(70, withTiming(10, { duration: 280 }));
    rain2.value = withDelay(140, withTiming(10, { duration: 280 }));
    rainOpacity.value = withSequence(
      withTiming(1, { duration: 50 }),
      withTiming(0, { duration: 350 })
    );
  }, [rain0, rain1, rain2, rainOpacity]);

  const cloudPressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cloudScale.value }],
  }));

  const rainStyle0 = useAnimatedStyle(() => ({
    opacity: rainOpacity.value,
    transform: [{ translateY: rain0.value }],
  }));
  const rainStyle1 = useAnimatedStyle(() => ({
    opacity: rainOpacity.value,
    transform: [{ translateY: rain1.value }],
  }));
  const rainStyle2 = useAnimatedStyle(() => ({
    opacity: rainOpacity.value,
    transform: [{ translateY: rain2.value }],
  }));

  const handleDownload = useCallback(() => {
    if (isDownloading || downloaded || animating) return;
    const hasYt = !!(track.youtubeId || track.youtubeMusicId);
    const hasSc = !!track.soundcloudUrl;
    if (!hasYt && !hasSc) return;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cloudScale.value = withSequence(
      withTiming(1.3, { duration: 90 }),
      withTiming(1, { duration: 220 })
    );
    triggerRain();

    setIsDownloading(true);
    setProgress(0);
    setFailed(false);

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    enqueueDownload(track.id, async () => {
      let succeeded = false;
      try {
        let result: { success: boolean; error?: string };
        if (hasSc) {
          result = await downloadSoundCloudTrack(track, BACKEND_URL, setProgress);
        } else {
          result = await downloadYouTubeTrack(track, BACKEND_URL, setProgress);
        }
        if (result.success) {
          succeeded = true;
          setIsDownloading(false);
          setProgress(0);
          runCompletionAnimation();
          onDownloadComplete?.();
        } else {
          setFailed(true);
          setTimeout(() => setFailed(false), 3000);
        }
      } catch (e) {
        console.error('[DownloadButton] failed', e);
        setFailed(true);
        setTimeout(() => setFailed(false), 3000);
      } finally {
        if (!succeeded) {
          setIsDownloading(false);
          setProgress(0);
        }
      }
    });
  }, [track, isDownloading, downloaded, animating, runCompletionAnimation, onDownloadComplete, cloudScale, triggerRain]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderContent = () => {
    // Already downloaded (static)
    if (downloaded && !animating) {
      return (
        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <ShadowSavedMark size={size} />
        </Animated.View>
      );
    }

    // Completion animation playing
    if (animating) {
      return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={{
            position: 'absolute',
            opacity: flyOpacity,
            transform: [{ translateY: flyY }, { scale: flyScale }],
          }}>
            <Animated.View style={{
              width: size, height: size,
              alignItems: 'center', justifyContent: 'center',
              transform: [{ rotate: spin }],
            }}>
              <View style={{
                width: size, height: size, borderRadius: size / 2,
                borderWidth: 1.25, borderColor: 'rgba(255,255,255,0.35)',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Cloud size={Math.max(14, size * 0.55)} color="rgba(255,255,255,0.65)" strokeWidth={1} />
              </View>
            </Animated.View>
          </Animated.View>
          <Animated.View
            style={{
              position: 'absolute',
              transform: [{ scale: checkScale }],
            }}
          >
            <ShadowSavedMark size={size} />
          </Animated.View>
        </View>
      );
    }

    // Failed
    if (failed) {
      return (
        <Pressable onPress={handleDownload} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <XCircle size={size} color="#EF4444" />
        </Pressable>
      );
    }

    // Native prefetch finished (instant-play buffer) — full file not saved yet
    if (prefetchReady && !downloaded && !animating) {
      return (
        <Pressable
          onPress={handleDownload}
          style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ShadowSavedMark size={size} />
        </Pressable>
      );
    }

    // Prefetch in flight (Gold Gate ring)
    const prefetching =
      !downloaded &&
      !animating &&
      prefetchProgress > 0 &&
      prefetchProgress < 1 &&
      !prefetchReady;
    if (prefetching) {
      const strokeDashoffset = CIRCUMFERENCE * (1 - Math.min(Math.max(prefetchProgress, 0.06), 0.98));
      return (
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={RADIUS}
              stroke={SHADOW.ringTrack} strokeWidth={1.35} fill="none" />
            <Circle cx={size / 2} cy={size / 2} r={RADIUS}
              stroke={SHADOW.prefetchAccent} strokeWidth={1.35} fill="none"
              strokeDasharray={`${CIRCUMFERENCE}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round" rotation="-90"
              origin={`${size / 2}, ${size / 2}`} />
          </Svg>
        </View>
      );
    }

    // Downloading
    if (isDownloading) {
      if (progress < 0.02) {
        return <GhostSweepRing size={size} />;
      }
      const strokeW = Math.max(1, size * 0.045);
      const rProg = (size - strokeW) / 2;
      const circProg = 2 * Math.PI * rProg;
      const strokeDashoffset = circProg * (1 - Math.min(progress, 1));
      return (
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={rProg}
              stroke={SHADOW.ringTrack} strokeWidth={strokeW} fill="none" />
            <Circle cx={size / 2} cy={size / 2} r={rProg}
              stroke={SHADOW.ringProgress} strokeWidth={strokeW} fill="none"
              strokeDasharray={`${circProg}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round" rotation="-90"
              origin={`${size / 2}, ${size / 2}`} />
          </Svg>
        </View>
      );
    }

    // Idle — minimalist cloud + cyan rain on press
    const outline = chrome === 'ghost' ? 'rgba(255,255,255,0.78)' : CLOUD_OUTLINE;
    void _idleColor; // cloud chrome is fixed white/cyan per Shadow Sexy
    const cloudSz = Math.max(18, Math.round(size * 0.78));
    return (
      <AnimatedPressableRN
        onPress={handleDownload}
        accessibilityLabel="Keep offline"
        style={[
          {
            width: size + 8,
            height: size + 8,
            alignItems: 'center',
            justifyContent: 'center',
          },
          cloudPressStyle,
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={{ alignItems: 'center', justifyContent: 'center', width: size + 8, height: size + 8 }}>
          <Cloud
            size={cloudSz}
            color={outline}
            strokeWidth={1}
            style={{
              shadowColor: CYAN_GLOW,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.5,
              shadowRadius: 8,
              ...Platform.select({ android: { elevation: 6 } }),
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 2,
              flexDirection: 'row',
              gap: 5,
              justifyContent: 'center',
              width: size + 8,
            }}
          >
            <AnimatedRN.View
              style={[
                { width: 3, height: 3, borderRadius: 1.5, backgroundColor: CYAN_GLOW },
                rainStyle0,
              ]}
            />
            <AnimatedRN.View
              style={[
                { width: 3, height: 3, borderRadius: 1.5, backgroundColor: CYAN_GLOW },
                rainStyle1,
              ]}
            />
            <AnimatedRN.View
              style={[
                { width: 3, height: 3, borderRadius: 1.5, backgroundColor: CYAN_GLOW },
                rainStyle2,
              ]}
            />
          </View>
        </View>
      </AnimatedPressableRN>
    );
  };

  return <>{renderContent()}</>;
}
