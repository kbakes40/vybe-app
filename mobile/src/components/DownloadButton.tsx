import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Pressable, Animated, StyleSheet, Easing, Platform } from 'react-native';
import { Svg, Circle, Path } from 'react-native-svg';
import { XCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { VIBRANT_BLUE, NEON_IOS_SHADOW } from '@/constants/machinedTheme';
import { MachinedCloudIcon } from '@/components/MachinedCloudIcon';
import { downloadYouTubeTrack, downloadSoundCloudTrack, useDownloadsStore, enqueueDownload } from '@/stores/downloadsStore';
import { ensurePrefetchListeners, usePrefetchStore } from '@/stores/prefetchStore';
import { Track } from '@/types/music';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

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
        backgroundColor: 'rgba(4,14,22,0.94)',
        borderWidth: 1,
        borderColor: VIBRANT_BLUE,
        alignItems: 'center',
        justifyContent: 'center',
        ...(Platform.OS === 'ios' ? NEON_IOS_SHADOW : { elevation: 10 }),
      }}
    >
      <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
        <Path
          d="M5.5 12.5 L10 17 L18.5 8.5"
          fill="none"
          stroke={VIBRANT_BLUE}
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

export function DownloadButton({ track, size = 28, onDownloadComplete, chrome = 'brand', idleColor }: DownloadButtonProps) {
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

  const handleDownload = useCallback(() => {
    if (isDownloading || downloaded || animating) return;
    const hasYt = !!(track.youtubeId || track.youtubeMusicId);
    const hasSc = !!track.soundcloudUrl;
    if (!hasYt && !hasSc) return;

    void Haptics.impactAsync(
      chrome === 'ghost' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium,
    );
    setIsDownloading(true);
    setProgress(0);
    setFailed(false);

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
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
  }, [track, isDownloading, downloaded, animating, runCompletionAnimation, onDownloadComplete, chrome]);

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
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 1.25, height: size * 0.27, backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 1 }} />
                  <View style={{
                    width: 0, height: 0,
                    borderLeftWidth: size * 0.18, borderRightWidth: size * 0.18, borderTopWidth: size * 0.18,
                    borderLeftColor: 'transparent', borderRightColor: 'transparent',
                    borderTopColor: 'rgba(255,255,255,0.55)',
                  }} />
                </View>
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

    // Idle — glowing machined cyan cloud (#00E5FF) for all vault / sync affordances
    const cloudSize = Math.max(18, Math.round(size * 0.82));
    return (
      <Pressable
        onPress={handleDownload}
        accessibilityLabel="Import to Vault"
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MachinedCloudIcon size={cloudSize} strokeWidth={1.65} />
      </Pressable>
    );
  };

  return <>{renderContent()}</>;
}
