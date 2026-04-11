import React, { useEffect, useCallback, useState, useRef } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Compass,
  Sparkles,
  TrendingUp,
  Clock,
  Gem,
  RefreshCw,
  Settings,
  Youtube,
  Cloud,
  Moon,
  Brain,
  Play,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { DiscoverCard } from '@/components/DiscoverCard';
import { useDiscoverFeedStore, DiscoverItem } from '@/stores/discoverFeedStore';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { usePlaybackController } from '@/stores/playbackController';
import { Track } from '@/types/music';

// ─── Vybe Beats Card ─────────────────────────────────────────────────────────
const BEATS_GRID = 200;
const BEATS_TILE = (BEATS_GRID - 2) / 2;

function BeatsFlipTile({ uri, size }: { uri: string; size: number }) {
  const flip = useSharedValue(0);
  const [displayed, setDisplayed] = useState(uri);

  useEffect(() => {
    if (uri === displayed) return;
    flip.value = withSequence(
      withTiming(1, { duration: 220, easing: Easing.in(Easing.ease) }, (done) => {
        if (done) runOnJS(setDisplayed)(uri);
      }),
      withTiming(0, { duration: 220, easing: Easing.out(Easing.ease) }),
    );
  }, [uri]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 600 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 90])}deg` }],
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, animStyle]}>
      <Image source={{ uri: displayed }} style={{ width: size, height: size }} contentFit="cover" cachePolicy="memory-disk" />
    </Animated.View>
  );
}

function VybeBeatsCard({ items, onPress }: { items: DiscoverItem[]; onPress: () => void }) {
  const cardScale = useSharedValue(1);
  const cardAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));

  const artworks = items.slice(0, 4).map(i => i.thumbnailUrl).filter(Boolean);
  const [slots, setSlots] = useState<string[]>(() => {
    const init = artworks.slice(0, 4);
    while (init.length < 4) init.push(init[init.length - 1] ?? '');
    return init;
  });
  const slotAge = useRef<number[]>([3, 2, 1, 0]);
  const prevNewest = useRef('');

  useEffect(() => {
    const newest = artworks[0];
    if (!newest || newest === prevNewest.current) return;
    prevNewest.current = newest;
    setSlots(prev => {
      if (prev.includes(newest)) return prev;
      const maxAge = Math.max(...slotAge.current);
      const idx = slotAge.current.indexOf(maxAge);
      slotAge.current = slotAge.current.map((a, i) => i === idx ? 0 : a + 1);
      const next = [...prev]; next[idx] = newest; return next;
    });
  }, [artworks[0]]);

  const subtitle = items.length > 0
    ? [...new Set(items.slice(0, 4).map(i => i.creatorName))].slice(0, 3).join(', ')
    : 'Your curated picks';

  return (
    <Animated.View style={[{ marginHorizontal: 20 }, cardAnimStyle]}>
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
        onPressIn={() => { cardScale.value = withSpring(0.97); }}
        onPressOut={() => { cardScale.value = withSpring(1); }}
      >
        <LinearGradient
          colors={['#1A0836', '#0F0428', '#0D0722']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: 18, overflow: 'hidden' }}
        >
          <View style={{ flexDirection: 'row', minHeight: BEATS_GRID }}>
            <View style={{ flex: 1, paddingLeft: 16, paddingVertical: 20, paddingRight: 12, justifyContent: 'space-between' }}>
              <View>
                <View style={{ backgroundColor: '#7C3AED', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }}>NEW</Text>
                </View>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 26 }} numberOfLines={2}>Vybe Beats</Text>
                <Text style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12, marginTop: 5 }} numberOfLines={1}>{subtitle}</Text>
              </View>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={20} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 2 }} />
              </View>
            </View>
            <View style={{ width: BEATS_GRID, height: BEATS_GRID }}>
              <View style={{ flex: 1, flexDirection: 'column' }}>
                <View style={{ flex: 1, flexDirection: 'row' }}>
                  <BeatsFlipTile uri={slots[0]} size={BEATS_TILE} />
                  <View style={{ width: 2, backgroundColor: '#0D0722' }} />
                  <BeatsFlipTile uri={slots[1]} size={BEATS_TILE} />
                </View>
                <View style={{ height: 2, backgroundColor: '#0D0722' }} />
                <View style={{ flex: 1, flexDirection: 'row' }}>
                  <BeatsFlipTile uri={slots[2]} size={BEATS_TILE} />
                  <View style={{ width: 2, backgroundColor: '#0D0722' }} />
                  <BeatsFlipTile uri={slots[3]} size={BEATS_TILE} />
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

/**
 * Discover Tab Screen
 *
 * Shows personalized recommendations from YouTube and SoundCloud.
 * Users can browse sections like "New Today", "Trending In Your Vibe", etc.
 *
 * If user hasn't completed onboarding, redirects to preferences screen.
 */
export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Downloads for local playlist sections
  const downloads = useDownloadsStore((s) => s.downloads);
  const playTrack = usePlaybackController((s) => s.playTrack);

  // Store selectors
  const sections = useDiscoverFeedStore((s) => s.sections);
  const preferences = useDiscoverFeedStore((s) => s.preferences);
  const isLoadingFeed = useDiscoverFeedStore((s) => s.isLoadingFeed);
  const feedError = useDiscoverFeedStore((s) => s.feedError);
  const fetchFeed = useDiscoverFeedStore((s) => s.fetchFeed);
  const refreshFeed = useDiscoverFeedStore((s) => s.refreshFeed);
  const needsOnboarding = useDiscoverFeedStore((s) => s.needsOnboarding);
  const fetchPreferences = useDiscoverFeedStore((s) => s.fetchPreferences);
  const completeOnboardingWithInstantFeed = useDiscoverFeedStore((s) => s.completeOnboardingWithInstantFeed);

  // Debug: log the current state whenever the screen gains focus
  useEffect(() => {
    console.log('[Discover] State snapshot:', {
      sectionCount: sections.length,
      itemCounts: sections.map(s => ({ id: s.id, items: s.items?.length ?? 0 })),
      onboardingComplete: preferences?.onboardingComplete,
      isLoadingFeed,
      feedError,
    });
  }, [sections, preferences, isLoadingFeed, feedError]);

  // State
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Check if onboarding is needed and fetch data — re-runs every time the tab gains focus
  // so the card appears immediately after the user completes "Update Preferences"
  useFocusEffect(
    useCallback(() => {
      const init = async () => {
        const store = useDiscoverFeedStore.getState();

        // Already have sections and onboarding complete — nothing to do, let zustand re-render
        if (store.sections.length > 0 && !store.needsOnboarding()) {
          console.log('[Discover] Using existing sections from store');
          return;
        }

        // Onboarding complete locally but sections are empty — re-run instant-onboarding
        // with stored preferences to do a FRESH YouTube+SoundCloud search (not just cache read).
        // This populates the Vybe Beats card with real music after Update Preferences.
        if (!store.needsOnboarding()) {
          const prefs = store.preferences;
          console.log('[Discover] Onboarding complete but sections empty, re-running instant onboarding with:', {
            genres: prefs.genres,
            moods: prefs.moods,
            artists: prefs.favoriteArtists,
          });
          completeOnboardingWithInstantFeed({
            genres: prefs.genres ?? [],
            moods: prefs.moods ?? [],
            favoriteArtists: prefs.favoriteArtists ?? [],
          });
          return;
        }

        // Try to fetch preferences from server (may fail if not logged in)
        try {
          await fetchPreferences();
        } catch (error) {
          console.log('[Discover] Failed to fetch preferences, checking local state');
        }

        // Re-check after fetch attempt
        const updatedStore = useDiscoverFeedStore.getState();
        if (updatedStore.needsOnboarding()) {
          router.replace('/(app)/discover-onboarding');
        } else {
          refreshFeed();
        }
      };
      init();
    }, [refreshFeed, fetchPreferences, completeOnboardingWithInstantFeed, router])
  );

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refreshFeed();
    setIsRefreshing(false);
  }, [refreshFeed]);

  // Navigate to onboarding to update preferences
  const handleEditPreferences = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(app)/discover-onboarding');
  };

  // Get section icon based on section ID and title
  const getSectionIcon = (sectionId: string, title: string) => {
    // Check for platform-specific sections by title
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('youtube')) {
      return <Youtube size={20} color="#FF0000" />;
    }
    if (lowerTitle.includes('soundcloud')) {
      return <Cloud size={20} color="#FF5500" />;
    }

    // Fall back to section-based icons
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
      {/* Background gradient */}
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
        <View style={{ paddingTop: insets.top }} className="px-5 pt-4 pb-6">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Compass size={28} color="#8B5CF6" />
              <Text className="text-white text-2xl font-bold ml-2">
                Discover
              </Text>
            </View>

            <Pressable
              onPress={handleEditPreferences}
              className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"
            >
              <Settings size={20} color="#fff" />
            </Pressable>
          </View>
          <Text className="text-white/60 mt-1">
            Personalized picks from YouTube and SoundCloud
          </Text>
        </View>

        {/* Loading state */}
        {isLoadingFeed && sections.length === 0 ? (
          <Animated.View
            entering={FadeIn}
            className="items-center justify-center py-20"
          >
            <ActivityIndicator size="large" color="#8B5CF6" />
            <Text className="text-white/60 mt-4">
              Building your VYBE...
            </Text>
          </Animated.View>
        ) : null}

        {/* Error state */}
        {feedError && sections.length === 0 ? (
          <Animated.View
            entering={FadeIn}
            className="items-center justify-center py-20 px-5"
          >
            <View className="w-16 h-16 rounded-full bg-red-500/20 items-center justify-center mb-4">
              <RefreshCw size={32} color="#EF4444" />
            </View>
            <Text className="text-white text-lg font-semibold mb-2">
              Could not load recommendations
            </Text>
            <Text className="text-white/60 text-center mb-6">
              {feedError}
            </Text>
            <Pressable
              onPress={onRefresh}
              className="bg-[#8B5CF6] px-6 py-3 rounded-xl"
            >
              <Text className="text-white font-semibold">Try Again</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Empty state removed — the gear icon in the header handles preference updates
            and the Vybe Beats card below covers the no-sections case visually. */}

        {/* Vybe Beats — curated from preferences. Show whenever onboarding is complete
            so the card appears immediately after "Update Preferences" even if the feed
            is still loading or returned empty. */}
        {preferences?.onboardingComplete ? (() => {
          const allItems = sections.flatMap(s => s.items);
          const tracks: Track[] = allItems.map(item => ({
            id: item.id,
            title: item.title,
            artist: item.creatorName,
            artistId: '',
            album: '',
            albumId: '',
            artwork: item.thumbnailUrl,
            duration: 0,
            isLiked: false,
            source: item.sourcePlatform === 'YOUTUBE' ? 'youtube' : 'soundcloud',
            youtubeId: item.sourcePlatform === 'YOUTUBE' ? item.id : undefined,
            soundcloudUrl: item.sourcePlatform === 'SOUNDCLOUD' ? item.externalUrl : undefined,
          }));
          return (
            <Animated.View entering={FadeInDown.delay(0).springify()} className="mt-4">
              <VybeBeatsCard
                items={allItems}
                onPress={() => { if (tracks.length > 0) playTrack(tracks[0], tracks); }}
              />
            </Animated.View>
          );
        })() : null}

        {/* Late Night Mix — from saved tracks */}
        <Animated.View entering={FadeInDown.delay(0).springify()} className="mt-6">
          <View className="flex-row items-center px-5 mb-2">
            <Moon size={20} color="#8B5CF6" />
            <Text className="text-white text-xl font-bold ml-2">Late Night</Text>
          </View>
          <Text className="text-white/50 text-sm px-5 mb-4">
            Ambient, downtempo & experimental for the late hours
          </Text>
          {downloads.length === 0 ? (
            <View className="mx-5 bg-white/5 rounded-xl p-4 items-center">
              <Text className="text-white/40 text-sm">Save songs to fill this playlist</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
              {[...downloads].sort((a, b) => a.importedAt - b.importedAt).map((track) => (
                <Pressable key={track.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, [...downloads].sort((a, b) => a.importedAt - b.importedAt)); }} className="mr-4">
                  <View className="relative">
                    <Image source={{ uri: track.artwork ?? undefined }} style={{ width: 140, height: 140, borderRadius: 8 }} contentFit="cover" />
                    <LinearGradient colors={['transparent', 'rgba(139,92,246,0.6)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }} />
                  </View>
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>{track.title}</Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>{track.artist}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Animated.View>

        {/* Focus Flow — from saved tracks */}
        <Animated.View entering={FadeInDown.delay(100).springify()} className="mt-6">
          <View className="flex-row items-center px-5 mb-2">
            <Brain size={20} color="#10B981" />
            <Text className="text-white text-xl font-bold ml-2">Focus Flow</Text>
          </View>
          <Text className="text-white/50 text-sm px-5 mb-4">
            Lo-fi, ambient & instrumental for deep concentration
          </Text>
          {downloads.length === 0 ? (
            <View className="mx-5 bg-white/5 rounded-xl p-4 items-center">
              <Text className="text-white/40 text-sm">Save songs to fill this playlist</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
              {[...downloads].sort((a, b) => b.importedAt - a.importedAt).map((track) => (
                <Pressable key={track.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, [...downloads].sort((a, b) => b.importedAt - a.importedAt)); }} className="mr-4">
                  <View className="relative">
                    <Image source={{ uri: track.artwork ?? undefined }} style={{ width: 140, height: 140, borderRadius: 8 }} contentFit="cover" />
                    <LinearGradient colors={['transparent', 'rgba(16,185,129,0.5)']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 }} />
                  </View>
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>{track.title}</Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>{track.artist}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Animated.View>

        {/* Feed sections */}
        {sections.map((section, sectionIndex) => (
          <Animated.View
            key={section.id}
            entering={FadeInDown.delay(sectionIndex * 100).springify()}
            className="mt-6"
          >
            {/* Section header */}
            <View className="flex-row items-center px-5 mb-2">
              {getSectionIcon(section.id, section.title)}
              <Text className="text-white text-xl font-bold ml-2">
                {section.title}
              </Text>
            </View>
            {section.subtitle ? (
              <Text className="text-white/50 text-sm px-5 mb-4">
                {section.subtitle}
              </Text>
            ) : null}

            {/* Horizontal scroll of cards */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {section.items.map((item) => (
                <DiscoverCard key={item.id} item={item} />
              ))}

              {/* Empty section placeholder */}
              {section.items.length === 0 ? (
                <View className="w-40 h-40 bg-white/5 rounded-xl items-center justify-center">
                  <Text className="text-white/40 text-sm">
                    No items yet
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>
        ))}

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
