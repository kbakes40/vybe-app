import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, ActivityIndicator, RefreshControl, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Play, ChevronRight, Moon, Brain, Cloud, Sparkles } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { PlaylistCard } from '@/components/PlaylistCard';
import { AlbumCard } from '@/components/AlbumCard';
import { VybeIcon } from '@/components/VybeIcon';
import { ProfileMenuOverlay } from '@/components/ProfileMenuOverlay';
import { FreePDSection } from '@/components/FreePDSection';
import { playlists, albums, artists, tracks } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import { useDiscoveryStore, DiscoveredTrack } from '@/stores/discoveryStore';
import { useGreetingStore } from '@/stores/greetingStore';
import { useFreePDStore } from '@/stores/freePDStore';
import { useDownloadStore } from '@/stores/downloadStore';
import { useRecentsStore } from '@/stores/recentsStore';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { api } from '@/lib/api/api';
import { MixDefinition, RelatedTrack, Track } from '@/types/music';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedText = Animated.createAnimatedComponent(Text);

// Era-based radio stations
const ERA_STATIONS = [
  { id: 'era-70s', name: "70s Classics", decade: '70s', colors: ['#B45309', '#78350F'] as [string, string], image: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=400&fit=crop' },
  { id: 'era-80s', name: "80s Hits", decade: '80s', colors: ['#EC4899', '#9333EA'] as [string, string], image: 'https://images.unsplash.com/photo-1571974599782-87624638275e?w=400&h=400&fit=crop' },
  { id: 'era-90s', name: "90s Throwback", decade: '90s', colors: ['#06B6D4', '#3B82F6'] as [string, string], image: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=400&fit=crop' },
  { id: 'era-2000s', name: "2000s Party", decade: '2000s', colors: ['#F97316', '#EF4444'] as [string, string], image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop' },
  { id: 'era-2010s', name: "2010s Pop", decade: '2010s', colors: ['#8B5CF6', '#EC4899'] as [string, string], image: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&h=400&fit=crop' },
];

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-5 mb-4">
      <Text className="text-white text-xl font-bold">{title}</Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} className="flex-row items-center">
          <Text className="text-white/60 text-sm mr-1">See all</Text>
          <ChevronRight size={16} color="rgba(255,255,255,0.6)" />
        </Pressable>
      ) : null}
    </View>
  );
}

interface FeaturedCardProps {
  title: string;
  subtitle: string;
  image: string;
  gradientColors: [string, string];
  onPress: () => void;
}

function FeaturedCard({ title, subtitle, image, gradientColors, onPress }: FeaturedCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      onPressIn={() => { scale.value = withSpring(0.98); }}
      onPressOut={() => { scale.value = withSpring(1); }}
      style={animatedStyle}
      className="mx-5 overflow-hidden rounded-2xl"
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}
      >
        <Image
          source={{ uri: image }}
          style={{ width: 100, height: 100, borderRadius: 12 }}
          contentFit="cover"
        />
        <View className="flex-1 ml-4">
          <Text className="text-white/80 text-xs uppercase tracking-wider mb-1">
            {subtitle}
          </Text>
          <Text className="text-white text-2xl font-bold">{title}</Text>
        </View>
        <View className="w-12 h-12 bg-white/20 rounded-full items-center justify-center">
          <Play size={24} color="#fff" fill="#fff" />
        </View>
      </LinearGradient>
    </AnimatedPressable>
  );
}

interface EraStationCardProps {
  station: typeof ERA_STATIONS[0];
  onPress: () => void;
}

function EraStationCard({ station, onPress }: EraStationCardProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="mr-3"
    >
      <View className="relative overflow-hidden rounded-xl" style={{ width: 140, height: 140 }}>
        <Image
          source={{ uri: station.image }}
          style={{ width: 140, height: 140, borderRadius: 12 }}
          contentFit="cover"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 80,
            justifyContent: 'flex-end',
            padding: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
          }}
        >
          <Text className="text-white font-bold text-sm">{station.name}</Text>
          <View
            className="mt-1 px-2 py-0.5 rounded-full self-start"
            style={{ backgroundColor: station.colors[0] }}
          >
            <Text className="text-white text-xs font-medium">{station.decade}</Text>
          </View>
        </LinearGradient>
      </View>
    </Pressable>
  );
}

