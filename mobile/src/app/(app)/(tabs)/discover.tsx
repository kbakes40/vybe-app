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
import { useDiscoverFeedStore, DiscoverItem, DiscoverSection } from '@/stores/discoverFeedStore';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { usePlaybackController } from '@/stores/playbackController';
import { MixDefinition, Track } from '@/types/music';
import { createMMKVCache, TTL } from '@/lib/mmkv-cache';
import { api } from '@/lib/api/api';

// Curated playlist types — match home screen backend response shapes
interface PlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
}
interface CuratedPlaylist {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  tracks: PlaylistTrack[];
  category?: string;
  section?: string;
}
interface SpotifyPlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  durationMs: number;
}
interface SpotifyPlaylist {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  tracks: SpotifyPlaylistTrack[];
}

// Top Spotify playlist IDs — same curated set used on home tab
const SPOTIFY_DISCOVER_IDS = [
  '4eqLPb9xwuPk2CyECDyH3X',
  '37i9dQZF1DX0XUsuxWHRQd',
  '37i9dQZF1EQnqst5TRi17F',
  '37i9dQZF1EIezQcATIWbSB',
  '37i9dQZF1DWZFV9Asvj1J9',
  '1D3oAiNwFiZq0eXT8dVBmH',
];

// MMKV last-known-good cache for the discover tab. Additive: the zustand
// store (persisted to AsyncStorage) is still the source of truth for the
// session. On cold app start, if the zustand hydration hasn't populated yet,
// we seed the zustand store synchronously from MMKV so the feed paints on
// first frame instead of waiting for network + AsyncStorage hydration.
const discoverMMKV = createMMKVCache('vybe-discover');
const DISCOVER_KEYS = {
  sections: 'sections',
  vybeBeats: 'vybeBeats',
  ytCuratedPlaylists: 'ytCuratedPlaylists',
  scMixes: 'scMixes',
  spotifyPlaylists: 'spotifyPlaylists',
  // Trending track feeds per source
  ytVideosFeed: 'ytVideosFeed',
  ytmTracksFeed: 'ytmTracksFeed',
  scTracksFeed: 'scTracksFeed',
} as const;

