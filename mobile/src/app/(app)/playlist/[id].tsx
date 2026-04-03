import React from 'react';
import { View, Text, ScrollView, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Play,
  Shuffle,
  Heart,
  MoreHorizontal,
  Clock,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { getPlaylistById, getTracksFromPlaylist, formatDuration } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import { TrackCard } from '@/components/TrackCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const playTrack = usePlaybackController(s => s.playTrack);

  const playScale = useSharedValue(1);

  const playlist = getPlaylistById(id ?? '');
  const playlistTracks = getTracksFromPlaylist(id ?? '');

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  if (!playlist) {
    return (
      <View className="flex-1 bg-[#0A0A0A] items-center justify-center">
        <Text className="text-white">Playlist not found</Text>
      </View>
    );
  }

  const totalDuration = playlistTracks.reduce((acc, t) => acc + t.duration, 0);

  const handlePlayAll = () => {
    if (playlistTracks.length > 0) {
      playTrack(playlistTracks[0], playlistTracks);
    }
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={playlist.gradientColors ?? ['#1a1a2e', '#0A0A0A']}
          style={{ paddingTop: insets.top }}
        >
          {/* Back Button */}
          <Pressable
            onPress={() => router.back()}
            className="absolute top-0 left-4 w-10 h-10 rounded-full bg-black/30 items-center justify-center z-10"
            style={{ marginTop: insets.top }}
          >
            <ChevronLeft size={24} color="#fff" />
          </Pressable>

          {/* Playlist Artwork */}
          <View className="items-center pt-12 pb-6 px-12">
            <View
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 20 },
                shadowOpacity: 0.5,
                shadowRadius: 30,
                elevation: 20,
              }}
            >
              <Image
                source={{ uri: playlist.artwork }}
                style={{
                  width: SCREEN_WIDTH - 120,
                  height: SCREEN_WIDTH - 120,
                  borderRadius: 8,
                }}
                contentFit="cover"
              />
            </View>
          </View>

          {/* Playlist Info */}
          <View className="px-5 pb-6">
            <Text className="text-white text-2xl font-bold">{playlist.title}</Text>
            <Text className="text-white/80 text-sm mt-2">{playlist.description}</Text>
            <View className="flex-row items-center mt-2">
              <Text className="text-white/60 text-sm font-semibold">
                {playlist.creator}
              </Text>
              <View className="w-1 h-1 bg-white/40 rounded-full mx-2" />
              <Text className="text-white/40 text-sm">
                {playlist.trackCount} songs
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Action Buttons */}
        <View className="flex-row items-center px-5 py-4 bg-[#0A0A0A]">
          <Pressable className="p-2">
            <Heart size={24} color="#fff" />
          </Pressable>
          <Pressable className="ml-4 p-2">
            <MoreHorizontal size={24} color="#fff" />
          </Pressable>
          <View className="flex-1" />
          <Pressable className="p-2 mr-2">
            <Shuffle size={24} color="#8B5CF6" />
          </Pressable>
          <AnimatedPressable
            onPress={handlePlayAll}
            onPressIn={() => {
              playScale.value = withSpring(0.9);
            }}
            onPressOut={() => {
              playScale.value = withSpring(1);
            }}
            style={playButtonStyle}
            className="w-14 h-14 bg-[#8B5CF6] rounded-full items-center justify-center"
          >
            <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
          </AnimatedPressable>
        </View>

        {/* Track List */}
        <View>
          {playlistTracks.map((track, index) => (
            <TrackCard
              key={track.id}
              track={track}
              queue={playlistTracks}
              index={index}
            />
          ))}
        </View>

        {/* Playlist Duration */}
        <View className="px-5 py-4 flex-row items-center">
          <Clock size={16} color="rgba(255,255,255,0.4)" />
          <Text className="text-white/40 text-sm ml-2">
            {Math.floor(totalDuration / 60)} min {totalDuration % 60} sec
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
