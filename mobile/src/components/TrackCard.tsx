import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
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
import { Play, MoreHorizontal } from 'lucide-react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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
            <View className="w-4 h-4 items-center justify-center">
              <View className="flex-row gap-[2px]">
                <View className="w-[2px] h-3 bg-[#8B5CF6] rounded-full" />
                <View className="w-[2px] h-2 bg-[#8B5CF6] rounded-full" />
                <View className="w-[2px] h-4 bg-[#8B5CF6] rounded-full" />
              </View>
            </View>
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

      <Text className="text-white/40 text-sm mr-2">
        {formatDuration(track.duration)}
      </Text>

      <Pressable className="p-2">
        <MoreHorizontal size={20} color="rgba(255,255,255,0.4)" />
      </Pressable>
    </AnimatedPressable>
  );
}