// SoundCloud track shape returned by /api/soundcloud/search
interface SCSearchTrack {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
}

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
// Module-level synchronous hydration from MMKV into the zustand store.
// Runs once on first import of this screen. If the store is already populated
// (via its AsyncStorage persist) this is a no-op.
let _discoverMMKVHydrated = false;
function hydrateDiscoverFromMMKV() {
  if (_discoverMMKVHydrated) return;
  _discoverMMKVHydrated = true;
  try {
    const state = useDiscoverFeedStore.getState();
    if (state.sections.length === 0) {
      const hit = discoverMMKV.get<DiscoverSection[]>(DISCOVER_KEYS.sections, TTL.CURATED);
      if (hit?.value?.length) {
        useDiscoverFeedStore.setState({ sections: hit.value });
      }
    }
    if (state.vybeBeats.length === 0) {
      const beatsHit = discoverMMKV.get<DiscoverItem[]>(DISCOVER_KEYS.vybeBeats, TTL.CURATED);
      if (beatsHit?.value?.length) {
        useDiscoverFeedStore.setState({ vybeBeats: beatsHit.value });
      }
    }
  } catch {
    /* silent — best-effort */
  }
}
hydrateDiscoverFromMMKV();

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

  // Debug logging removed — was causing excessive re-renders

  // State
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const vybeBeats = useDiscoverFeedStore((s) => s.vybeBeats);
  const setVybeBeats = useDiscoverFeedStore((s) => s.setVybeBeats);

  // Curated backend playlists — lazy-seed from MMKV so they paint instantly on cold launch
  const [ytCuratedPlaylists, setYtCuratedPlaylists] = useState<CuratedPlaylist[]>(() => {
    const hit = discoverMMKV.get<CuratedPlaylist[]>(DISCOVER_KEYS.ytCuratedPlaylists, TTL.CURATED);
    return hit?.value ?? [];
  });
  const [scMixes, setScMixes] = useState<MixDefinition[]>(() => {
    const hit = discoverMMKV.get<MixDefinition[]>(DISCOVER_KEYS.scMixes, TTL.CURATED);
    return hit?.value ?? [];
  });
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPlaylist[]>(() => {
    const hit = discoverMMKV.get<SpotifyPlaylist[]>(DISCOVER_KEYS.spotifyPlaylists, TTL.CURATED);
    return hit?.value ?? [];
  });
  // Trending track feeds per source — backend cached 1h
  const [ytVideosFeed, setYtVideosFeed] = useState<PlaylistTrack[]>(() => {
    const hit = discoverMMKV.get<PlaylistTrack[]>(DISCOVER_KEYS.ytVideosFeed, TTL.GENRE);
    return hit?.value ?? [];
  });
  const [ytmTracksFeed, setYtmTracksFeed] = useState<PlaylistTrack[]>(() => {
    const hit = discoverMMKV.get<PlaylistTrack[]>(DISCOVER_KEYS.ytmTracksFeed, TTL.GENRE);
    return hit?.value ?? [];
  });
  const [scTracksFeed, setScTracksFeed] = useState<SCSearchTrack[]>(() => {
    const hit = discoverMMKV.get<SCSearchTrack[]>(DISCOVER_KEYS.scTracksFeed, TTL.GENRE);
    return hit?.value ?? [];
  });

  // Fetch curated playlists + trending feeds from backend (cached, so hits are <100ms)
  useEffect(() => {
    (async () => {
      const [yt, sc, sp, ytVideos, ytmTracks, scTracks] = await Promise.all([
        api.get<CuratedPlaylist[]>('/api/youtube/playlists').catch(() => null),
        api.get<MixDefinition[]>('/api/soundcloud/mixes').catch(() => null),
        Promise.all(SPOTIFY_DISCOVER_IDS.map(id =>
          api.get<SpotifyPlaylist>(`/api/spotify/playlist/${id}`).catch(() => null)
        )),
        api.get<PlaylistTrack[]>(`/api/youtube/search?q=${encodeURIComponent('popular music videos')}&maxResults=15`).catch(() => null),
        api.get<PlaylistTrack[]>(`/api/youtube/search?q=${encodeURIComponent('new music 2025')}&maxResults=15`).catch(() => null),
        api.get<SCSearchTrack[]>(`/api/soundcloud/search?q=${encodeURIComponent('hidden gems')}&maxResults=15`).catch(() => null),
      ]);
      if (yt && yt.length > 0) {
        const filtered = yt.filter(p => p.tracks.length > 0);
        setYtCuratedPlaylists(filtered);
        discoverMMKV.set(DISCOVER_KEYS.ytCuratedPlaylists, filtered);
      }
      if (sc && sc.length > 0) {
        setScMixes(sc);
        discoverMMKV.set(DISCOVER_KEYS.scMixes, sc);
      }
      const validSp = sp.filter((r): r is SpotifyPlaylist => !!r && r.tracks.length > 0);
      if (validSp.length > 0) {
        setSpotifyPlaylists(validSp);
        discoverMMKV.set(DISCOVER_KEYS.spotifyPlaylists, validSp);
      }
      if (ytVideos && ytVideos.length > 0) {
        setYtVideosFeed(ytVideos);
        discoverMMKV.set(DISCOVER_KEYS.ytVideosFeed, ytVideos);
      }
      if (ytmTracks && ytmTracks.length > 0) {
        setYtmTracksFeed(ytmTracks);
        discoverMMKV.set(DISCOVER_KEYS.ytmTracksFeed, ytmTracks);
      }
      if (scTracks && scTracks.length > 0) {
        setScTracksFeed(scTracks);
        discoverMMKV.set(DISCOVER_KEYS.scTracksFeed, scTracks);
      }
    })();
  }, []);

  // Persist sections + vybeBeats to MMKV whenever they change so the next
  // cold start can paint instantly from disk (before AsyncStorage hydrates).
  useEffect(() => {
    if (sections.length > 0) {
      discoverMMKV.set(DISCOVER_KEYS.sections, sections);
    }
  }, [sections]);
  useEffect(() => {
    if (vybeBeats.length > 0) {
      discoverMMKV.set(DISCOVER_KEYS.vybeBeats, vybeBeats);
    }
  }, [vybeBeats]);

  // Client-side fallback: when preferences are set but sections are empty
  // (e.g. backend /api/discover is auth-gated and failing), build a Vybe Beats
  // feed directly from the public YouTube + SoundCloud search endpoints using
  // the user's onboarding answers (genres, moods, favorite artists). This
  // keeps the card populated without auth.
  useEffect(() => {
    if (!preferences?.onboardingComplete) return;
    if (sections.length > 0) return;
    if (vybeBeats.length > 0) return;

    // Build seed queries from the onboarding answers.
    // Artists are the strongest signal, then genre+mood combos, then bare genres.
    const artists = (preferences.favoriteArtists ?? []).filter((a) => a && a.length > 0);
    const genres = (preferences.genres ?? []).filter((g) => g && g.length > 0);
    const moods = (preferences.moods ?? []).filter((m) => m && m.length > 0);

    const seeds: string[] = [];
    artists.slice(0, 2).forEach((a) => seeds.push(a));
    genres.slice(0, 2).forEach((g, i) => {
      const mood = moods[i % Math.max(moods.length, 1)];
      seeds.push(mood ? `${mood} ${g}` : `${g} music`);
    });
    if (seeds.length === 0) seeds.push('new music');

    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!backendUrl) return;

    let cancelled = false;
    (async () => {
      try {
        // Run YouTube + SoundCloud searches in parallel for each seed.
        const ytPromises = seeds.slice(0, 3).map(async (q) => {
          const resp = await fetch(`${backendUrl}/api/youtube/search?q=${encodeURIComponent(q)}&maxResults=3`);
          if (!resp.ok) return [] as DiscoverItem[];
          const json = await resp.json();
          const items = (json.data ?? []) as Array<{ videoId: string; title: string; channelName: string; thumbnailUrl: string }>;
          return items.map((it): DiscoverItem => ({
            id: `yt-${it.videoId}`,
            sourcePlatform: 'YOUTUBE',
            title: it.title,
            creatorName: it.channelName,
            thumbnailUrl: it.thumbnailUrl,
            externalUrl: `https://www.youtube.com/watch?v=${it.videoId}`,
            deepLinkUrl: `youtube://watch?v=${it.videoId}`,
            searchQuery: q,
            publishedAt: null,
            createdAt: new Date().toISOString(),
          }));
        });

        const scPromises = seeds.slice(0, 3).map(async (q) => {
          const resp = await fetch(`${backendUrl}/api/soundcloud/search?q=${encodeURIComponent(q)}&maxResults=3`);
          if (!resp.ok) return [] as DiscoverItem[];
          const json = await resp.json();
          const items = (json.data ?? []) as Array<{ trackId: string; title: string; artist: string; artwork: string; soundcloudUrl: string }>;
          return items.map((it): DiscoverItem => ({
            id: `sc-${it.trackId}`,
            sourcePlatform: 'SOUNDCLOUD',
            title: it.title,
            creatorName: it.artist,
            thumbnailUrl: it.artwork,
            externalUrl: it.soundcloudUrl,
            deepLinkUrl: it.soundcloudUrl,
            searchQuery: q,
            publishedAt: null,
            createdAt: new Date().toISOString(),
          }));
        });

        const [ytResults, scResults] = await Promise.all([
          Promise.all(ytPromises),
          Promise.all(scPromises),
        ]);
        if (cancelled) return;

        // Interleave YT + SC results so the card mixes sources instead of
        // grouping them. This matches how the feed would look if the backend
        // built it.
        const yt = ytResults.flat();
        const sc = scResults.flat();
        const merged: DiscoverItem[] = [];
        const maxLen = Math.max(yt.length, sc.length);
        for (let i = 0; i < maxLen; i++) {
          if (yt[i]) merged.push(yt[i]);
          if (sc[i]) merged.push(sc[i]);
        }

        const seen = new Set<string>();
        const unique = merged.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
        setVybeBeats(unique.slice(0, 5));
      } catch (err) {
        console.warn('[Discover] Local beats fallback failed:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [preferences?.onboardingComplete, preferences?.genres, preferences?.moods, preferences?.favoriteArtists, sections.length, vybeBeats.length]);

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
            Personalized picks from Vybe Music and Vybe Waves
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

        {/* Error state removed — the gear icon in the header handles preference updates
            and the Vybe Beats card below covers the no-sections case visually. */}

        {/* Vybe Beats — curated from preferences. Show whenever onboarding is complete
            so the card appears immediately after "Update Preferences" even if the feed
            is still loading or returned empty. */}
        {preferences?.onboardingComplete ? (() => {
          const sectionItems = sections.flatMap(s => s.items);
          const allItems = sectionItems.length > 0 ? sectionItems : vybeBeats;
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
                onPress={() => router.push('/(app)/vybe-beats')}
              />
            </Animated.View>
          );
        })() : null}

        {/* Vybe Music Playlists — curated YouTube Music playlists (backend cached 24h) */}
        {ytCuratedPlaylists.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(0).springify()} className="mt-6">
            <View className="flex-row items-center px-5 mb-2">
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={11} color="#fff" fill="#fff" />
              </View>
              <Text className="text-white text-xl font-bold ml-2">Vybe Music Playlists</Text>
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">Top picks from YouTube Music</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
              {ytCuratedPlaylists.map(pl => {
                const queue: Track[] = pl.tracks.map(t => ({
                  id: `ytm-${t.videoId}`,
                  title: t.title,
                  artist: t.channelName,
                  artistId: '', album: pl.name, albumId: `ytm-pl-${pl.playlistId}`,
                  artwork: t.thumbnailUrl,
                  duration: 0, isLiked: false,
                  source: 'youtube_music' as const,
                  youtubeMusicId: t.videoId, youtubeId: t.videoId,
                  audioUrl: '',
                }));
                if (queue.length === 0) return null;
                return (
                  <Pressable key={pl.playlistId} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(queue[0], queue); }} className="mr-4">
                    <Image source={{ uri: pl.thumbnailUrl }} style={{ width: 160, height: 160, borderRadius: 10 }} contentFit="cover" />
                    <Text className="text-white font-semibold text-sm mt-2" numberOfLines={2} style={{ width: 160 }}>{pl.name}</Text>
                    <Text className="text-white/50 text-xs mt-0.5" numberOfLines={1}>{pl.tracks.length} tracks</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* Vybe Waves Mixes — curated SoundCloud mixes (backend cached 24h) */}
        {scMixes.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(50).springify()} className="mt-6">
            <View className="flex-row items-center px-5 mb-2">
              <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: '#FF5500', alignItems: 'center', justifyContent: 'center' }}>
                <Cloud size={12} color="#fff" />
              </View>
              <Text className="text-white text-xl font-bold ml-2">Vybe Waves Mixes</Text>
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">Top mixes from SoundCloud</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
              {scMixes.map(mix => (
                <Pressable key={mix.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push(`/(app)/vybe-mix?mixId=${mix.id}` as never); }} className="mr-4">
                  <Image source={{ uri: mix.coverImage }} style={{ width: 160, height: 160, borderRadius: 10, backgroundColor: '#1a1a1a' }} contentFit="cover" />
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={2} style={{ width: 160 }}>{mix.name}</Text>
                  {mix.description ? <Text className="text-white/50 text-xs mt-0.5" numberOfLines={1}>{mix.description}</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* Stream Library — curated Spotify playlists bridged to in-app playback */}
        {spotifyPlaylists.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(100).springify()} className="mt-6">
            <View className="flex-row items-center px-5 mb-2">
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#000', fontSize: 11, fontWeight: '900' }}>♫</Text>
              </View>
              <Text className="text-white text-xl font-bold ml-2">Stream Library Picks</Text>
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">Curated playlists, streamed in-app</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
              {spotifyPlaylists.map(pl => {
                const queue: Track[] = pl.tracks.map(t => ({
                  id: `sp-yt-${t.videoId}`,
                  title: t.title,
                  artist: t.channelName,
                  artistId: '', album: pl.name, albumId: `sp-${pl.playlistId}`,
                  artwork: t.thumbnailUrl,
                  duration: Math.round((t.durationMs ?? 0) / 1000),
                  isLiked: false,
                  source: 'youtube_music' as const,
                  youtubeId: t.videoId, youtubeMusicId: t.videoId,
                  audioUrl: '',
                }));
                if (queue.length === 0) return null;
                return (
                  <Pressable key={pl.playlistId} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(queue[0], queue); }} className="mr-4">
                    <Image source={{ uri: pl.thumbnailUrl }} style={{ width: 160, height: 160, borderRadius: 10 }} contentFit="cover" />
                    <Text className="text-white font-semibold text-sm mt-2" numberOfLines={2} style={{ width: 160 }}>{pl.name}</Text>
                    <Text className="text-white/50 text-xs mt-0.5" numberOfLines={1}>{pl.tracks.length} tracks</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* From YouTube — trending music videos (backend cached 1h) */}
        {ytVideosFeed.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(120).springify()} className="mt-6">
            <View className="flex-row items-center px-5 mb-2">
              <View style={{ width: 20, height: 16, borderRadius: 3, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={9} color="#fff" fill="#fff" />
              </View>
              <Text className="text-white text-xl font-bold ml-2">From YouTube</Text>
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">Trending music videos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
              {ytVideosFeed.map(t => {
                const queue: Track[] = ytVideosFeed.map(x => ({
                  id: `yt-${x.videoId}`, title: x.title, artist: x.channelName,
                  artistId: '', album: '', albumId: '',
                  artwork: x.thumbnailUrl, duration: 0, isLiked: false,
                  source: 'youtube' as const, youtubeId: x.videoId, audioUrl: '',
                }));
                const track = queue.find(q => q.id === `yt-${t.videoId}`)!;
                return (
                  <Pressable key={track.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, queue); }} className="mr-4">
                    <Image source={{ uri: t.thumbnailUrl }} style={{ width: 160, height: 90, borderRadius: 8 }} contentFit="cover" />
                    <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 160 }}>{t.title}</Text>
                    <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 160 }}>{t.channelName}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* From YouTube Music — new music (backend cached 1h) */}
        {ytmTracksFeed.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(140).springify()} className="mt-6">
            <View className="flex-row items-center px-5 mb-2">
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 11 }}>♪</Text>
              </View>
              <Text className="text-white text-xl font-bold ml-2">From YouTube Music</Text>
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">Fresh tracks to explore</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
              {ytmTracksFeed.map(t => {
                const queue: Track[] = ytmTracksFeed.map(x => ({
                  id: `ytm-${x.videoId}`, title: x.title, artist: x.channelName,
                  artistId: '', album: '', albumId: '',
                  artwork: x.thumbnailUrl, duration: 0, isLiked: false,
                  source: 'youtube_music' as const, youtubeMusicId: x.videoId, youtubeId: x.videoId, audioUrl: '',
                }));
                const track = queue.find(q => q.id === `ytm-${t.videoId}`)!;
                return (
                  <Pressable key={track.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, queue); }} className="mr-4">
                    <Image source={{ uri: t.thumbnailUrl }} style={{ width: 140, height: 140, borderRadius: 8 }} contentFit="cover" />
                    <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>{t.title}</Text>
                    <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>{t.channelName}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* From SoundCloud — hidden gems (backend cached 1h) */}
        {scTracksFeed.length > 0 ? (
          <Animated.View entering={FadeInDown.delay(160).springify()} className="mt-6">
            <View className="flex-row items-center px-5 mb-2">
              <View style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: '#FF5500', alignItems: 'center', justifyContent: 'center' }}>
                <Cloud size={12} color="#fff" />
              </View>
              <Text className="text-white text-xl font-bold ml-2">From SoundCloud</Text>
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">Underground tracks waiting to be discovered</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
              {scTracksFeed.map(t => {
                const queue: Track[] = scTracksFeed.map(x => ({
                  id: `sc-${x.trackId}`, title: x.title, artist: x.artist,
                  artistId: '', album: '', albumId: '',
                  artwork: x.artwork, duration: x.duration, isLiked: false,
                  source: 'soundcloud' as const, soundcloudUrl: x.soundcloudUrl, audioUrl: '',
                }));
                const track = queue.find(q => q.id === `sc-${t.trackId}`)!;
                return (
                  <Pressable key={track.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, queue); }} className="mr-4">
                    <Image source={{ uri: t.artwork }} style={{ width: 140, height: 140, borderRadius: 8 }} contentFit="cover" />
                    <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>{t.title}</Text>
                    <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>{t.artist}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* Late Night Mix — from saved tracks */}
        <Animated.View entering={FadeInDown.delay(180).springify()} className="mt-6">
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
                <DiscoverCard key={item.id} item={item} queue={section.items} />
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
                Tap a card to open in Vybe Music or Vybe Waves.
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
