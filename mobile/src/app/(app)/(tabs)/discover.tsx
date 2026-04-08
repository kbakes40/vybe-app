// Discover screen — Time Traveler Radio + platform sections
import React, { useEffect, useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import {
  Compass,
  Sparkles,
  TrendingUp,
  Clock,
  Gem,
  RefreshCw,
  Youtube,
  Cloud,
  Play,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { DiscoverCard } from '@/components/DiscoverCard';
import {
  useDiscoverFeedStore,
} from '@/stores/discoverFeedStore';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { usePlaybackController } from '@/stores/playbackController';
import { useRecentsStore } from '@/stores/recentsStore';
import { tracks } from '@/data/mockData';
import { api } from '@/lib/api/api';
import { Track } from '@/types/music';

// ─── Era-based radio stations
const ERA_STATIONS = [
  { id: 'era-70s', name: "70s Classics", decade: '70s', colors: ['#B45309', '#78350F'] as [string, string], searchQuery: '70s classic rock funk soul hits' },
  { id: 'era-80s', name: "80s Hits", decade: '80s', colors: ['#EC4899', '#9333EA'] as [string, string], searchQuery: '80s pop new wave synth hits' },
  { id: 'era-90s', name: "90s Throwback", decade: '90s', colors: ['#06B6D4', '#3B82F6'] as [string, string], searchQuery: '90s hip hop R&B alternative grunge hits' },
  { id: 'era-2000s', name: "2000s Party", decade: '2000s', colors: ['#F97316', '#EF4444'] as [string, string], searchQuery: '2000s pop hip hop party hits' },
  { id: 'era-2010s', name: "2010s Pop", decade: '2010s', colors: ['#8B5CF6', '#EC4899'] as [string, string], searchQuery: '2010s indie pop EDM chart hits' },
];

const ERA_CARD_SIZE = 174;
const ERA_CELL = ERA_CARD_SIZE / 3;
const PLACEHOLDER_COLORS = ['#1a1a2e','#16213e','#0f3460','#533483','#2b2d42','#8d99ae','#3d405b','#81b29a'];

interface PlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
}

function EraStationCard({ station, artworks, onPress }: {
  station: typeof ERA_STATIONS[0];
  artworks: string[];
  onPress: () => void;
}) {
  const cells = [0,1,2,3,'center',4,5,6,7];
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{ marginRight: 12 }}
    >
      <View style={{
        width: ERA_CARD_SIZE,
        height: ERA_CARD_SIZE,
        borderRadius: 16,
        overflow: 'hidden',
        flexDirection: 'row',
        flexWrap: 'wrap',
      }}>
        {cells.map((cell, idx) => {
          if (cell === 'center') {
            return (
              <LinearGradient
                key="center"
                colors={station.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: ERA_CELL, height: ERA_CELL, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{
                  color: '#fff',
                  fontSize: ERA_CELL * 0.34,
                  fontWeight: '900',
                  letterSpacing: -0.5,
                  textAlign: 'center',
                  lineHeight: ERA_CELL * 0.38,
                }}>{station.decade}</Text>
              </LinearGradient>
            );
          }
          const artIdx = cell as number;
          const url = artworks[artIdx];
          return url ? (
            <Image
              key={idx}
              source={{ uri: url }}
              style={{ width: ERA_CELL, height: ERA_CELL }}
              contentFit="cover"
            />
          ) : (
            <View
              key={idx}
              style={{ width: ERA_CELL, height: ERA_CELL, backgroundColor: PLACEHOLDER_COLORS[artIdx % PLACEHOLDER_COLORS.length] }}
            />
          );
        })}
      </View>
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 8, marginLeft: 2 }}>{station.name}</Text>
    </Pressable>
  );
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();

  // Store selectors
  const sections = useDiscoverFeedStore((s) => s.sections);
  const isLoadingFeed = useDiscoverFeedStore((s) => s.isLoadingFeed);
  const feedError = useDiscoverFeedStore((s) => s.feedError);
  const fetchFeed = useDiscoverFeedStore((s) => s.fetchFeed);
  const refreshFeed = useDiscoverFeedStore((s) => s.refreshFeed);
  const fetchPreferences = useDiscoverFeedStore((s) => s.fetchPreferences);
  const playTrack = usePlaybackController(s => s.playTrack);
  const allDownloads = useDownloadsStore(s => s.downloads);
  const recentTracks = useRecentsStore(s => s.recentTracks);

  // YouTube Music state
  const [ytmTracks, setYtmTracks] = useState<PlaylistTrack[]>([]);
  const [ytmQueryLabel, setYtmQueryLabel] = useState('');

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Derived mock data
  const youtubeTracks = tracks
    .filter(t => t.source === 'youtube')
    .sort((a, b) => {
      const aNum = Number((a.id.match(/^yt(\d+)$/)?.[1]) ?? 0);
      const bNum = Number((b.id.match(/^yt(\d+)$/)?.[1]) ?? 0);
      return bNum - aNum;
    });
  const soundcloudTracks = tracks.filter(t => t.source === 'soundcloud');

  // Build artwork pool for Era Station cards
  const artworkPool = allDownloads.length >= 4
    ? allDownloads.map(d => d.artwork).filter(Boolean) as string[]
    : tracks.map(t => t.artwork).filter(Boolean) as string[];

  // Build YTM query from recent history
  const buildYTMQuery = (): string => {
    const ytmArtists = recentTracks
      .filter(t => t.source === 'youtube_music')
      .map(t => t.artist)
      .filter(Boolean);
    if (ytmArtists.length > 0) return `${ytmArtists[0]} new music`;
    const anyRecent = recentTracks.map(t => t.artist).filter(Boolean)[0];
    if (anyRecent) return `${anyRecent} music`;
    return 'trending music 2024';
  };

  // Check onboarding and fetch feed
  useEffect(() => {
    const init = async () => {
      const store = useDiscoverFeedStore.getState();

      if (store.sections.length > 0 && !store.needsOnboarding()) {
        return;
      }

      if (!store.needsOnboarding()) {
        fetchFeed();
        return;
      }

      try {
        await fetchPreferences();
      } catch (error) {
        // ignore
      }

      const updatedStore = useDiscoverFeedStore.getState();
      if (!updatedStore.needsOnboarding()) {
        fetchFeed();
      }
      // If still needs onboarding, do NOT auto-redirect — show the screen normally
    };
    init();
  }, []);

  // Fetch YouTube Music tracks
  useEffect(() => {
    const fetchYTM = async () => {
      try {
        const query = buildYTMQuery();
        setYtmQueryLabel(query.replace(/ music$| new music$/, '').trim());
        const res = await api.get<PlaylistTrack[]>(`/api/youtube/search?q=${encodeURIComponent(query)}&maxResults=10`);
        if (res && res.length > 0) setYtmTracks(res);
      } catch {}
    };
    fetchYTM();
  }, []);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refreshFeed();
    setIsRefreshing(false);
  }, [refreshFeed]);

  const getSectionIcon = (sectionId: string, title: string) => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('youtube')) return <Youtube size={20} color="#FF0000" />;
    if (lowerTitle.includes('soundcloud')) return <Cloud size={20} color="#FF5500" />;
    switch (sectionId) {
      case 'new_today':
      case 'new-today':
        return <Sparkles size={20} color="#8B5CF6" />;
      case 'trending':
        return <TrendingUp size={20} color="#EC4899" />;
      case 'similar_to_clicks':
      case 'similar':
        return <Clock size={20} color="#3B82F6" />;
      case 'hidden_gems':
      case 'hidden-gems':
        return <Gem size={20} color="#10B981" />;
      default:
        return <Compass size={20} color="#8B5CF6" />;
    }
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <LinearGradient
        colors={['#1a1a2e', '#0A0A0A']}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top + 120,
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#8B5CF6"
            colors={['#8B5CF6']}
          />
        }
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top }} className="px-5 pt-4 pb-4">
          <View className="flex-row items-center">
            <Compass size={28} color="#8B5CF6" />
            <Text className="text-white text-2xl font-bold ml-2">
              Discover
            </Text>
          </View>
        </View>

        {/* Time Traveler Radio — top of screen */}
        <View className="mb-4">
          <View className="flex-row items-center px-5 mb-4">
            <Text className="text-white text-xl font-bold">Time Traveler Radio</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            style={{ flexGrow: 0 }}
          >
            {ERA_STATIONS.map((station, stationIdx) => {
              const offset = stationIdx * 3;
              const artworks = Array.from({ length: 8 }, (_, i) =>
                artworkPool[(offset + i) % artworkPool.length]
              );
              return (
                <EraStationCard
                  key={station.id}
                  station={station}
                  artworks={artworks}
                  onPress={async () => {
                    try {
                      const results = await api.get<PlaylistTrack[]>(
                        `/api/youtube/search?q=${encodeURIComponent(station.searchQuery)}&maxResults=15`
                      );
                      if (!results || results.length === 0) return;
                      const eraTracks: Track[] = results.map(t => ({
                        id: `ytm-${t.videoId}`,
                        title: t.title,
                        artist: t.channelName,
                        artistId: '',
                        album: '',
                        albumId: '',
                        artwork: t.thumbnailUrl,
                        duration: 0,
                        isLiked: false,
                        source: 'youtube_music' as const,
                        audioUrl: '',
                        youtubeMusicId: t.videoId,
                      }));
                      playTrack(eraTracks[0], eraTracks);
                    } catch {}
                  }}
                />
              );
            })}
          </ScrollView>
        </View>

        {/* Loading state */}
        {isLoadingFeed && sections.length === 0 ? (
          <Animated.View entering={FadeIn} className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#8B5CF6" />
            <Text className="text-white/60 mt-4">Building your VYBE...</Text>
          </Animated.View>
        ) : null}

        {/* Error state */}
        {feedError && sections.length === 0 ? (
          <Animated.View entering={FadeIn} className="items-center justify-center py-20 px-5">
            <View className="w-16 h-16 rounded-full bg-red-500/20 items-center justify-center mb-4">
              <RefreshCw size={32} color="#EF4444" />
            </View>
            <Text className="text-white text-lg font-semibold mb-2">Could not load recommendations</Text>
            <Text className="text-white/60 text-center mb-6">{feedError}</Text>
            <Pressable onPress={onRefresh} className="bg-[#8B5CF6] px-6 py-3 rounded-xl">
              <Text className="text-white font-semibold">Try Again</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Feed sections */}
        {sections.map((section, sectionIndex) => (
          <Animated.View
            key={section.id}
            entering={FadeInDown.delay(sectionIndex * 100).springify()}
            className="mt-6"
          >
            <View className="flex-row items-center px-5 mb-2">
              {getSectionIcon(section.id, section.title)}
              <Text className="text-white text-xl font-bold ml-2">{section.title}</Text>
            </View>
            {section.subtitle ? (
              <Text className="text-white/50 text-sm px-5 mb-4">{section.subtitle}</Text>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {section.items.map((item) => (
                <DiscoverCard key={item.id} item={item} />
              ))}
              {section.items.length === 0 ? (
                <View className="w-40 h-40 bg-white/5 rounded-xl items-center justify-center">
                  <Text className="text-white/40 text-sm">No items yet</Text>
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>
        ))}

        {/* From YouTube */}
        {youtubeTracks.length > 0 ? (
          <View className="mt-8">
            <View className="flex-row items-center px-5 mb-1">
              <Text className="text-white text-xl font-bold">From YouTube</Text>
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">Music videos and more</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {youtubeTracks.map(track => (
                <Pressable
                  key={track.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    playTrack(track, youtubeTracks);
                  }}
                  className="mr-4"
                >
                  <View className="relative">
                    <Image
                      source={{ uri: track.artwork }}
                      style={{ width: 160, height: 90, borderRadius: 8 }}
                      contentFit="cover"
                    />
                    <View className="absolute top-2 left-2 flex-row items-center bg-black/70 rounded px-1.5 py-0.5">
                      <View style={{ width: 14, height: 14, backgroundColor: '#FF0000', borderRadius: 3, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 0, height: 0, borderLeftWidth: 5, borderTopWidth: 3, borderBottomWidth: 3, borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 1 }} />
                      </View>
                      <Text className="text-white text-[10px] font-medium ml-1">YouTube</Text>
                    </View>
                    <View className="absolute inset-0 items-center justify-center">
                      <View className="w-10 h-10 bg-white/90 rounded-full items-center justify-center">
                        <Play size={20} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 2 }} />
                      </View>
                    </View>
                  </View>
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 160 }}>{track.title}</Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 160 }}>{track.artist}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* From YouTube Music */}
        {ytmTracks.length > 0 ? (
          <View className="mt-8">
            <View className="flex-row items-center px-5 mb-1">
              <Text className="text-white text-xl font-bold">From YouTube Music</Text>
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">
              {ytmQueryLabel ? `More like ${ytmQueryLabel}` : 'Picked for you'}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {ytmTracks.map(t => {
                const track = {
                  id: `ytm-${t.videoId}`,
                  title: t.title,
                  artist: t.channelName,
                  artistId: '',
                  album: '',
                  albumId: '',
                  artwork: t.thumbnailUrl,
                  duration: 0,
                  isLiked: false,
                  source: 'youtube_music' as const,
                  audioUrl: '',
                  youtubeMusicId: t.videoId,
                };
                return (
                  <Pressable
                    key={t.videoId}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      playTrack(track, ytmTracks.map(x => ({
                        id: `ytm-${x.videoId}`,
                        title: x.title,
                        artist: x.channelName,
                        artistId: '',
                        album: '',
                        albumId: '',
                        artwork: x.thumbnailUrl,
                        duration: 0,
                        isLiked: false,
                        source: 'youtube_music' as const,
                        audioUrl: '',
                        youtubeMusicId: x.videoId,
                      })));
                    }}
                    className="mr-4"
                  >
                    <View className="relative">
                      <Image
                        source={{ uri: t.thumbnailUrl }}
                        style={{ width: 140, height: 140, borderRadius: 8 }}
                        contentFit="cover"
                      />
                      <View className="absolute top-2 left-2 flex-row items-center bg-black/70 rounded px-1.5 py-0.5">
                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#fff', fontSize: 8, lineHeight: 10 }}>♪</Text>
                        </View>
                        <Text className="text-white text-[10px] font-medium ml-1">YouTube Music</Text>
                      </View>
                    </View>
                    <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>{t.title}</Text>
                    <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>{t.channelName}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* From SoundCloud */}
        {soundcloudTracks.length > 0 ? (
          <View className="mt-8">
            <View className="flex-row items-center px-5 mb-1">
              <Text className="text-white text-xl font-bold">From SoundCloud</Text>
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">Independent artists and remixes</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {soundcloudTracks.map(track => (
                <Pressable
                  key={track.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    playTrack(track, soundcloudTracks);
                  }}
                  className="mr-4"
                >
                  <View className="relative">
                    <Image
                      source={{ uri: track.artwork }}
                      style={{ width: 140, height: 140, borderRadius: 8 }}
                      contentFit="cover"
                    />
                    <View className="absolute top-2 left-2 flex-row items-center bg-black/70 rounded px-1.5 py-0.5">
                      <View style={{ width: 14, height: 14, backgroundColor: '#FF5500', borderRadius: 3, alignItems: 'center', justifyContent: 'center' }}>
                        <Text className="text-white text-[8px] font-bold">SC</Text>
                      </View>
                      <Text className="text-white text-[10px] font-medium ml-1">SoundCloud</Text>
                    </View>
                  </View>
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>{track.title}</Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>{track.artist}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Footer info */}
        {sections.length > 0 ? (
          <View className="mt-8 px-5">
            <View className="bg-white/5 rounded-xl p-4">
              <Text className="text-white/60 text-sm text-center">
                Recommendations update based on your preferences and listening history.
                Tap a card to open in YouTube or SoundCloud.
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
