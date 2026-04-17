import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated as RNAnimated } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Track } from '@/types/music';
import { usePlaybackController } from '@/stores/playbackController';
import { useSoundCloudPreloadStore } from '@/stores/soundcloudPreloadStore';
import { formatDuration } from '@/data/mockData';
import { Play } from 'lucide-react-native';
import { DownloadButton } from './DownloadButton';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * EqBars — 3 vertical bars that pulse with the playing track. We don't have
 * real audio-frequency data, so this is a seeded random "bouncy" animation
 * that loops each bar independently at a different speed — visually reads as
 * "this song is playing" without ever being wrong.
 */
function EqBars() {
  const b0 = useRef(new RNAnimated.Value(12)).current;
  const b1 = useRef(new RNAnimated.Value(8)).current;
  const b2 = useRef(new RNAnimated.Value(16)).current;

  useEffect(() => {
    const animate = (bar: RNAnimated.Value, speed: number) => {
      const loop = () => {
        const next = 4 + Math.random() * 12; // 4px → 16px
        RNAnimated.timing(bar, {
          toValue: next,
          duration: speed + Math.random() * 140,
          useNativeDriver: false,
        }).start(loop);
      };
      loop();
    };
    animate(b0, 180);
    animate(b1, 240);
    animate(b2, 200);
  }, []);

  return (
    <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 16 }}>
        <RNAnimated.View style={{ width: 2, height: b0, backgroundColor: '#8B5CF6', borderRadius: 1 }} />
        <RNAnimated.View style={{ width: 2, height: b1, backgroundColor: '#8B5CF6', borderRadius: 1 }} />
        <RNAnimated.View style={{ width: 2, height: b2, backgroundColor: '#8B5CF6', borderRadius: 1 }} />
      </View>
    </View>
  );
}

interface TrackCardProps {
  track: Track;
  queue?: Track[];
  showArtwork?: boolean;
  index?: number;
}

export function TrackCard({ track, queue, showArtwork = true, index }: TrackCardProps) {
  const scale = useSharedValue(1);
  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playbackState = usePlaybackController(s => s.playbackState);
  const isPlaying = playbackState === 'playing';
  const preloadTrack = useSoundCloudPreloadStore(s => s.preloadTrack);
  const isPreloaded = useSoundCloudPreloadStore(s => s.isPreloaded);

  const isCurrentTrack = currentTrack?.id === track.id;

  // Preload SoundCloud tracks when they become visible
  useEffect(() => {
    if (track.source === 'soundcloud' && track.soundcloudUrl && !isPreloaded(track.id)) {
      // Validate URL before preloading
      try {
        const parsed = new URL(track.soundcloudUrl);
        if (parsed.hostname === 'soundcloud.com' || parsed.hostname === 'www.soundcloud.com') {
          preloadTrack(track.id, track.soundcloudUrl, {
            artwork: track.artwork,
            title: track.title,
            artist: track.artist,
            duration: track.duration,
          });
        }
      } catch {
        // Invalid URL, skip preloading
      }
    }
  }, [track.id, track.source, track.soundcloudUrl, track.artwork, track.title, track.artist, track.duration, preloadTrack, isPreloaded]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    playTrack(track, queue ?? [track]);
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.98);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={animatedStyle}
      className="flex-row items-center py-3 px-4"
    >
      {index !== undefined ? (
        <Text
          className={`w-8 text-center ${isCurrentTrack ? 'text-[#8B5CF6]' : 'text-white/40'}`}
        >
          {isCurrentTrack && isPlaying ? (
            <EqBars />
          ) : (
            index + 1
          )}
        </Text>
      ) : null}

      {showArtwork ? (
        <Image
          source={{ uri: track.artwork }}
          style={{ width: 48, height: 48, borderRadius: 4 }}
          contentFit="cover"
        />
      ) : null}

      <View className={`flex-1 ${showArtwork ? 'ml-3' : 'ml-2'}`}>
        <Text
          className={`font-medium ${isCurrentTrack ? 'text-[#8B5CF6]' : 'text-white'}`}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <Text className="text-white/60 text-sm" numberOfLines={1}>
          {track.artist}
        </Text>
      </View>

      {track.duration > 0 ? (
        <Text className="text-white/40 text-sm mr-2">
          {formatDuration(track.duration)}
        </Text>
      ) : null}

      <View style={{ marginLeft: 4 }} onStartShouldSetResponder={() => true}>
        <DownloadButton track={track} size={22} />
      </View>
    </AnimatedPressable>
  );
}
