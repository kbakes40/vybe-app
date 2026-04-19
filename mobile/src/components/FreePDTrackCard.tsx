import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Play } from 'lucide-react-native';
import { MachinedCloudIcon } from '@/components/MachinedCloudIcon';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Track } from '@/types/music';
import { usePlaybackController } from '@/stores/playbackController';
import { FreePDSourceBadge } from './FreePDSourceBadge';
import { cn } from '@/lib/cn';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface FreePDTrackCardProps {
  track: Track;
  queue?: Track[];
  onDownload?: (track: Track) => void;
  className?: string;
}

/**
 * Track card specifically designed for FreePD (royalty-free) tracks
 * Features: artwork, title, artist, FreePD badge, play overlay, download button, license badge
 */
export function FreePDTrackCard({ track, queue, onDownload, className }: FreePDTrackCardProps) {
  const scale = useSharedValue(1);
  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playbackState = usePlaybackController(s => s.playbackState);

  const isCurrentTrack = currentTrack?.id === track.id;
  const isPlaying = playbackState === 'playing' && isCurrentTrack;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(track, queue ?? [track]);
  };

  const handleDownload = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDownload?.(track);
  };

  // Determine license badge text
  const getLicenseBadge = (): string | null => {
    if (track.licenseName) {
      if (track.licenseName.toLowerCase().includes('cc0') || track.licenseName.toLowerCase().includes('public domain')) {
        return 'CC0';
      }
      if (track.licenseName.toLowerCase().includes('creative commons')) {
        return 'CC';
      }
      return 'PD';
    }
    // Default to PD for FreePD tracks
    if (track.source === 'freepd') {
      return 'PD';
    }
    return null;
  };

  const licenseBadge = getLicenseBadge();

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.96);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={animatedStyle}
      className={cn('mr-4', className)}
    >
      <View className="relative" style={{ width: 160, height: 160 }}>
        {/* Artwork */}
        <Image
          source={{ uri: track.artwork }}
          style={{ width: 160, height: 160, borderRadius: 12 }}
          contentFit="cover"
        />

        {/* Gradient overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 80,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
          }}
        />

        {/* FreePD badge - top left */}
        <View className="absolute top-2 left-2">
          <FreePDSourceBadge size="small" />
        </View>

        {/* License badge - top right next to download */}
        {licenseBadge ? (
          <View
            className="absolute top-2 right-10 bg-black/60 rounded px-1.5 py-0.5"
          >
            <Text className="text-white/90 text-[9px] font-bold">{licenseBadge}</Text>
          </View>
        ) : null}

        {/* Download button - top right */}
        {onDownload ? (
          <Pressable
            onPress={handleDownload}
            className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full items-center justify-center"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MachinedCloudIcon size={15} strokeWidth={2} />
          </Pressable>
        ) : null}

        {/* Play button overlay - center */}
        <View className="absolute inset-0 items-center justify-center">
          <View
            className={cn(
              'w-12 h-12 rounded-full items-center justify-center',
              isPlaying ? 'bg-[#4CAF50]' : 'bg-white/90'
            )}
            style={{
              shadowColor: isPlaying ? '#4CAF50' : '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <Play
              size={22}
              color={isPlaying ? '#fff' : '#0A0A0A'}
              fill={isPlaying ? '#fff' : '#0A0A0A'}
              style={{ marginLeft: 2 }}
            />
          </View>
        </View>

        {/* Now playing indicator */}
        {isPlaying ? (
          <View className="absolute bottom-2 left-2 right-2 flex-row items-center">
            <View className="flex-row gap-[2px] mr-2">
              <View className="w-[2px] h-3 bg-[#4CAF50] rounded-full" />
              <View className="w-[2px] h-2 bg-[#4CAF50] rounded-full" />
              <View className="w-[2px] h-4 bg-[#4CAF50] rounded-full" />
            </View>
            <Text className="text-[#4CAF50] text-[10px] font-medium">Playing</Text>
          </View>
        ) : null}
      </View>

      {/* Track info */}
      <Text
        className={cn(
          'font-semibold text-sm mt-2',
          isCurrentTrack ? 'text-[#4CAF50]' : 'text-white'
        )}
        numberOfLines={1}
        style={{ width: 160 }}
      >
        {track.title}
      </Text>
      <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 160 }}>
        {track.artist}
      </Text>
    </AnimatedPressable>
  );
}
