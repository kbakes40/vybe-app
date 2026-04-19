import React, { memo, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { MoreHorizontal } from 'lucide-react-native';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { Track } from '@/types/music';
import { ShadowSavedMark } from '@/components/DownloadButton';
import { SourceCornerBadge } from '@/components/SourceCornerBadge';

const ART_RADIUS = 16;

function NowPlayingWaveBars({ playing }: { playing: boolean }) {
  const a = useSharedValue(0.42);
  const b = useSharedValue(0.72);
  const c = useSharedValue(0.5);
  const s1 = useAnimatedStyle(() => ({ transform: [{ scaleY: a.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ scaleY: b.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ scaleY: c.value }] }));
  useEffect(() => {
    if (playing) {
      a.value = withRepeat(
        withSequence(withTiming(1, { duration: 280, easing: Easing.inOut(Easing.ease) }), withTiming(0.35, { duration: 280, easing: Easing.inOut(Easing.ease) })),
        -1,
        true,
      );
      b.value = withRepeat(
        withSequence(withTiming(1, { duration: 320, easing: Easing.inOut(Easing.ease) }), withTiming(0.4, { duration: 320, easing: Easing.inOut(Easing.ease) })),
        -1,
        true,
      );
      c.value = withRepeat(
        withSequence(withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) }), withTiming(0.38, { duration: 300, easing: Easing.inOut(Easing.ease) })),
        -1,
        true,
      );
    } else {
      cancelAnimation(a);
      cancelAnimation(b);
      cancelAnimation(c);
      a.value = withTiming(0.5, { duration: 200 });
      b.value = withTiming(0.68, { duration: 200 });
      c.value = withTiming(0.45, { duration: 200 });
    }
  }, [playing, a, b, c]);
  const bar = { width: 3, height: 14, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.85)' } as const;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 18, gap: 3 }}>
      <Animated.View style={[bar, s1]} />
      <Animated.View style={[bar, s2]} />
      <Animated.View style={[bar, s3]} />
    </View>
  );
}

export interface QuickPickRowProps {
  track: Track;
  onPress: () => void;
  onMore?: () => void;
}

/**
 * Fixed hook order every render: no early returns, no conditional hooks.
 * NowPlayingWaveBars stays mounted (opacity) so child hook count is stable per row.
 */
export const QuickPickRow = memo(function QuickPickRow({ track, onPress, onMore }: QuickPickRowProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const playbackState = usePlaybackController((s) => s.playbackState);
  const saved = useDownloadsStore((s) => s.isTrackDownloaded(track.id));

  const isCurrent = currentTrack?.id === track.id;
  const playing = playbackState === 'playing';

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        unstable_pressDelay={0}
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.98); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}
      >
        <View style={{ width: 54, height: 54, borderRadius: ART_RADIUS, overflow: 'hidden', backgroundColor: '#141416' }}>
          <ShadowArtworkImage source={{ uri: track.artwork }} style={{ width: 54, height: 54 }} contentFit="cover" />
          <View style={{ position: 'absolute', top: 4, right: 4 }}>
            <SourceCornerBadge source={track.source} compact />
          </View>
        </View>
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.15 }} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.48)', fontSize: 12, marginTop: 4 }} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
          <View
            style={{
              width: 30,
              height: 22,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View
              style={[
                StyleSheet.absoluteFillObject,
                {
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  opacity: isCurrent ? 1 : 0,
                },
              ]}
              pointerEvents="none"
            >
              <NowPlayingWaveBars playing={isCurrent && playing} />
            </View>
            {!isCurrent && saved ? <ShadowSavedMark size={22} /> : null}
          </View>
          <Pressable onPress={() => onMore?.()} hitSlop={12} style={{ padding: 6, marginLeft: 4 }}>
            <MoreHorizontal size={18} color="rgba(255,255,255,0.35)" />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
});
QuickPickRow.displayName = 'QuickPickRow';
