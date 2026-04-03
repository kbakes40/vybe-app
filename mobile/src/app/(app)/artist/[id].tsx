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
  BadgeCheck,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { getArtistById, getTracksByArtist, getAlbumsByArtist, formatFollowers, artists } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import { TrackCard } from '@/components/TrackCard';
import { AlbumCard } from '@/components/AlbumCard';
import { ArtistCard } from '@/components/ArtistCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function ArtistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const playTrack = usePlaybackController(s => s.playTrack);

  const playScale = useSharedValue(1);

  const artist = getArtistById(id ?? '');
  const artistTracks = getTracksByArtist(id ?? '');
  const artistAlbums = getAlbumsByArtist(id ?? '');
  const relatedArtists = artists.filter(a => a.id !== id).slice(0, 6);

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  if (!artist) {
    return (
      <View className="flex-1 bg-[#0A0A0A] items-center justify-center">
        <Text className="text-white">Artist not found</Text>
      </View>
    );
  }

  const handlePlayAll = () => {
    if (artistTracks.length > 0) {
      playTrack(artistTracks[0], artistTracks);
    }
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Image */}
        <View style={{ height: SCREEN_WIDTH }}>
          <Image
            source={{ uri: artist.image }}
            style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH }}
            contentFit="cover"
          />
          <LinearGradient
            colors={['transparent', '#0A0A0A']}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 200,
            }}
          />
          {/* Back Button */}
          <Pressable
            onPress={() => router.back()}
            className="absolute top-0 left-4 w-10 h-10 rounded-full bg-black/50 items-center justify-center"
            style={{ marginTop: insets.top }}
          >
            <ChevronLeft size={24} color="#fff" />
          </Pressable>
          {/* Artist Name */}
          <View className="absolute bottom-6 left-5 right-5">
            <View className="flex-row items-center">
              <Text className="text-white text-4xl font-bold">{artist.name}</Text>
              {artist.isVerified ? (
                <BadgeCheck size={28} color="#3B82F6" fill="#3B82F6" className="ml-2" />
              ) : null}
            </View>
            <Text className="text-white/60 text-base mt-1">
              {formatFollowers(artist.followers)} monthly listeners
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="flex-row items-center px-5 py-4">
          <Pressable className="flex-row items-center px-6 py-2 rounded-full border border-white/30">
            <Text className="text-white font-semibold">Follow</Text>
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

        {/* Popular Tracks */}
        <View className="mt-4">
          <Text className="text-white text-xl font-bold px-5 mb-2">Popular</Text>
          {artistTracks.slice(0, 5).map((track, index) => (
            <TrackCard
              key={track.id}
              track={track}
              queue={artistTracks}
              showArtwork={false}
              index={index}
            />
          ))}
        </View>

        {/* Albums */}
        {artistAlbums.length > 0 ? (
          <View className="mt-8">
            <Text className="text-white text-xl font-bold px-5 mb-4">Albums</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {artistAlbums.map(album => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onPress={() => router.push(`/(app)/album/${album.id}` as never)}
                  size="medium"
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Related Artists */}
        <View className="mt-8">
          <Text className="text-white text-xl font-bold px-5 mb-4">
            Fans Also Like
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            style={{ flexGrow: 0 }}
          >
            {relatedArtists.map(relatedArtist => (
              <ArtistCard
                key={relatedArtist.id}
                artist={relatedArtist}
                onPress={() => router.push(`/(app)/artist/${relatedArtist.id}` as never)}
                size="small"
              />
            ))}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}
