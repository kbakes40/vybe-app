import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, ActivityIndicator, RefreshControl, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Play, ChevronRight, Moon, Brain, Cloud, Sparkles, MoreHorizontal } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';
import { PlaylistCard } from '@/components/PlaylistCard';
import { AlbumCard } from '@/components/AlbumCard';
import { VybeIcon } from '@/components/VybeIcon';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { ProfileMenuOverlay } from '@/components/ProfileMenuOverlay';
import { FreePDSection } from '@/components/FreePDSection';
import {
  playlists,
  albums,
  artists,
  tracks,
} from '@/data/mockData';
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

// ─── Mood tabs ────────────────────────────────────────────────────────────────

function formatPlayCount(id: string): string {
  const n = id.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0);
  const mag = n % 3;
  if (mag === 0) return `${((n * 1337) % 18) + 1}.${(n * 7) % 10}M plays`;
  if (mag === 1) return `${((n * 73) % 900) + 100}K plays`;
  return `${((n * 31) % 49) + 1}.${(n * 3) % 10}K plays`;
}

function SourceIcon({ source }: { source: string | undefined }) {
  if (source === 'soundcloud') {
    return (
      <View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: '#FF5500', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
        <Text style={{ color: '#fff', fontSize: 7, fontWeight: '900', letterSpacing: -0.5 }}>)))</Text>
      </View>
    );
  }
  if (source === 'youtube_music') {
    // Red circle with music note — YouTube Music
    return (
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
        <Text style={{ color: '#fff', fontSize: 9, lineHeight: 10 }}>♪</Text>
      </View>
    );
  }
  if (source === 'youtube') {
    // Red rounded rect with play triangle
    return (
      <View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
        <View style={{ width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', marginLeft: 1 }} />
      </View>
    );
  }
  // Default: Vybe purple
  return (
    <View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
      <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>V</Text>
    </View>
  );
}

// ─── Daily Mix Hero Card ──────────────────────────────────────────────────────

// Latitude-ring sphere — uniform tile coverage for a full globe (~184 tiles)
const SPHERE_R = 86;
const BASE_ART_SIZE = 22;
const TILE_SPACING = 28; // arc distance between tile centres (world units)

const SPHERE_POINTS: { x: number; y: number; z: number }[] = (() => {
  const pts: { x: number; y: number; z: number }[] = [];
  const numRings = 12; // polar rings from top to bottom

  for (let ri = 0; ri <= numRings; ri++) {
    const theta = (ri / numRings) * Math.PI; // 0 = top pole, π = bottom pole
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const ringRadius = SPHERE_R * sinT;

    // Poles get 1 tile; other rings packed to fill circumference
    const n = (ri === 0 || ri === numRings)
      ? 1
      : Math.max(1, Math.round(2 * Math.PI * ringRadius / TILE_SPACING));

    for (let j = 0; j < n; j++) {
      const phiOffset = ri % 2 === 0 ? 0 : Math.PI / n; // stagger rings so tiles interleave
      const phi = (2 * Math.PI * j / n) + phiOffset;
      pts.push({
        x: SPHERE_R * sinT * Math.cos(phi),
        y: SPHERE_R * cosT * 0.88, // slightly flattened to fit card height
        z: SPHERE_R * sinT * Math.sin(phi),
      });
    }
  }

  return pts.sort((a, b) => a.z - b.z); // initial back-to-front order
})();

interface DailyMixHeroCardProps {
  title: string;
  artistNames: string;
  artworks: string[];
  onPress: () => void;
}

function DailyMixHeroCard({ title, artistNames, artworks, onPress }: DailyMixHeroCardProps) {
  const cardScale = useSharedValue(1);
  const cardAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));

  const sphereW = 230;
  const sphereH = 220;
  const cx = sphereW / 2;
  const cy = sphereH / 2;

  // Card background colour used for edge vignette
  const BG = '#0D0722';

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
          style={{ borderRadius: 18, overflow: 'hidden', minHeight: 180 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingVertical: 14, paddingRight: 0 }}>
            {/* Left: badge + title + play */}
            <View style={{ flex: 1, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
                <View style={{ backgroundColor: '#7C3AED', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }}>NEW</Text>
                </View>
              </View>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', lineHeight: 24 }} numberOfLines={2}>{title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12, marginTop: 4 }} numberOfLines={1}>{artistNames}</Text>
              <View style={{ marginTop: 14 }}>
                <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Play size={20} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 2 }} />
                </View>
              </View>
            </View>

            {/* Right: sphere clipped to a circle — no square artifact */}
            <View style={{
              width: sphereW,
              height: sphereH,
              borderRadius: sphereW / 2,
              overflow: 'hidden',
              backgroundColor: 'transparent',
            }}>
              {artworks.length > 0 && SPHERE_POINTS.map((pt, i) => {
                const depth = (pt.z + SPHERE_R) / (2 * SPHERE_R);
                const size = BASE_ART_SIZE * (0.70 + 0.30 * depth);
                const opacity = 0.35 + 0.65 * depth;
                const artwork = artworks[i % artworks.length];
                if (!artwork) return null;
                return (
                  <Image
                    key={i}
                    source={{ uri: artwork }}
                    style={{
                      position: 'absolute',
                      left: cx + pt.x - size / 2,
                      top: cy + pt.y - size / 2,
                      width: size,
                      height: size,
                      borderRadius: 3,
                      opacity,
                      zIndex: Math.round(pt.z),
                    }}
                    contentFit="cover"
                  />
                );
              })}
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── Quick Pick Row ───────────────────────────────────────────────────────────
interface QuickPickRowProps {
  track: Track;
  onPress: () => void;
  onMore?: () => void;
}

