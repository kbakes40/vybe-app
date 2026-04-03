import React, { useState } from 'react';
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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { ChevronLeft, Play } from 'lucide-react-native';
import { tracks, artists, formatDuration } from '@/data/mockData';
import { VybeIcon } from '@/components/VybeIcon';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TimeRange = '7d' | '4w' | '6m' | 'all';
type StatsTab = 'tracks' | 'artists' | 'genres';

// Mock listening stats data
const LISTENING_STATS = {
  '7d': {
    minutesListened: 847,
    uniqueArtists: 23,
    uniqueTracks: 156,
    topTracks: [
      { ...tracks[0], minutes: 45 },
      { ...tracks[2], minutes: 38 },
      { ...tracks[4], minutes: 32 },
      { ...tracks[6], minutes: 28 },
      { ...tracks[8], minutes: 25 },
    ],
    topArtists: [
      { ...artists[0], minutes: 120 },
      { ...artists[2], minutes: 95 },
      { ...artists[4], minutes: 78 },
      { ...artists[6], minutes: 65 },
      { ...artists[8], minutes: 52 },
    ],
    topGenres: [
      { name: 'Electronic', percentage: 35 },
      { name: 'Lo-Fi', percentage: 25 },
      { name: 'Ambient', percentage: 18 },
      { name: 'Pop', percentage: 12 },
      { name: 'Hip-Hop', percentage: 10 },
    ],
    sources: {
      vybe: 45,
      soundcloud: 25,
      youtube: 20,
      youtubeMusic: 10,
    },
  },
  '4w': {
    minutesListened: 3420,
    uniqueArtists: 67,
    uniqueTracks: 489,
    topTracks: [
      { ...tracks[1], minutes: 125 },
      { ...tracks[3], minutes: 112 },
      { ...tracks[5], minutes: 98 },
      { ...tracks[7], minutes: 87 },
      { ...tracks[9], minutes: 76 },
    ],
    topArtists: [
      { ...artists[1], minutes: 380 },
      { ...artists[3], minutes: 320 },
      { ...artists[5], minutes: 275 },
      { ...artists[7], minutes: 230 },
      { ...artists[9], minutes: 195 },
    ],
    topGenres: [
      { name: 'Electronic', percentage: 32 },
      { name: 'Synthwave', percentage: 22 },
      { name: 'Chill', percentage: 20 },
      { name: 'R&B', percentage: 15 },
      { name: 'Rock', percentage: 11 },
    ],
    sources: {
      vybe: 40,
      soundcloud: 28,
      youtube: 22,
      youtubeMusic: 10,
    },
  },
  '6m': {
    minutesListened: 18750,
    uniqueArtists: 234,
    uniqueTracks: 1892,
    topTracks: [
      { ...tracks[2], minutes: 456 },
      { ...tracks[4], minutes: 412 },
      { ...tracks[6], minutes: 387 },
      { ...tracks[8], minutes: 345 },
      { ...tracks[10], minutes: 312 },
    ],
    topArtists: [
      { ...artists[0], minutes: 1520 },
      { ...artists[2], minutes: 1340 },
      { ...artists[4], minutes: 1180 },
      { ...artists[6], minutes: 1050 },
      { ...artists[8], minutes: 920 },
    ],
    topGenres: [
      { name: 'Electronic', percentage: 30 },
      { name: 'Ambient', percentage: 24 },
      { name: 'Lo-Fi', percentage: 18 },
      { name: 'Synthwave', percentage: 16 },
      { name: 'Meditation', percentage: 12 },
    ],
    sources: {
      vybe: 42,
      soundcloud: 26,
      youtube: 18,
      youtubeMusic: 14,
    },
  },
  'all': {
    minutesListened: 45230,
    uniqueArtists: 512,
    uniqueTracks: 4567,
    topTracks: [
      { ...tracks[0], minutes: 1234 },
      { ...tracks[2], minutes: 1098 },
      { ...tracks[4], minutes: 987 },
      { ...tracks[6], minutes: 876 },
      { ...tracks[8], minutes: 765 },
    ],
    topArtists: [
      { ...artists[0], minutes: 4520 },
      { ...artists[2], minutes: 3980 },
      { ...artists[4], minutes: 3450 },
      { ...artists[6], minutes: 2980 },
      { ...artists[8], minutes: 2560 },
    ],
    topGenres: [
      { name: 'Electronic', percentage: 28 },
      { name: 'Lo-Fi', percentage: 22 },
      { name: 'Ambient', percentage: 20 },
      { name: 'Chill', percentage: 17 },
      { name: 'Synthwave', percentage: 13 },
    ],
    sources: {
      vybe: 38,
      soundcloud: 28,
      youtube: 20,
      youtubeMusic: 14,
    },
  },
};

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '4w', label: '4 weeks' },
  { key: '6m', label: '6 months' },
  { key: 'all', label: 'All time' },
];

