import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Settings, Share2, Crown } from 'lucide-react-native';
import { playlists, artists } from '@/data/mockData';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { usePlaybackController } from '@/stores/playbackController';
import { MINI_PLAYER_HEIGHT } from './_layout';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Mock user profile data
const USER_PROFILE = {
  name: 'Alex',
  tagline: 'break the loop',
  image: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&h=400&fit=crop',
  memberSince: 'January 2024',
  isPrivate: false,
  publicPlaylists: playlists.slice(0, 4),
  recentlyPlayed: playlists.slice(2, 6),
  topArtists: artists.slice(0, 6),
  topGenres: ['Electronic', 'Lo-Fi', 'Ambient', 'Synthwave', 'Chill'],
};

interface PlaylistCardSmallProps {
  playlist: typeof playlists[0];
  onPress: () => void;
}

function PlaylistCardSmall({ playlist, onPress }: PlaylistCardSmallProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="mr-4"
    >
      <Image
        source={{ uri: playlist.artwork }}
        style={{ width: 140, height: 140, borderRadius: 8 }}
        contentFit="cover"
      />
      <Text className="text-white font-medium text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>
        {playlist.title}
      </Text>
      <Text className="text-white/50 text-xs" numberOfLines={1} style={{ width: 140 }}>
        {playlist.trackCount} tracks
      </Text>
    </Pressable>
  );
}

interface ArtistCircleProps {
  artist: typeof artists[0];
  onPress: () => void;
}

function ArtistCircle({ artist, onPress }: ArtistCircleProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="mr-4 items-center"
    >
      <Image
        source={{ uri: artist.image }}
        style={{ width: 80, height: 80, borderRadius: 40 }}
        contentFit="cover"
      />
      <Text className="text-white font-medium text-sm mt-2 text-center" numberOfLines={1} style={{ width: 80 }}>
        {artist.name}
      </Text>
    </Pressable>
  );
}

interface GenreChipProps {
  name: string;
}

function GenreChip({ name }: GenreChipProps) {
  return (
    <View className="bg-white/10 rounded-full px-4 py-2 mr-2 mb-2">
      <Text className="text-white text-sm">{name}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tier = useSubscriptionStore(s => s.tier);
  const currentTrack = usePlaybackController(s => s.currentTrack);

  // Check if mini player is visible
  const showMiniPlayer = !!currentTrack;

  // Calculate bottom padding: safe area + mini player height (if visible) + extra padding
  const bottomPadding = insets.bottom + (showMiniPlayer ? MINI_PLAYER_HEIGHT : 0) + 40;

  // If profile is private, show limited view
  const isOwnProfile = true; // For now, always showing own profile
  const profile = USER_PROFILE;

  if (profile.isPrivate && !isOwnProfile) {
    return (
      <View className="flex-1 bg-[#0A0A0A]">
        <LinearGradient
          colors={['#1a1a2e', '#0A0A0A']}
          style={{ paddingTop: insets.top }}
        >
          <View className="flex-row items-center px-4 py-3">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              className="w-10 h-10 items-center justify-center -ml-2"
            >
              <ChevronLeft size={28} color="#fff" />
            </Pressable>
          </View>
        </LinearGradient>

        <View className="flex-1 items-center justify-center px-8">
          <Image
            source={{ uri: profile.image }}
            style={{ width: 100, height: 100, borderRadius: 50 }}
            contentFit="cover"
          />
          <Text className="text-white text-xl font-bold mt-4">{profile.name}</Text>
          <Text className="text-white/50 text-center mt-4">
            This profile is private.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with gradient */}
        <LinearGradient
          colors={['#2D1B4E', '#1a1a2e', '#0A0A0A']}
          style={{ paddingTop: insets.top }}
        >
          {/* Navigation */}
          <View className="flex-row items-center justify-between px-4 py-3">
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              className="w-10 h-10 items-center justify-center -ml-2"
            >
              <ChevronLeft size={28} color="#fff" />
            </Pressable>
            <View className="flex-row">
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                className="w-10 h-10 items-center justify-center"
              >
                <Share2 size={22} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/(app)/settings' as never);
                }}
                className="w-10 h-10 items-center justify-center"
              >
                <Settings size={22} color="#fff" />
              </Pressable>
            </View>
          </View>

          {/* Profile Header */}
          <View className="items-center px-4 pb-8">
            <View
              style={{
                shadowColor: '#8B5CF6',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.5,
                shadowRadius: 20,
                elevation: 10,
              }}
            >
              <Image
                source={{ uri: profile.image }}
                style={{ width: 120, height: 120, borderRadius: 60 }}
                contentFit="cover"
              />
            </View>
            <Text className="text-white text-2xl font-bold mt-4">{profile.name}</Text>
            <Text className="text-white/60 text-base mt-1">{profile.tagline}</Text>

            {/* VYBE Plus Badge */}
            {tier === 'plus' && (
              <View className="flex-row items-center mt-3 bg-[#8B5CF6]/20 rounded-full px-4 py-1.5">
                <Crown size={16} color="#8B5CF6" />
                <Text className="text-[#8B5CF6] text-sm font-semibold ml-1.5">VYBE Plus</Text>
              </View>
            )}

            {/* Member since */}
            <Text className="text-white/40 text-sm mt-3">
              Member since {profile.memberSince}
            </Text>
          </View>
        </LinearGradient>

        {/* Public Playlists */}
        <View className="mt-6">
          <Text className="text-white/50 text-xs uppercase tracking-wider px-5 mb-4 font-medium">
            Public Playlists
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            style={{ flexGrow: 0 }}
          >
            {profile.publicPlaylists.map((playlist) => (
              <PlaylistCardSmall
                key={playlist.id}
                playlist={playlist}
                onPress={() => router.push(`/(app)/playlist/${playlist.id}` as never)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Recently Played */}
        <View className="mt-8">
          <Text className="text-white/50 text-xs uppercase tracking-wider px-5 mb-4 font-medium">
            Recently Played
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            style={{ flexGrow: 0 }}
          >
            {profile.recentlyPlayed.map((playlist) => (
              <PlaylistCardSmall
                key={playlist.id}
                playlist={playlist}
                onPress={() => router.push(`/(app)/playlist/${playlist.id}` as never)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Top Artists */}
        <View className="mt-8">
          <Text className="text-white/50 text-xs uppercase tracking-wider px-5 mb-4 font-medium">
            Top Artists
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            style={{ flexGrow: 0 }}
          >
            {profile.topArtists.map((artist) => (
              <ArtistCircle
                key={artist.id}
                artist={artist}
                onPress={() => router.push(`/(app)/artist/${artist.id}` as never)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Top Genres */}
        <View className="mt-8 px-5">
          <Text className="text-white/50 text-xs uppercase tracking-wider mb-4 font-medium">
            Top Genres
          </Text>
          <View className="flex-row flex-wrap">
            {profile.topGenres.map((genre) => (
              <GenreChip key={genre} name={genre} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
