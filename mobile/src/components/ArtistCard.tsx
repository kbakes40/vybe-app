import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Artist } from '@/types/music';
import { BadgeCheck } from 'lucide-react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ArtistCardProps {
  artist: Artist;
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
}

export function ArtistCard({ artist, onPress, size = 'medium' }: ArtistCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dimensions = {
    small: 100,
    medium: 140,
    large: 180,
  };

  const imageSize = dimensions[size];

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
      className="items-center mr-4"
    >
      <Image
        source={{ uri: artist.image }}
        style={{
          width: imageSize,
          height: imageSize,
          borderRadius: imageSize / 2,
        }}
        contentFit="cover"
      />
      <View className="flex-row items-center mt-2">
        <Text className="text-white font-medium" numberOfLines={1}>
          {artist.name}
        </Text>
        {artist.isVerified ? (
          <BadgeCheck size={14} color="#3B82F6" className="ml-1" />
        ) : null}
      </View>
      <Text className="text-white/40 text-xs">Artist</Text>
    </AnimatedPressable>
  );
}
