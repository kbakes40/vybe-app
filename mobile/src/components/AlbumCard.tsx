import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { LinearGradient } from 'expo-linear-gradient';
import { Play } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Album } from '@/types/music';
import { usePlaybackController } from '@/stores/playbackController';
import { getTracksFromAlbum } from '@/data/mockData';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface AlbumCardProps {
  album: Album;
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
}

export function AlbumCard({ album, onPress, size = 'medium' }: AlbumCardProps) {
  const scale = useSharedValue(1);
  const playTrack = usePlaybackController(s => s.playTrack);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dimensions = {
    small: { width: 120, height: 120 },
    medium: { width: 160, height: 160 },
    large: { width: 200, height: 200 },
  };

  const { width, height } = dimensions[size];

  const handlePlay = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    const tracks = getTracksFromAlbum(album.id);
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks);
    }
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.95);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={animatedStyle}
    >
      <View style={{ width }} className="mr-4">
        <View
          style={{ width, height, borderRadius: 8, overflow: 'hidden' }}
          className="relative"
        >
          <ShadowArtworkImage
            source={{ uri: album.artwork }}
            style={{ width, height }}
            contentFit="cover"
          />
          {/* Gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: height / 2,
            }}
          />
          {/* Play button */}
          <Pressable
            onPress={handlePlay}
            className="absolute bottom-2 right-2 w-10 h-10 bg-[#8B5CF6] rounded-full items-center justify-center"
            style={{
              shadowColor: '#8B5CF6',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            <Play size={20} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
          </Pressable>
        </View>
        <Text className="text-white font-semibold mt-2" numberOfLines={1}>
          {album.title}
        </Text>
        <Text className="text-white/60 text-xs" numberOfLines={1}>
          {album.artist} - {album.releaseYear}
        </Text>
      </View>
    </AnimatedPressable>
  );
}
