import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { usePlaybackController } from '@/stores/playbackController';
import { formatDuration } from '@/data/mockData';

function normalizePlaybackSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 100000 ? value / 1000 : value;
}

export type SeekScrubBarProps = {
  /** Total width of the scrub track (e.g. screen width minus horizontal padding). */
  width: number;
  /** When false, hides elapsed / remaining labels (for compact list rows). */
  showTimes?: boolean;
};

/**
 * Shared scrubber — matches Now Playing: track-change forces scrub to 0 immediately
 * (same worklet pattern as the main player).
 */
export function SeekScrubBar({ width: scrubberWidth, showTimes = true }: SeekScrubBarProps) {
  const progress = usePlaybackController((s) => s.progress);
  const duration = usePlaybackController((s) => s.duration);
  const seekTo = usePlaybackController((s) => s.seekTo);
  const currentTrackId = usePlaybackController((s) => s.currentTrack?.id);

  const isScrubbing = useSharedValue(false);
  const scrubPercent = useSharedValue(0);
  const thumbScale = useSharedValue(1);
  const seekLockUntil = useRef(0);
  const lastTrackIdRef = useRef<string | null | undefined>(currentTrackId);

  const displayDuration = Math.max(0, normalizePlaybackSeconds(duration));
  const rawProgress = Math.max(0, normalizePlaybackSeconds(progress));
  const displayProgress = displayDuration > 0 ? Math.min(rawProgress, displayDuration) : rawProgress;
  const trackPercent = displayDuration > 0 ? Math.min(displayProgress / displayDuration, 1) : 0;

  const trackPercentSV = useSharedValue(trackPercent);
  const durationSV = useSharedValue(displayDuration);

  useEffect(() => {
    if (lastTrackIdRef.current !== currentTrackId) {
      lastTrackIdRef.current = currentTrackId;
      trackPercentSV.value = 0;
      scrubPercent.value = 0;
      isScrubbing.value = false;
      seekLockUntil.current = 0;
    }
  }, [currentTrackId, trackPercentSV, scrubPercent, isScrubbing]);

  useEffect(() => {
    if (Date.now() >= seekLockUntil.current) {
      trackPercentSV.value = trackPercent;
    }
  }, [trackPercent, trackPercentSV]);

  useEffect(() => {
    durationSV.value = Math.max(0, displayDuration);
  }, [displayDuration, durationSV]);

  const scrubFillStyle = useAnimatedStyle(() => ({
    width: (isScrubbing.value ? scrubPercent.value : trackPercentSV.value) * scrubberWidth,
  }));
  const scrubThumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (isScrubbing.value ? scrubPercent.value : trackPercentSV.value) * scrubberWidth - 6 },
      { scale: thumbScale.value },
    ],
  }));

  const handleSeekPct = useCallback(
    (pct: number, seekSeconds: number) => {
      seekLockUntil.current = Date.now() + 1000;
      seekTo(seekSeconds);
      trackPercentSV.value = pct;
      isScrubbing.value = false;
    },
    [seekTo, trackPercentSV, isScrubbing],
  );

  const scrubGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      isScrubbing.value = true;
      thumbScale.value = withSpring(1.5, { damping: 12, stiffness: 200 });
      scrubPercent.value = Math.min(Math.max(e.x / scrubberWidth, 0), 1);
    })
    .onUpdate((e) => {
      'worklet';
      scrubPercent.value = Math.min(Math.max(e.x / scrubberWidth, 0), 1);
    })
    .onEnd(() => {
      'worklet';
      thumbScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      const seekSeconds = scrubPercent.value * durationSV.value;
      runOnJS(handleSeekPct)(scrubPercent.value, seekSeconds);
    });

  const scrubTapGesture = Gesture.Tap()
    .onEnd((e) => {
      'worklet';
      const pct = Math.min(Math.max(e.x / scrubberWidth, 0), 1);
      const seekSeconds = pct * durationSV.value;
      runOnJS(handleSeekPct)(pct, seekSeconds);
    });

  const scrubCombined = Gesture.Simultaneous(scrubGesture, scrubTapGesture);

  return (
    <View style={{ marginTop: showTimes ? 24 : 6 }}>
      <GestureDetector gesture={scrubCombined}>
        <View style={{ paddingVertical: showTimes ? 10 : 4 }}>
          <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' }}>
            <Animated.View style={[{ height: 3, backgroundColor: '#FFFFFF', borderRadius: 2 }, scrubFillStyle]} />
          </View>
          <Animated.View
            style={[
              {
                position: 'absolute',
                top: showTimes ? 4 : -1,
                left: 0,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#fff',
                shadowColor: '#000',
                shadowOpacity: 0.35,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
              },
              scrubThumbStyle,
            ]}
          />
        </View>
      </GestureDetector>
      {showTimes ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
            {formatDuration(Math.floor(displayProgress))}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
            {displayDuration > 0
              ? `-${formatDuration(Math.max(0, Math.floor(displayDuration - displayProgress)))}`
              : '--:--'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