interface ArtistGlowCardProps {
  artist: typeof artists[0];
  onPress: () => void;
}

function ArtistGlowCard({ artist, onPress }: ArtistGlowCardProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="mr-4 items-center"
    >
      <View
        style={{
          shadowColor: '#8B5CF6',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.6,
          shadowRadius: 16,
          elevation: 8,
        }}
      >
        <View className="border-2 border-[#8B5CF6] rounded-full p-1">
          <Image
            source={{ uri: artist.image }}
            style={{ width: 80, height: 80, borderRadius: 40 }}
            contentFit="cover"
          />
        </View>
      </View>
      <Text className="text-white font-medium text-sm mt-2 text-center" numberOfLines={1}>
        {artist.name}
      </Text>
      <Text className="text-[#8B5CF6] text-xs">AI Artist</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const playTrack = usePlaybackController(s => s.playTrack);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mixes, setMixes] = useState<MixDefinition[]>([]);
  const [lateNightTracks, setLateNightTracks] = useState<RelatedTrack[]>([]);
  const [focusTracks, setFocusTracks] = useState<RelatedTrack[]>([]);
  const [isLoadingMixes, setIsLoadingMixes] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Greeting store - refreshes on app open
  const getGreeting = useGreetingStore(s => s.getGreeting);
  const refreshGreeting = useGreetingStore(s => s.refreshGreeting);
  const [greeting, setGreeting] = useState('');

  // Scroll animation for greeting fade
  const scrollY = useSharedValue(0);

  const greetingAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 60],
      [1, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  // Refresh greeting on mount (each app open)
  useEffect(() => {
    refreshGreeting();
    setGreeting(getGreeting());
  }, []);

  // Handle scroll events
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
  }, [scrollY]);

  // Discovery store - select raw data, not methods that return new values
  const discoveredTracks = useDiscoveryStore(s => s.discoveredTracks);
  const autoRefreshEnabled = useDiscoveryStore(s => s.autoRefreshEnabled);
  const refreshDiscovery = useDiscoveryStore(s => s.refreshDiscovery);
  const markTrackAsSeen = useDiscoveryStore(s => s.markTrackAsSeen);
  const isDiscoveryRefreshing = useDiscoveryStore(s => s.isRefreshing);

  // FreePD store - royalty free tracks
  const freePDTracks = useFreePDStore(s => s.tracks);
  const freePDLoading = useFreePDStore(s => s.isLoading);
  const freePDError = useFreePDStore(s => s.error);
  const loadFreePDCatalog = useFreePDStore(s => s.loadCatalog);
  const clearFreePDError = useFreePDStore(s => s.clearError);

  // Download store for FreePD downloads
  const startDownload = useDownloadStore(s => s.startDownload);

  // Recents store for recently played tracks (includes imports)
  const recentTracks = useRecentsStore(s => s.recentTracks);
  const addToRecents = useRecentsStore(s => s.addToRecents);

  // Downloads store for imported tracks
  const allDownloads = useDownloadsStore(s => s.downloads);
  const importedTracks = useMemo(() =>
    allDownloads.filter(d => d.isUserImported),
    [allDownloads]
  );

  // Compute fresh finds from raw data
  const freshFinds = useMemo(() =>
    discoveredTracks.filter(t => t.isNew).slice(0, 10),
    [discoveredTracks]
  );
  const newTracksCount = useMemo(() =>
    discoveredTracks.filter(t => t.isNew).length,
    [discoveredTracks]
  );

  // Fetch curated mixes and trigger discovery refresh on mount
  useEffect(() => {
    fetchMixes();
    loadFreePDCatalog(); // Load FreePD catalog
    if (autoRefreshEnabled) {
      refreshDiscovery();
    }
  }, []);

  const fetchMixes = async () => {
    setIsLoadingMixes(true);
    const tracksToPreload: RelatedTrack[] = [];

    try {
      // Fetch Late Night mix tracks
      const lateNightResponse = await api.get<{ mix: MixDefinition; sampleTracks: RelatedTrack[] }>('/api/soundcloud/mixes/late-night');
      if (lateNightResponse?.sampleTracks) {
        setLateNightTracks(lateNightResponse.sampleTracks);
        tracksToPreload.push(...lateNightResponse.sampleTracks);
      }

      // Fetch Focus mix tracks
      const focusResponse = await api.get<{ mix: MixDefinition; sampleTracks: RelatedTrack[] }>('/api/soundcloud/mixes/focus');
      if (focusResponse?.sampleTracks) {
        setFocusTracks(focusResponse.sampleTracks);
        tracksToPreload.push(...focusResponse.sampleTracks);
      }

      // Fetch all mixes
      const mixesResponse = await api.get<MixDefinition[]>('/api/soundcloud/mixes');
      if (mixesResponse) {
        setMixes(mixesResponse);
      }

      // SoundCloud tracks no longer use embedded playback - they open externally via search handoff
    } catch (error) {
      console.log('Could not fetch mixes:', error);
    } finally {
      setIsLoadingMixes(false);
    }
  };

  // Pull to refresh handler
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    await Promise.all([
      fetchMixes(),
      refreshDiscovery(),
    ]);

    setIsRefreshing(false);
  }, []);

  // Handle playing a fresh find
  const handlePlayFreshFind = (track: DiscoveredTrack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    markTrackAsSeen(track.id);
    playTrack(track, freshFinds);
  };

  // Get personalized data
  const madeForYou = playlists.filter(p => p.isPersonalized).slice(0, 1)[0];
  const oldSoulPlaylists = playlists.slice(0, 4);
  const aiArtists = artists.filter(a => a.genres.includes('AI Music') || a.genres.includes('Electronic')).slice(0, 6);
  const recentlyPlayed = albums.slice(0, 6);
  const discoverTracks = tracks.slice(10, 16);
  const youtubeTracks = tracks.filter(t => t.source === 'youtube');
  const youtubeMusicTracks = tracks.filter(t => t.source === 'youtube_music');
  const soundcloudTracks = tracks.filter(t => t.source === 'soundcloud');

  // SoundCloud tracks no longer need preloading - they open externally via search handoff

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      {/* Fixed background gradient that extends behind status bar */}
      <LinearGradient
        colors={['#1a1a2e', '#0A0A0A']}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top + 100, // Extend gradient past header
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#8B5CF6"
            colors={['#8B5CF6']}
          />
        }
      >
        {/* Header - content starts below safe area */}
        <View style={{ paddingTop: insets.top }}>
          {/* Logo and profile row */}
          <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
            <VybeIcon size={36} variant="primary" />
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowProfileMenu(true);
              }}
            >
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop' }}
                style={{ width: 36, height: 36, borderRadius: 18 }}
                contentFit="cover"
              />
            </Pressable>
          </View>
          {/* Dynamic greeting - fades on scroll */}
          <Animated.View style={[{ paddingHorizontal: 20, paddingBottom: 12 }, greetingAnimatedStyle]}>
            <Text className="text-white/70 text-lg font-light tracking-wide">
              {greeting}
            </Text>
          </Animated.View>
        </View>

        {/* Your VYBE - Featured Card */}
        {madeForYou ? (
          <View className="mt-4">
            <FeaturedCard
              title="Your VYBE"
              subtitle="Made for you"
              image={madeForYou.artwork}
              gradientColors={madeForYou.gradientColors ?? ['#8B5CF6', '#3B82F6']}
              onPress={() => router.push(`/(app)/playlist/${madeForYou.id}` as never)}
            />
          </View>
        ) : null}

        {/* Fresh Finds - New discoveries based on listening */}
        {freshFinds.length > 0 && (
          <View className="mt-8">
            <View className="flex-row items-center px-5 mb-4">
              <Sparkles size={20} color="#8B5CF6" />
              <Text className="text-white text-xl font-bold ml-2">Fresh Finds</Text>
              {newTracksCount > 0 && (
                <View className="ml-2 bg-[#8B5CF6] px-2 py-0.5 rounded-full">
                  <Text className="text-white text-xs font-bold">{newTracksCount} new</Text>
                </View>
              )}
              {isDiscoveryRefreshing && (
                <ActivityIndicator size="small" color="#8B5CF6" style={{ marginLeft: 8 }} />
              )}
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">
              New picks based on what you played
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {freshFinds.map(track => (
                <Pressable
                  key={track.id}
                  onPress={() => handlePlayFreshFind(track)}
                  className="mr-4"
                >
                  <View className="relative">
                    <Image
                      source={{ uri: track.artwork }}
                      style={{ width: 140, height: 140, borderRadius: 8 }}
                      contentFit="cover"
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(139,92,246,0.6)']}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 60,
                        borderBottomLeftRadius: 8,
                        borderBottomRightRadius: 8,
                      }}
                    />
                    {track.isNew && (
                      <View className="absolute top-2 right-2 bg-[#8B5CF6] px-1.5 py-0.5 rounded">
                        <Text className="text-white text-[9px] font-bold">NEW</Text>
                      </View>
                    )}
                    <View className="absolute top-2 left-2 flex-row items-center bg-black/70 rounded px-1.5 py-0.5">
                      <Cloud size={10} color="#FF5500" />
                      <Text className="text-[#FF5500] text-[9px] font-medium ml-1">SC</Text>
                    </View>
                  </View>
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>
                    {track.title}
                  </Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>
                    {track.artist}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Royalty Free - FreePD Section */}
        <FreePDSection
          tracks={freePDTracks.slice(0, 10) as Track[]}
          isLoading={freePDLoading}
          error={freePDError}
          onRetry={() => {
            clearFreePDError();
            loadFreePDCatalog();
          }}
          onSeeAll={() => router.push('/(app)/freepd-catalog' as never)}
          onDownload={(track) => startDownload(track)}
        />

        {/* Old Soul, New Sound */}
        <View className="mt-8">
          <SectionHeader title="Old Soul, New Sound" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            style={{ flexGrow: 0 }}
          >
            {oldSoulPlaylists.map(playlist => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                onPress={() => router.push(`/(app)/playlist/${playlist.id}` as never)}
                size="medium"
              />
            ))}
          </ScrollView>
        </View>

        {/* AI Artists to Watch */}
        <View className="mt-8">
          <SectionHeader title="AI Artists to Watch" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            style={{ flexGrow: 0 }}
          >
            {aiArtists.map(artist => (
              <ArtistGlowCard
                key={artist.id}
                artist={artist}
                onPress={() => router.push(`/(app)/artist/${artist.id}` as never)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Time Traveler Radio */}
        <View className="mt-8">
          <SectionHeader title="Time Traveler Radio" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            style={{ flexGrow: 0 }}
          >
            {ERA_STATIONS.map(station => (
              <EraStationCard
                key={station.id}
                station={station}
                onPress={() => {
                  // Play era-specific tracks
                  const eraTracks = tracks.slice(0, 5);
                  if (eraTracks.length > 0) {
                    playTrack(eraTracks[0], eraTracks);
                  }
                }}
              />
            ))}
          </ScrollView>
        </View>

        {/* Discover Something Different */}
        <View className="mt-8">
          <SectionHeader title="Discover Something Different" />
          <Text className="text-white/50 text-sm px-5 mb-4">
            Step outside your comfort zone
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            style={{ flexGrow: 0 }}
          >
            {discoverTracks.map(track => (
              <Pressable
                key={track.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  playTrack(track, discoverTracks);
                }}
                className="mr-4"
              >
                <View className="relative">
                  <Image
                    source={{ uri: track.artwork }}
                    style={{ width: 140, height: 140, borderRadius: 8 }}
                    contentFit="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.8)']}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 60,
                      borderBottomLeftRadius: 8,
                      borderBottomRightRadius: 8,
                      justifyContent: 'flex-end',
                      padding: 8,
                    }}
                  >
                    <Text className="text-white font-semibold text-sm" numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text className="text-white/60 text-xs" numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </LinearGradient>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {/* Recently Played - Shows actual recent tracks including imports */}
        {(recentTracks.length > 0 || importedTracks.length > 0) && (
          <View className="mt-8">
            <SectionHeader title="Recently Played" onSeeAll={() => router.push('/(app)/downloads' as never)} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {/* Show recent tracks first, then imported if no recents */}
              {(recentTracks.length > 0 ? recentTracks.slice(0, 10) : importedTracks.slice(0, 6)).map(track => (
                <Pressable
                  key={track.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    addToRecents(track);
                    playTrack(track);
                  }}
                  className="mr-4"
                  style={{ width: 140 }}
                >
                  <View
                    style={{
                      width: 140,
                      height: 140,
                      borderRadius: 8,
                      overflow: 'hidden',
                      backgroundColor: '#1A1A1A',
                    }}
                  >
                    {track.artwork ? (
                      <Image
                        source={{ uri: track.artwork }}
                        style={{ width: 140, height: 140 }}
                        contentFit="cover"
                      />
                    ) : (
                      <LinearGradient
                        colors={['#8B5CF6', '#6D28D9']}
                        style={{
                          width: 140,
                          height: 140,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Play size={32} color="#fff" fill="#fff" />
                      </LinearGradient>
                    )}
                    {/* Imported badge */}
                    {track.isUserImported && (
                      <View
                        style={{
                          position: 'absolute',
                          bottom: 8,
                          left: 8,
                          backgroundColor: 'rgba(139,92,246,0.9)',
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 4,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>
                          Imported
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-white font-medium mt-2" numberOfLines={1}>
                    {track.title}
                  </Text>
                  <Text className="text-white/60 text-sm" numberOfLines={1}>
                    {track.artist}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Fallback: Show albums if no recents yet */}
        {recentTracks.length === 0 && importedTracks.length === 0 && (
          <View className="mt-8">
            <SectionHeader title="Recently Played" onSeeAll={() => {}} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {recentlyPlayed.map(album => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onPress={() => router.push(`/(app)/album/${album.id}` as never)}
                  size="small"
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Popular Playlists */}
        <View className="mt-8">
          <SectionHeader title="Popular Playlists" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            style={{ flexGrow: 0 }}
          >
            {playlists.slice(4).map(playlist => (
              <PlaylistCard
                key={playlist.id}
                playlist={playlist}
                onPress={() => router.push(`/(app)/playlist/${playlist.id}` as never)}
                size="medium"
              />
            ))}
          </ScrollView>
        </View>

        {/* YouTube Music */}
        {youtubeTracks.length > 0 ? (
          <View className="mt-8">
            <SectionHeader title="From YouTube" />
            <Text className="text-white/50 text-sm px-5 mb-4">
              Music videos and more
            </Text>
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
                    {/* YouTube badge */}
                    <View
                      className="absolute top-2 left-2 flex-row items-center bg-black/70 rounded px-1.5 py-0.5"
                    >
                      <View
                        style={{
                          width: 14,
                          height: 14,
                          backgroundColor: '#FF0000',
                          borderRadius: 3,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
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
                      <Text className="text-white text-[10px] font-medium ml-1">
                        YouTube
                      </Text>
                    </View>
                    {/* Play overlay */}
                    <View className="absolute inset-0 items-center justify-center">
                      <View className="w-10 h-10 bg-white/90 rounded-full items-center justify-center">
                        <Play size={20} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 2 }} />
                      </View>
                    </View>
                  </View>
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 160 }}>
                    {track.title}
                  </Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 160 }}>
                    {track.artist}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* YouTube Music */}
        {youtubeMusicTracks.length > 0 ? (
          <View className="mt-8">
            <SectionHeader title="From YouTube Music" />
            <Text className="text-white/50 text-sm px-5 mb-4">
              Premium music streaming
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {youtubeMusicTracks.map(track => (
                <Pressable
                  key={track.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    playTrack(track, youtubeMusicTracks);
                  }}
                  className="mr-4"
                >
                  <View className="relative">
                    <Image
                      source={{ uri: track.artwork }}
                      style={{ width: 140, height: 140, borderRadius: 8 }}
                      contentFit="cover"
                    />
                    {/* YouTube Music badge */}
                    <View
                      className="absolute top-2 left-2 flex-row items-center bg-black/70 rounded-full px-1.5 py-0.5"
                    >
                      <View
                        style={{
                          width: 14,
                          height: 14,
                          backgroundColor: '#FF0000',
                          borderRadius: 7,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <View
                          style={{
                            width: 0,
                            height: 0,
                            borderLeftWidth: 4,
                            borderTopWidth: 2.5,
                            borderBottomWidth: 2.5,
                            borderLeftColor: '#fff',
                            borderTopColor: 'transparent',
                            borderBottomColor: 'transparent',
                            marginLeft: 1,
                          }}
                        />
                      </View>
                      <Text className="text-white text-[10px] font-medium ml-1">
                        YT Music
                      </Text>
                    </View>
                  </View>
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>
                    {track.title}
                  </Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>
                    {track.artist}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* SoundCloud */}
        {soundcloudTracks.length > 0 ? (
          <View className="mt-8">
            <SectionHeader title="From SoundCloud" />
            <Text className="text-white/50 text-sm px-5 mb-4">
              Independent artists and remixes
            </Text>
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
                    {/* SoundCloud badge */}
                    <View
                      className="absolute top-2 left-2 flex-row items-center bg-black/70 rounded px-1.5 py-0.5"
                    >
                      <View
                        style={{
                          width: 14,
                          height: 14,
                          backgroundColor: '#FF5500',
                          borderRadius: 3,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text className="text-white text-[8px] font-bold">SC</Text>
                      </View>
                      <Text className="text-white text-[10px] font-medium ml-1">
                        SoundCloud
                      </Text>
                    </View>
                  </View>
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>
                    {track.title}
                  </Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>
                    {track.artist}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Late Night Mix */}
        {lateNightTracks.length > 0 && (
          <View className="mt-8">
            <View className="flex-row items-center px-5 mb-4">
              <Moon size={20} color="#8B5CF6" />
              <Text className="text-white text-xl font-bold ml-2">Late Night</Text>
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">
              Ambient, downtempo & experimental for the late hours
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {lateNightTracks.map(track => (
                <Pressable
                  key={track.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    playTrack(track, lateNightTracks);
                  }}
                  className="mr-4"
                >
                  <View className="relative">
                    <Image
                      source={{ uri: track.artwork }}
                      style={{ width: 140, height: 140, borderRadius: 8 }}
                      contentFit="cover"
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(139,92,246,0.6)']}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 60,
                        borderBottomLeftRadius: 8,
                        borderBottomRightRadius: 8,
                      }}
                    />
                    {track.isUnderground && (
                      <View className="absolute top-2 right-2 bg-[#8B5CF6]/80 rounded px-1.5 py-0.5">
                        <Text className="text-white text-[9px] font-medium">Underground</Text>
                      </View>
                    )}
                    <View className="absolute top-2 left-2 flex-row items-center bg-black/70 rounded px-1.5 py-0.5">
                      <Cloud size={10} color="#FF5500" />
                      <Text className="text-[#FF5500] text-[9px] font-medium ml-1">SC</Text>
                    </View>
                  </View>
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>
                    {track.title}
                  </Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>
                    {track.artist}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Focus Mix */}
        {focusTracks.length > 0 && (
          <View className="mt-8">
            <View className="flex-row items-center px-5 mb-4">
              <Brain size={20} color="#10B981" />
              <Text className="text-white text-xl font-bold ml-2">Focus Flow</Text>
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">
              Lo-fi, ambient & instrumental for deep concentration
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {focusTracks.map(track => (
                <Pressable
                  key={track.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    playTrack(track, focusTracks);
                  }}
                  className="mr-4"
                >
                  <View className="relative">
                    <Image
                      source={{ uri: track.artwork }}
                      style={{ width: 140, height: 140, borderRadius: 8 }}
                      contentFit="cover"
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(16,185,129,0.5)']}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 60,
                        borderBottomLeftRadius: 8,
                        borderBottomRightRadius: 8,
                      }}
                    />
                    {track.isUnderground && (
                      <View className="absolute top-2 right-2 bg-[#10B981]/80 rounded px-1.5 py-0.5">
                        <Text className="text-white text-[9px] font-medium">Underground</Text>
                      </View>
                    )}
                    <View className="absolute top-2 left-2 flex-row items-center bg-black/70 rounded px-1.5 py-0.5">
                      <Cloud size={10} color="#FF5500" />
                      <Text className="text-[#FF5500] text-[9px] font-medium ml-1">SC</Text>
                    </View>
                  </View>
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>
                    {track.title}
                  </Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>
                    {track.artist}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Import SoundCloud CTA */}
        <View className="mt-8 mx-5 mb-4">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/(app)/soundcloud-import' as never);
            }}
          >
            <LinearGradient
              colors={['#FF5500', '#CC4400']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderRadius: 12,
              }}
            >
              <Cloud size={24} color="#fff" />
              <View className="flex-1 ml-3">
                <Text className="text-white font-bold">Import from SoundCloud</Text>
                <Text className="text-white/70 text-sm">Add your favorite underground tracks</Text>
              </View>
              <ChevronRight size={20} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </ScrollView>

      {/* Profile Menu Overlay */}
      <ProfileMenuOverlay
        visible={showProfileMenu}
        onClose={() => setShowProfileMenu(false)}
        userName="Alex"
        userImage="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop"
        userEmail="alex@vybe.app"
      />
    </View>
  );
}