function QuickPickRow({ track, onPress, onMore }: QuickPickRowProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => { scale.value = withSpring(0.98); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 }}
      >
        <View style={{ width: 52, height: 52, borderRadius: 6, overflow: 'hidden', backgroundColor: '#1C1C1C' }}>
          <Image source={{ uri: track.artwork }} style={{ width: 52, height: 52 }} contentFit="cover" />
        </View>
        <View style={{ flex: 1, marginLeft: 13 }}>
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }} numberOfLines={1}>{track.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
            <SourceIcon source={track.source} />
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }} numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
        </View>
        <Pressable onPress={onMore} hitSlop={12} style={{ padding: 6 }}>
          <MoreHorizontal size={18} color="rgba(255,255,255,0.35)" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

// ─── Era-based radio stations
const ERA_STATIONS = [
  { id: 'era-70s', name: "70s Classics", decade: '70s', colors: ['#B45309', '#78350F'] as [string, string], image: 'https://images.unsplash.com/photo-1619983081563-430f63602796?w=400&h=400&fit=crop', searchQuery: '70s classic rock funk soul hits' },
  { id: 'era-80s', name: "80s Hits", decade: '80s', colors: ['#EC4899', '#9333EA'] as [string, string], image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop', searchQuery: '80s pop new wave synth hits' },
  { id: 'era-90s', name: "90s Throwback", decade: '90s', colors: ['#06B6D4', '#3B82F6'] as [string, string], image: 'https://images.unsplash.com/photo-1484755560615-a4c64e778a6c?w=400&h=400&fit=crop', searchQuery: '90s hip hop R&B alternative grunge hits' },
  { id: 'era-2000s', name: "2000s Party", decade: '2000s', colors: ['#F97316', '#EF4444'] as [string, string], image: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=400&h=400&fit=crop', searchQuery: '2000s pop hip hop party hits' },
  { id: 'era-2010s', name: "2010s Pop", decade: '2010s', colors: ['#8B5CF6', '#EC4899'] as [string, string], image: 'https://images.unsplash.com/photo-1501386761578-ecd5f5d78b7b?w=400&h=400&fit=crop', searchQuery: '2010s indie pop EDM chart hits' },
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


// 3×3 album-art grid card — center tile shows the era name
const ERA_CARD_SIZE = 174;
const ERA_CELL = ERA_CARD_SIZE / 3; // 58px per cell

interface EraStationCardProps {
  station: typeof ERA_STATIONS[0];
  artworks: string[]; // 8 artwork URLs for the surrounding cells
  onPress: () => void;
}

// Fallback placeholder colours when no artwork is available
const PLACEHOLDER_COLORS = ['#1a1a2e','#16213e','#0f3460','#533483','#2b2d42','#8d99ae','#3d405b','#81b29a'];

function EraStationCard({ station, artworks, onPress }: EraStationCardProps) {
  // 3×3 grid positions: index 4 is center (era name tile)
  // Surrounding 8 slots filled by artworks array
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

// All genres we can recommend — each has lowercase keywords to match against
// the user's existing library, and a search query to use on YouTube Music.
const GENRE_CATALOG: { name: string; keywords: string[]; query: string }[] = [
  { name: 'Jazz',        keywords: ['jazz'],                       query: 'best jazz music playlist' },
  { name: 'Classical',   keywords: ['classical', 'orchestra', 'symphony'], query: 'classical music essentials' },
  { name: 'R&B',         keywords: ['r&b', 'rnb', 'soul'],         query: 'r&b soul music hits' },
  { name: 'Latin',       keywords: ['latin', 'reggaeton', 'salsa'], query: 'latin music hits 2024' },
  { name: 'Country',     keywords: ['country'],                    query: 'country music hits' },
  { name: 'Reggae',      keywords: ['reggae', 'dancehall'],        query: 'reggae music playlist' },
  { name: 'Blues',       keywords: ['blues'],                      query: 'blues music classics' },
  { name: 'Metal',       keywords: ['metal', 'heavy metal'],       query: 'metal music playlist' },
  { name: 'Punk',        keywords: ['punk', 'hardcore'],           query: 'punk rock music' },
  { name: 'Folk',        keywords: ['folk', 'acoustic', 'singer-songwriter'], query: 'folk acoustic music' },
  { name: 'Electronic',  keywords: ['electronic', 'edm', 'house', 'techno', 'trance'], query: 'electronic dance music hits' },
  { name: 'Hip-Hop',     keywords: ['hip-hop', 'hip hop', 'rap', 'trap'], query: 'hip hop rap music 2024' },
  { name: 'Pop',         keywords: ['pop'],                        query: 'pop music hits 2024' },
  { name: 'Rock',        keywords: ['rock', 'indie rock', 'alternative rock'], query: 'rock music classics' },
  { name: 'Indie',       keywords: ['indie', 'alternative'],       query: 'indie alternative music' },
  { name: 'Afrobeats',   keywords: ['afrobeats', 'afro', 'afropop'], query: 'afrobeats music playlist' },
  { name: 'K-Pop',       keywords: ['k-pop', 'kpop', 'korean pop'], query: 'kpop music hits' },
  { name: 'Ambient',     keywords: ['ambient', 'chill', 'lo-fi', 'lofi'], query: 'ambient chill music' },
  { name: 'Drill',       keywords: ['drill', 'uk drill'],          query: 'drill music playlist' },
  { name: 'Funk',        keywords: ['funk', 'disco'],              query: 'funk disco music classics' },
  { name: 'Gospel',      keywords: ['gospel', 'worship', 'christian'], query: 'gospel music playlist' },
  { name: 'Bossa Nova',  keywords: ['bossa nova', 'bossa', 'samba'], query: 'bossa nova jazz music' },
  { name: 'Psychedelic', keywords: ['psychedelic', 'psych rock'],  query: 'psychedelic rock music' },
  { name: 'Emo',         keywords: ['emo', 'post-hardcore'],       query: 'emo music playlist' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const playTrack = usePlaybackController(s => s.playTrack);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mixes, setMixes] = useState<MixDefinition[]>([]);
  const [lateNightTracks, setLateNightTracks] = useState<RelatedTrack[]>([]);
  const [focusTracks, setFocusTracks] = useState<RelatedTrack[]>([]);
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylist[]>([]);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [ytmTracks, setYtmTracks] = useState<PlaylistTrack[]>([]);
  const [ytmQueryLabel, setYtmQueryLabel] = useState('');
  const [discoverGenreTracks, setDiscoverGenreTracks] = useState<(PlaylistTrack & { genre: string })[]>([]);
  const [discoverGenreLabel, setDiscoverGenreLabel] = useState('');
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

  // Return 2–3 genres the user hasn't explored based on their library
  const getAbsentGenres = () => {
    const userTags = new Set<string>();
    [...allDownloads, ...recentTracks, ...discoveredTracks].forEach(t => {
      [...(t.genreTags ?? []), ...(t.tags ?? [])].forEach(tag =>
        userTags.add(tag.toLowerCase())
      );
      // Source-based heuristics
      if (t.source === 'soundcloud') userTags.add('electronic');
      if (t.source === 'youtube_music' || t.source === 'youtube') userTags.add('pop');
    });
    const absent = GENRE_CATALOG.filter(g =>
      !g.keywords.some(kw => userTags.has(kw))
    );
    // Shuffle and pick 2
    const shuffled = absent.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 2);
  };

  // Build a personalised YouTube Music search query from listening history
  const buildYTMQuery = (): string => {
    const ytmArtists = recentTracks
      .filter(t => t.source === 'youtube_music')
      .map(t => t.artist)
      .filter(Boolean);
    if (ytmArtists.length > 0) return `${ytmArtists[0]} new music`;
    const anyRecent = recentTracks.map(t => t.artist).filter(Boolean)[0];
    if (anyRecent) return `${anyRecent} music`;
    const discArtist = discoveredTracks.map(t => t.artist).filter(Boolean)[0];
    if (discArtist) return `${discArtist} music`;
    return 'trending music 2024';
  };

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

      // Fetch curated YouTube Music playlists
      const playlistsResponse = await api.get<CuratedPlaylist[]>('/api/youtube/playlists');
      if (playlistsResponse) {
        setCuratedPlaylists(playlistsResponse.filter(p => p.tracks.length > 0));
      }

      // Fetch Spotify playlists (bridged to YouTube for playback)
      const spotifyIds = [
        '4eqLPb9xwuPk2CyECDyH3X',       // Chilling all day | Lo-fi beats
        '37i9dQZF1DX0XUsuxWHRQd',        // RapCaviar
        '37i9dQZF1EQnqst5TRi17F',        // Hip Hop Mix
        '37i9dQZF1EIezQcATIWbSB',        // 2020s Hip Hop Mix
        '37i9dQZF1DWZFV9Asvj1J9',        // RapCaviar Presents: Best Hip-Hop Songs
        '1D3oAiNwFiZq0eXT8dVBmH',        // 2024 Rap Songs
      ];
      const spotifyResults = await Promise.all(
        spotifyIds.map(id => api.get<SpotifyPlaylist>(`/api/spotify/playlist/${id}`).catch(() => null))
      );
      const validSpotify = spotifyResults.filter((r): r is SpotifyPlaylist => !!r && r.tracks.length > 0);
      if (validSpotify.length > 0) setSpotifyPlaylists(validSpotify);

      // Fetch personalized YouTube Music tracks based on listening history
      const ytmQuery = buildYTMQuery();
      setYtmQueryLabel(ytmQuery.replace(/ music$| new music$/, '').trim());
      const ytmResponse = await api.get<PlaylistTrack[]>(`/api/youtube/search?q=${encodeURIComponent(ytmQuery)}&maxResults=10`);
      if (ytmResponse && ytmResponse.length > 0) {
        setYtmTracks(ytmResponse);
      }

      // Fetch tracks for genres the user hasn't explored
      const absentGenres = getAbsentGenres();
      if (absentGenres.length > 0) {
        setDiscoverGenreLabel(absentGenres.map(g => g.name).join(' & '));
        const genreResults = await Promise.all(
          absentGenres.map(g =>
            api.get<PlaylistTrack[]>(`/api/youtube/search?q=${encodeURIComponent(g.query)}&maxResults=5`)
              .then(res => (res ?? []).map(t => ({ ...t, genre: g.name })))
              .catch(() => [])
          )
        );
        // Interleave tracks from each genre so they alternate in the scroll
        const interleaved: (PlaylistTrack & { genre: string })[] = [];
        const maxLen = Math.max(...genreResults.map(r => r.length));
        for (let i = 0; i < maxLen; i++) {
          genreResults.forEach(r => { if (r[i]) interleaved.push(r[i]); });
        }
        setDiscoverGenreTracks(interleaved);
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
  const discoverTracks = tracks.filter(t => t.source === 'youtube' || t.source === 'youtube_music' || t.source === 'soundcloud').slice(0, 6);
  const youtubeTracks = tracks
    .filter(t => t.source === 'youtube')
    .sort((a, b) => {
      const aNum = Number((a.id.match(/^yt(\d+)$/)?.[1]) ?? 0);
      const bNum = Number((b.id.match(/^yt(\d+)$/)?.[1]) ?? 0);
      return bNum - aNum;
    });
  const soundcloudTracks = tracks.filter(t => t.source === 'soundcloud');

  // Quick picks — up to 20 most recently downloaded tracks (4 pages of 5)
  const quickPicks = useMemo(() =>
    [...allDownloads].reverse().slice(0, 20) as Track[],
    [allDownloads]
  );

  const heroArtists = useMemo(() =>
    [...new Set(quickPicks.slice(0, 3).map(t => t.artist))].join(', '),
    [quickPicks]
  );

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
            <ProfileAvatar
              size={36}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowProfileMenu(true);
              }}
            />
          </View>
          {/* Dynamic greeting - fades on scroll */}
          <Animated.View style={[{ paddingHorizontal: 20, paddingBottom: 12 }, greetingAnimatedStyle]}>
            <Text className="text-white/70 text-lg font-light tracking-wide">
              {greeting}
            </Text>
          </Animated.View>
        </View>


        {/* ── Daily Mix Hero Card ── */}
        <View className="mt-5">
          <DailyMixHeroCard
            title={madeForYou?.title ?? 'Daily Mix 1'}
            artistNames={heroArtists || 'Flume, ODESZA, Tycho'}
            artworks={(() => {
              const pool = allDownloads.length > 0
                ? allDownloads.map(d => d.artwork).filter(Boolean) as string[]
                : quickPicks.map(t => t.artwork).filter(Boolean) as string[];
              return pool;
            })()}
            onPress={() => { if (quickPicks.length > 0) playTrack(quickPicks[0], quickPicks); }}
          />
        </View>

        {/* ── Quick Picks ── */}
        <View className="mt-6">
          <SectionHeader title="Quick picks" />
          {quickPicks.length === 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, paddingHorizontal: 20, paddingVertical: 16 }}>
              No tracks yet — pull down to refresh
            </Text>
          ) : (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0 }}
            >
              {[quickPicks.slice(0, 5), quickPicks.slice(5, 10), quickPicks.slice(10, 15), quickPicks.slice(15, 20)].filter(page => page.length > 0).map((page, pageIdx) => (
                <View key={pageIdx} style={{ width: Dimensions.get('window').width }}>
                  {page.map(track => (
                    <QuickPickRow
                      key={track.id}
                      track={track}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, quickPicks); }}
                      onMore={() => {}}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
          {quickPicks.length > 5 && (
            <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center', paddingTop: 6, paddingBottom: 2 }}>
              Swipe right for more
            </Text>
          )}
        </View>

        {/* All-time Essentials — YouTube Music playlists */}
        {curatedPlaylists.length > 0 && (() => {
          const renderPlaylistCard = (playlist: CuratedPlaylist) => {
            const playlistTracks: Track[] = playlist.tracks.map(t => ({
              id: `ytm-${t.videoId}`,
              title: t.title,
              artist: t.channelName,
              artistId: `ytm-artist-${t.videoId}`,
              album: playlist.name,
              albumId: `ytm-pl-${playlist.playlistId}`,
              artwork: t.thumbnailUrl,
              duration: 0,
              isLiked: false,
              source: 'youtube_music' as const,
              youtubeId: t.videoId,
              youtubeMusicId: t.videoId,
              youtubeMusicUrl: `https://music.youtube.com/watch?v=${t.videoId}`,
            }));
            const cover = playlist.thumbnailUrl || playlistTracks[0]?.artwork || '';
            return (
              <Pressable
                key={playlist.playlistId}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push(`/(app)/playlist-detail?id=${playlist.playlistId}` as never);
                }}
                className="mr-4"
              >
                <View style={{ width: 150 }}>
                  <View style={{ width: 150, height: 150, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1C1C1C' }}>
                    <Image source={{ uri: cover }} style={{ width: 150, height: 150 }} contentFit="cover" />
                    <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 3 }}>
                      <View style={{ width: 13, height: 13, backgroundColor: '#FF0000', borderRadius: 6.5, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 0, height: 0, borderLeftWidth: 4, borderTopWidth: 2.5, borderBottomWidth: 2.5, borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 1 }} />
                      </View>
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '600', marginLeft: 4 }}>YT Music</Text>
                    </View>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        if (playlistTracks.length > 0) playTrack(playlistTracks[0], playlistTracks);
                      }}
                      style={{ position: 'absolute', bottom: 8, right: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Play size={16} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 2 }} />
                    </Pressable>
                  </View>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13, marginTop: 8 }} numberOfLines={2}>{playlist.name}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 }}>{playlist.tracks.length} songs</Text>
                </View>
              </Pressable>
            );
          };

          const essentials = curatedPlaylists.filter(p => !p.category);
          const categories = Array.from(new Set(
            curatedPlaylists.filter(p => p.category).map(p => p.category!)
          ));

          return (
            <View className="mt-8">
              <SectionHeader title="All-time Essentials" />
              <Text className="text-white/50 text-sm px-5 mb-4">
                Handpicked YouTube Music playlists
              </Text>
              {essentials.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20 }}
                  style={{ flexGrow: 0 }}
                >
                  {essentials.map(renderPlaylistCard)}
                </ScrollView>
              )}
              {categories.map(cat => {
                const catPlaylists = curatedPlaylists.filter(p => p.category === cat);
                return (
                  <View key={cat} style={{ marginTop: 24 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{cat}</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 12 }} />
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 20 }}
                      style={{ flexGrow: 0 }}
                    >
                      {catPlaylists.map(renderPlaylistCard)}
                    </ScrollView>
                  </View>
                );
              })}
            </View>
          );
        })()}

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

        {/* Time Traveler Radio */}
        {(() => {
          // Build artwork pool from downloaded library; fall back to mock tracks
          const artworkPool = allDownloads.length >= 4
            ? allDownloads.map(d => d.artwork).filter(Boolean) as string[]
            : tracks.map(t => t.artwork).filter(Boolean) as string[];

          return (
            <View className="mt-8">
              <SectionHeader title="Time Traveler Radio" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                style={{ flexGrow: 0 }}
              >
                {ERA_STATIONS.map((station, stationIdx) => {
                  // Give each station a different starting offset so grids look distinct
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
          );
        })()}

        {/* Discover Something Different */}
        {discoverGenreTracks.length > 0 && (
          <View className="mt-8">
            <SectionHeader title="Discover Something Different" />
            <Text className="text-white/50 text-sm px-5 mb-4">
              {discoverGenreLabel ? `Exploring ${discoverGenreLabel} — genres outside your library` : 'Genres outside your library'}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {discoverGenreTracks.map((t, i) => {
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
                const allTracks = discoverGenreTracks.map(x => ({
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
                }));
                return (
                  <Pressable
                    key={`${t.videoId}-${i}`}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      playTrack(track, allTracks);
                    }}
                    className="mr-4"
                  >
                    <View className="relative">
                      <Image
                        source={{ uri: t.thumbnailUrl }}
                        style={{ width: 140, height: 140, borderRadius: 8 }}
                        contentFit="cover"
                      />
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.85)']}
                        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 70, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, justifyContent: 'flex-end', padding: 8 }}
                      >
                        <Text className="text-white font-semibold text-sm" numberOfLines={1}>{t.title}</Text>
                        <Text className="text-white/60 text-xs" numberOfLines={1}>{t.channelName}</Text>
                      </LinearGradient>
                      {/* Genre badge */}
                      <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(139,92,246,0.85)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{t.genre}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

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
        {(() => {
          const popularPlaylists = curatedPlaylists.filter(p => p.section === 'popular');
          if (popularPlaylists.length === 0) return null;

          const popularCategories = Array.from(new Set(
            popularPlaylists.map(p => p.category ?? 'Other')
          ));

          const renderPopularCard = (playlist: CuratedPlaylist) => {
            const playlistTracks: Track[] = playlist.tracks.map(t => ({
              id: `ytm-${t.videoId}`,
              title: t.title,
              artist: t.channelName,
              artistId: `ytm-artist-${t.videoId}`,
              album: playlist.name,
              albumId: `ytm-pl-${playlist.playlistId}`,
              artwork: t.thumbnailUrl,
              duration: 0,
              isLiked: false,
              source: 'youtube_music' as const,
              youtubeId: t.videoId,
              youtubeMusicId: t.videoId,
              youtubeMusicUrl: `https://music.youtube.com/watch?v=${t.videoId}`,
            }));
            const cover = playlist.thumbnailUrl || playlistTracks[0]?.artwork || '';
            return (
              <Pressable
                key={playlist.playlistId}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push(`/(app)/playlist-detail?id=${playlist.playlistId}` as never);
                }}
                className="mr-4"
              >
                <View style={{ width: 150 }}>
                  <View style={{ width: 150, height: 150, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1C1C1C' }}>
                    <Image source={{ uri: cover }} style={{ width: 150, height: 150 }} contentFit="cover" />
                    <View style={{ position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12, paddingHorizontal: 6, paddingVertical: 3 }}>
                      <View style={{ width: 13, height: 13, backgroundColor: '#FF0000', borderRadius: 6.5, alignItems: 'center', justifyContent: 'center' }}>
                        <View style={{ width: 0, height: 0, borderLeftWidth: 4, borderTopWidth: 2.5, borderBottomWidth: 2.5, borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 1 }} />
                      </View>
                      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '600', marginLeft: 4 }}>YT Music</Text>
                    </View>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        if (playlistTracks.length > 0) playTrack(playlistTracks[0], playlistTracks);
                      }}
                      style={{ position: 'absolute', bottom: 8, right: 8, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Play size={16} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 2 }} />
                    </Pressable>
                  </View>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13, marginTop: 8 }} numberOfLines={2}>{playlist.name}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 }}>{playlist.tracks.length} songs</Text>
                </View>
              </Pressable>
            );
          };

          return (
            <View className="mt-8">
              <SectionHeader title="Popular Playlists" />
              {popularCategories.map(cat => (
                <View key={cat} style={{ marginTop: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{cat}</Text>
                    <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 12 }} />
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20 }}
                    style={{ flexGrow: 0 }}
                  >
                    {popularPlaylists.filter(p => (p.category ?? 'Other') === cat).map(renderPopularCard)}
                  </ScrollView>
                </View>
              ))}
            </View>
          );
        })()}

        {/* Spotify Playlists */}
        {spotifyPlaylists.length > 0 && (
          <View className="mt-8">
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 4 }}>
              <SectionHeader title="From Spotify" />
            </View>
            <Text className="text-white/50 text-sm px-5 mb-4">Chill & lo-fi playlists</Text>
            {spotifyPlaylists.map(playlist => {
              const playlistTracks: Track[] = playlist.tracks.map(t => ({
                id: `sp-yt-${t.videoId}`,
                title: t.title,
                artist: t.channelName,
                artistId: `sp-artist-${t.videoId}`,
                album: playlist.name,
                albumId: `sp-pl-${playlist.playlistId}`,
                artwork: t.thumbnailUrl,
                duration: Math.round(t.durationMs / 1000),
                isLiked: false,
                source: 'youtube_music' as const,
                youtubeId: t.videoId,
                youtubeMusicId: t.videoId,
                youtubeMusicUrl: `https://music.youtube.com/watch?v=${t.videoId}`,
              }));
              const cover = playlist.thumbnailUrl || playlistTracks[0]?.artwork || '';
              return (
                <View key={playlist.playlistId} style={{ marginBottom: 16 }}>
                  {/* Header row with cover + info */}
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      if (playlistTracks.length > 0) playTrack(playlistTracks[0], playlistTracks);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14 }}
                  >
                    <View style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1C1C1C', marginRight: 14 }}>
                      <Image source={{ uri: cover }} style={{ width: 64, height: 64 }} contentFit="cover" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }} numberOfLines={1}>{playlist.name}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 }}>{playlist.tracks.length} songs · via Spotify</Text>
                    </View>
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        if (playlistTracks.length > 0) playTrack(playlistTracks[0], playlistTracks);
                      }}
                      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Play size={18} color="#000" fill="#000" style={{ marginLeft: 2 }} />
                    </Pressable>
                  </Pressable>
                  {/* Horizontal track strip */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20 }}
                    style={{ flexGrow: 0 }}
                  >
                    {playlistTracks.map((track, idx) => (
                      <Pressable
                        key={track.id}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          playTrack(track, playlistTracks);
                        }}
                        style={{ width: 120, marginRight: 12 }}
                      >
                        <View style={{ width: 120, height: 120, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1C1C1C' }}>
                          <Image source={{ uri: track.artwork }} style={{ width: 120, height: 120 }} contentFit="cover" />
                          <View style={{ position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{idx + 1}</Text>
                          </View>
                        </View>
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', marginTop: 6 }} numberOfLines={1}>{track.title}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1 }} numberOfLines={1}>{track.artist}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              );
            })}
          </View>
        )}

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


        {/* YouTube Music — personalised */}
        {ytmTracks.length > 0 ? (
          <View className="mt-8">
            <SectionHeader title="From YouTube Music" />
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
                      {/* YouTube Music badge */}
                      <View className="absolute top-2 left-2 flex-row items-center bg-black/70 rounded px-1.5 py-0.5">
                        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ color: '#fff', fontSize: 8, lineHeight: 10 }}>♪</Text>
                        </View>
                        <Text className="text-white text-[10px] font-medium ml-1">YouTube Music</Text>
                      </View>
                    </View>
                    <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>
                      {t.title}
                    </Text>
                    <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>
                      {t.channelName}
                    </Text>
                  </Pressable>
                );
              })}
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

      </ScrollView>

      {/* Profile Menu Overlay */}
      <ProfileMenuOverlay
        visible={showProfileMenu}
        onClose={() => setShowProfileMenu(false)}
        userName=""
        userImage=""
        userEmail=""
      />
    </View>
  );
}
