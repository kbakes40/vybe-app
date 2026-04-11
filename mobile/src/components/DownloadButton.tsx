import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Pressable, Animated, Dimensions } from 'react-native';
import { Svg, Circle } from 'react-native-svg';
import { Check, XCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { downloadYouTubeTrack, downloadSoundCloudTrack, useDownloadsStore, enqueueDownload } from '@/stores/downloadsStore';
import { triggerFlyAnimation } from '@/lib/flyAnimationEmitter';
import { Track } from '@/types/music';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

// ── LoadingRing ───────────────────────────────────────────────────────────────
// Smooth blue SVG ring that fills 0→90% over ~2.5s. Used as an indeterminate
// placeholder before real download progress starts arriving.
function LoadingRing({ size = 28 }: { size?: number }) {
  const STROKE_WIDTH = 2.5;
  const RADIUS = (size - STROKE_WIDTH) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const DURATION_MS = 2500;
    const TARGET = 0.9;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const next = Math.min(TARGET, (elapsed / DURATION_MS) * TARGET);
      setProgress(next);
      if (next >= TARGET) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={RADIUS}
          stroke="rgba(255,255,255,0.15)" strokeWidth={STROKE_WIDTH} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={RADIUS}
          stroke="#3B82F6" strokeWidth={STROKE_WIDTH} fill="none"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round" rotation="-90"
          origin={`${size / 2}, ${size / 2}`} />
      </Svg>
    </View>
  );
}

// ── DownloadButton ────────────────────────────────────────────────────────────

interface DownloadButtonProps {
  track: Track & { youtubeId?: string; youtubeMusicId?: string; soundcloudUrl?: string };
  size?: number;
  onDownloadComplete?: () => void;
  /**
   * Accent color for the idle download icon (arrow + ring border).
   * If omitted, auto-derives from the track's source:
   *  - youtube / youtube_music → #FF0000 (red)
   *  - soundcloud → #FF7700 (orange)
   *  - other → white at 75%
   */
  idleColor?: string;
}

export function DownloadButton({ track, size = 28, onDownloadComplete, idleColor }: DownloadButtonProps) {
  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);
  const downloaded = isTrackDownloaded(track.id);

  const [progress, setProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [animating, setAnimating] = useState(false);

  // Cached screen position — measured on layout so it's ready synchronously on press
  const containerRef = useRef<View>(null);
  const cachedPos = useRef<{ x: number; y: number }>({
    x: Dimensions.get('window').width / 2,
    y: Dimensions.get('window').height * 0.65,
  });

  const measurePosition = useCallback(() => {
    containerRef.current?.measure((_x, _y, w, h, pageX, pageY) => {
      if (pageX !== undefined && pageY !== undefined) {
        cachedPos.current = { x: pageX + w / 2, y: pageY + h / 2 };
      }
    });
  }, []);

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
      Animated.spring(checkScale, {
        toValue: 1,
        speed: 14,
        bounciness: 14,
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

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsDownloading(true);
    setProgress(0);
    setFailed(false);

    // Trigger root-level overlay — fires immediately, no Modal delay
    triggerFlyAnimation(cachedPos.current.x, cachedPos.current.y);

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
  }, [track, isDownloading, downloaded, animating, runCompletionAnimation, onDownloadComplete]);

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderContent = () => {
    // Already downloaded (static)
    if (downloaded && !animating) {
      return (
        <Animated.View style={{
          width: size, height: size, borderRadius: size / 2,
          backgroundColor: '#22C55E',
          alignItems: 'center', justifyContent: 'center',
          transform: [{ scale: checkScale }],
        }}>
          <Check size={size * 0.55} color="#fff" strokeWidth={3} />
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
                borderWidth: 1.5, borderColor: '#3B82F6',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 1.5, height: size * 0.27, backgroundColor: '#3B82F6', borderRadius: 1 }} />
                  <View style={{
                    width: 0, height: 0,
                    borderLeftWidth: size * 0.18, borderRightWidth: size * 0.18, borderTopWidth: size * 0.18,
                    borderLeftColor: 'transparent', borderRightColor: 'transparent',
                    borderTopColor: '#3B82F6',
                  }} />
                </View>
              </View>
            </Animated.View>
          </Animated.View>
          <Animated.View style={{
            position: 'absolute',
            width: size, height: size, borderRadius: size / 2,
            backgroundColor: '#22C55E',
            alignItems: 'center', justifyContent: 'center',
            transform: [{ scale: checkScale }],
          }}>
            <Check size={size * 0.55} color="#fff" strokeWidth={3} />
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

    // Downloading
    if (isDownloading) {
      if (progress < 0.02) {
        return <LoadingRing size={size} />;
      }
      const strokeDashoffset = CIRCUMFERENCE * (1 - Math.min(progress, 1));
      return (
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            <Circle cx={size / 2} cy={size / 2} r={RADIUS}
              stroke="rgba(255,255,255,0.15)" strokeWidth={2.5} fill="none" />
            <Circle cx={size / 2} cy={size / 2} r={RADIUS}
              stroke="#3B82F6" strokeWidth={2.5} fill="none"
              strokeDasharray={`${CIRCUMFERENCE}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round" rotation="-90"
              origin={`${size / 2}, ${size / 2}`} />
          </Svg>
        </View>
      );
    }

    // Idle
    const derivedColor =
      idleColor ??
      (track.source === 'youtube' || track.source === 'youtube_music'
        ? '#FF0000'
        : track.source === 'soundcloud'
          ? '#FF7700'
          : 'rgba(255,255,255,0.75)');
    // Fade the ring border 20% lower than the arrow for a softer edge.
    const borderColor = derivedColor.startsWith('rgba')
      ? 'rgba(255,255,255,0.35)'
      : derivedColor;
    return (
      <Pressable
        onPress={handleDownload}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <View style={{
          width: size, height: size, borderRadius: size / 2,
          borderWidth: 1.5, borderColor,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 1.5, height: size * 0.27, backgroundColor: derivedColor, borderRadius: 1 }} />
            <View style={{
              width: 0, height: 0,
              borderLeftWidth: size * 0.18, borderRightWidth: size * 0.18, borderTopWidth: size * 0.18,
              borderLeftColor: 'transparent', borderRightColor: 'transparent',
              borderTopColor: derivedColor,
            }} />
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View ref={containerRef} onLayout={measurePosition} collapsable={false}>
      {renderContent()}
    </View>
  );
}