interface TimeRangeChipProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

function TimeRangeChip({ label, isActive, onPress }: TimeRangeChipProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="px-4 py-2 rounded-full mr-2"
      style={{
        backgroundColor: isActive ? '#8B5CF6' : 'rgba(255,255,255,0.1)',
      }}
    >
      <Text
        className="text-sm font-medium"
        style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.6)' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface TabButtonProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
}

function TabButton({ label, isActive, onPress }: TabButtonProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="flex-1 py-3 items-center"
      style={{
        borderBottomWidth: 2,
        borderBottomColor: isActive ? '#8B5CF6' : 'transparent',
      }}
    >
      <Text
        className="text-sm font-semibold"
        style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.5)' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function formatLargeNumber(num: number): string {
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toString();
}

export default function ListeningStatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRange>('4w');
  const [activeTab, setActiveTab] = useState<StatsTab>('tracks');

  const stats = LISTENING_STATS[timeRange];

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      {/* Header */}
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
          <Text className="text-white text-xl font-bold flex-1 text-center mr-8">
            Listening Stats
          </Text>
        </View>

        {/* Time Range Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
          style={{ flexGrow: 0 }}
        >
          {TIME_RANGES.map((range) => (
            <TimeRangeChip
              key={range.key}
              label={range.label}
              isActive={timeRange === range.key}
              onPress={() => setTimeRange(range.key)}
            />
          ))}
        </ScrollView>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Overview Stats */}
        <View className="flex-row px-4 py-6">
          <View className="flex-1 items-center">
            <Text className="text-white text-3xl font-bold">
              {formatLargeNumber(stats.minutesListened)}
            </Text>
            <Text className="text-white/50 text-xs mt-1">minutes listened</Text>
          </View>
          <View className="w-px bg-white/10" />
          <View className="flex-1 items-center">
            <Text className="text-white text-3xl font-bold">
              {stats.uniqueArtists}
            </Text>
            <Text className="text-white/50 text-xs mt-1">unique artists</Text>
          </View>
          <View className="w-px bg-white/10" />
          <View className="flex-1 items-center">
            <Text className="text-white text-3xl font-bold">
              {formatLargeNumber(stats.uniqueTracks)}
            </Text>
            <Text className="text-white/50 text-xs mt-1">unique tracks</Text>
          </View>
        </View>

        {/* Tabs */}
        <View className="flex-row border-b border-white/10 mx-4">
          <TabButton
            label="Tracks"
            isActive={activeTab === 'tracks'}
            onPress={() => setActiveTab('tracks')}
          />
          <TabButton
            label="Artists"
            isActive={activeTab === 'artists'}
            onPress={() => setActiveTab('artists')}
          />
          <TabButton
            label="Genres"
            isActive={activeTab === 'genres'}
            onPress={() => setActiveTab('genres')}
          />
        </View>

        {/* Tab Content */}
        <View className="px-4 pt-4">
          {activeTab === 'tracks' && (
            <View>
              {stats.topTracks.map((track, index) => (
                <View
                  key={track.id}
                  className="flex-row items-center py-3"
                >
                  <Text className="text-white/40 text-lg font-bold w-8">
                    {index + 1}
                  </Text>
                  <Image
                    source={{ uri: track.artwork }}
                    style={{ width: 48, height: 48, borderRadius: 6 }}
                    contentFit="cover"
                  />
                  <View className="flex-1 ml-3">
                    <Text className="text-white font-medium" numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text className="text-white/50 text-sm" numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </View>
                  <Text className="text-white/50 text-sm">
                    {formatMinutes(track.minutes)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'artists' && (
            <View>
              {stats.topArtists.map((artist, index) => (
                <View
                  key={artist.id}
                  className="flex-row items-center py-3"
                >
                  <Text className="text-white/40 text-lg font-bold w-8">
                    {index + 1}
                  </Text>
                  <Image
                    source={{ uri: artist.image }}
                    style={{ width: 48, height: 48, borderRadius: 24 }}
                    contentFit="cover"
                  />
                  <View className="flex-1 ml-3">
                    <Text className="text-white font-medium" numberOfLines={1}>
                      {artist.name}
                    </Text>
                    <Text className="text-white/50 text-sm" numberOfLines={1}>
                      {artist.genres.slice(0, 2).join(', ')}
                    </Text>
                  </View>
                  <Text className="text-white/50 text-sm">
                    {formatMinutes(artist.minutes)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {activeTab === 'genres' && (
            <View>
              {stats.topGenres.map((genre, index) => (
                <View key={genre.name} className="py-3">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-white font-medium">{genre.name}</Text>
                    <Text className="text-white/50 text-sm">{genre.percentage}%</Text>
                  </View>
                  <View className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <View
                      className="h-full rounded-full"
                      style={{
                        width: `${genre.percentage}%`,
                        backgroundColor: '#8B5CF6',
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Source Split */}
        <View className="mt-8 px-4">
          <Text className="text-white/50 text-xs uppercase tracking-wider mb-4 font-medium">
            Listening by Source
          </Text>
          <View className="bg-[#1A1A1A] rounded-xl p-4">
            {/* VYBE */}
            <View className="flex-row items-center justify-between py-2">
              <View className="flex-row items-center">
                <VybeIcon size={24} variant="primary" />
                <Text className="text-white font-medium ml-3">VYBE</Text>
              </View>
              <Text className="text-white/60">{stats.sources.vybe}%</Text>
            </View>
            <View className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1 mb-3">
              <View
                className="h-full rounded-full bg-[#8B5CF6]"
                style={{ width: `${stats.sources.vybe}%` }}
              />
            </View>

            {/* SoundCloud */}
            <View className="flex-row items-center justify-between py-2">
              <View className="flex-row items-center">
                <View className="w-6 h-6 rounded bg-[#FF5500] items-center justify-center">
                  <Text className="text-white text-[10px] font-bold">SC</Text>
                </View>
                <Text className="text-white font-medium ml-3">SoundCloud</Text>
              </View>
              <Text className="text-white/60">{stats.sources.soundcloud}%</Text>
            </View>
            <View className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1 mb-3">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${stats.sources.soundcloud}%`,
                  backgroundColor: '#FF5500',
                }}
              />
            </View>

            {/* YouTube */}
            <View className="flex-row items-center justify-between py-2">
              <View className="flex-row items-center">
                <View className="w-6 h-6 rounded bg-[#FF0000] items-center justify-center">
                  <View
                    style={{
                      width: 0,
                      height: 0,
                      borderLeftWidth: 6,
                      borderTopWidth: 4,
                      borderBottomWidth: 4,
                      borderLeftColor: '#fff',
                      borderTopColor: 'transparent',
                      borderBottomColor: 'transparent',
                      marginLeft: 2,
                    }}
                  />
                </View>
                <Text className="text-white font-medium ml-3">YouTube</Text>
              </View>
              <Text className="text-white/60">{stats.sources.youtube}%</Text>
            </View>
            <View className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1 mb-3">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${stats.sources.youtube}%`,
                  backgroundColor: '#FF0000',
                }}
              />
            </View>

            {/* YouTube Music */}
            <View className="flex-row items-center justify-between py-2">
              <View className="flex-row items-center">
                <View className="w-6 h-6 rounded-full bg-[#FF0000] items-center justify-center">
                  <View
                    style={{
                      width: 0,
                      height: 0,
                      borderLeftWidth: 5,
                      borderTopWidth: 3,
                      borderBottomWidth: 3,
                      borderLeftColor: '#fff',
                      borderTopColor: 'transparent',
                      borderBottomColor: 'transparent',
                      marginLeft: 1,
                    }}
                  />
                </View>
                <Text className="text-white font-medium ml-3">YouTube Music</Text>
              </View>
              <Text className="text-white/60">{stats.sources.youtubeMusic}%</Text>
            </View>
            <View className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${stats.sources.youtubeMusic}%`,
                  backgroundColor: '#FF0000',
                }}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
