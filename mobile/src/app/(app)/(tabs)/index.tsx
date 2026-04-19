import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Play,
  Pause,
  ChevronRight,
  Brain,
  Sparkles,
  Radio,
  Music,
  Headphones,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  interpolateColor,
  withRepeat,
  withTiming,
  Extrapolation,
} from 'react-native-reanimated';
import {
  ShadowCuratedPlaylistCard,
  curatedPlaylistCoverArt,
} from '@/components/PlaylistCard';
import { resolveShadowPlaylistVisual, inferEditorialEraLabel } from '@/lib/shadowPlaylistArtwork';
import {
  fetchYtmHomeBundle,
  normalizeYtmThumb,
  prewarmYtmFeed,
  safeYtmBundle,
  type YtmPlaylistTrack,
} from '@/lib/api/ytMusic';
import { getTasteSeedTracks } from '@/lib/tasteSeed';
import { clearCuratedPlaylistWarmSession } from '@/lib/curatedPlaylistWarmup';
import { preResolveYoutubeVideoId } from '@/lib/youtubeResolvePreloadCache';
import { preResolveSoundcloudStreamUrl } from '@/lib/soundcloudStreamPreloadCache';
import { normalizeYoutubePlaylistTracksPayload } from '@/lib/youtubePlaylistTracksNormalize';
import { useCuratedPlaylistCardWarmup } from '@/hooks/useCuratedPlaylistCardWarmup';
import { AlbumCard } from '@/components/AlbumCard';
import { VybeHeaderMark } from '@/components/Header';
import { useVybePopup } from '@/components/VybePopup';
import { usePostLoginWelcomeStore } from '@/stores/postLoginWelcomeStore';
import {
  playlists,
  albums,
  artists,
  tracks,
} from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import { useDiscoveryStore, DiscoveredTrack } from '@/stores/discoveryStore';
import { useRecentsStore } from '@/stores/recentsStore';
import { useDownloadsStore, type DownloadedTrack } from '@/stores/downloadsStore';
import { api } from '@/lib/api/api';
import { authClient } from '@/lib/auth/auth-client';
import { useFireMixStore } from '@/stores/fireMixStore';
import { MixDefinition, RelatedTrack, Track } from '@/types/music';
import { prefetchHeroColors } from '@/lib/usePlaylistHeroColors';
import { createMMKVCache, TTL } from '@/lib/mmkv-cache';
import { tabScreenContentContainerPaddingBottom } from '@/constants/Layout';
import { isDeadYoutubeQueueTitle } from '@/lib/queueSanitize';
import { DECADES_VAULT_CARDS } from '@/constants/decadesVault';
import { MachinedGradientText } from '@/components/MachinedGradientText';
import { VIBRANT_BLUE } from '@/constants/machinedTheme';
import { useSocialActivityStore } from '@/stores/socialActivityStore';
import type { ActivePostItem } from '@/types/socialActivity';
import { ShadowSavedMark } from '@/components/DownloadButton';
import { SourceCornerBadge } from '@/components/SourceCornerBadge';
import { QuickPickRow } from '@/components/QuickPickRow';
import { useFastVerticalScrollMotion } from '@/hooks/useFastScrollMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Shadow home system */
const SECTION_GAP = 32;
const ART_RADIUS = 16;
const SCREEN_W = Dimensions.get('window').width;
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
  const s = source ?? '';
  if (s === 'soundcloud') {
    return (
      <View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: '#FF5500', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
        <Radio size={10} color="#fff" strokeWidth={2.5} />
      </View>
    );
  }
  if (s === 'youtube_music') {
    return (
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
        <Music size={9} color="#fff" strokeWidth={2.5} />
      </View>
    );
  }
  if (s === 'youtube') {
    return (
      <View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
        <Play size={9} color="#fff" fill="#fff" />
      </View>
    );
  }
  return (
    <View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
      <Headphones size={9} color="#fff" strokeWidth={2.5} />
    </View>
  );
}

/**
 * Machined-Blue skeleton row used while SC-Ignition resolvers are pulling
 * curated playlists for the home tab. Matches the search-tab skeleton
 * language so the loading state feels native to the app, not a third-party
 * shimmer. Renders 4 ghost cards in a horizontal strip.
 */
function MachinedBlueSkeletonRail() {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 20 }}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={{
            width: 150,
            height: 150,
            borderRadius: 14,
            marginRight: 12,
            borderWidth: 1,
            borderColor: 'rgba(0,229,255,0.55)',
            backgroundColor: 'rgba(0,229,255,0.08)',
            ...Platform.select({
              ios: {
                shadowColor: VIBRANT_BLUE,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.4,
                shadowRadius: 10,
              },
              android: { elevation: 4 },
              default: {},
            }),
          }}
        />
      ))}
    </View>
  );
}

// ─── Daily Mix Hero Card ──────────────────────────────────────────────────────

interface DailyMixHeroCardProps {
  title: string;
  artistNames: string;
  artworks: string[];
  onPress: () => void;
}

/** No Reanimated/React state cross-over — that combo was tripping "invalid hook call" on Home. */
function FlipTile({ uri, size }: { uri: string; size: number }) {
  const show = uri.length > 0;
  return (
    <View style={{ width: size, height: size, backgroundColor: '#141416' }}>
      {show ? (
        <ShadowArtworkImage
          key={uri}
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : null}
    </View>
  );
}

function DailyMixHeroCard({ title, artistNames, artworks, onPress }: DailyMixHeroCardProps) {
  const cardScale = useSharedValue(1);
  const cardAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: cardScale.value }] }));
  const cardW = SCREEN_W - 32;
  const heroGrid = Math.min(236, Math.floor(cardW * 0.44));
  const tile = (heroGrid - 2) / 2;

  const [slots, setSlots] = useState<string[]>(() => {
    const init = artworks.slice(0, 4);
    while (init.length < 4) init.push(init[init.length - 1] ?? '');
    return init;
  });
  const slotAge = useRef<number[]>([3, 2, 1, 0]);
  const ageCounter = useRef(4);
  const prevNewest = useRef<string>('');

  useEffect(() => {
    const newest = artworks[0];
    if (!newest || newest === prevNewest.current) return;
    prevNewest.current = newest;
    setSlots(prev => {
      if (prev.includes(newest)) return prev;
      const maxAge = Math.max(...slotAge.current);
      const oldestIdx = slotAge.current.indexOf(maxAge);
      slotAge.current = slotAge.current.map((a, i) => i === oldestIdx ? 0 : a + 1);
      ageCounter.current += 1;
      const next = [...prev];
      next[oldestIdx] = newest;
      return next;
    });
  }, [artworks[0]]);

  return (
    <Animated.View style={[{ marginHorizontal: 16, width: cardW }, cardAnimStyle]}>
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onPress(); }}
        onPressIn={() => { cardScale.value = withSpring(0.97); }}
        onPressOut={() => { cardScale.value = withSpring(1); }}
      >
        <LinearGradient
          colors={['#1C0A06', '#120705', '#0A0403']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 0.5,
            borderColor: 'rgba(251,191,36,0.18)',
          }}
        >
          <View style={{ flexDirection: 'row', minHeight: heroGrid, alignItems: 'center' }}>
            <View style={{ flex: 1, paddingLeft: 18, paddingVertical: 22, paddingRight: 14, justifyContent: 'space-between', minHeight: heroGrid }}>
              <View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <View
                    style={{
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      backgroundColor: 'rgba(234,88,12,0.2)',
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: 'rgba(251,191,36,0.55)',
                    }}
                  >
                    <Text style={{ color: '#FDE68A', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }}>MADE FOR YOU</Text>
                  </View>
                  <View
                    style={{
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      backgroundColor: 'rgba(220,38,38,0.12)',
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: 'rgba(248,113,113,0.65)',
                    }}
                  >
                    <Text style={{ color: '#FECACA', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }}>NEW</Text>
                  </View>
                </View>
                <Text style={{ color: '#fff', fontSize: 23, fontWeight: '800', lineHeight: 28, letterSpacing: -0.3 }} numberOfLines={2}>
                  {title}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 6 }} numberOfLines={2}>
                  {artistNames}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  marginTop: 16,
                  paddingHorizontal: 22,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.28,
                  shadowRadius: 10,
                  elevation: 8,
                }}
              >
                <Play size={22} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 2 }} />
                <Text style={{ color: '#0A0A0A', fontWeight: '800', fontSize: 15, marginLeft: 10, letterSpacing: 0.35 }}>Play Mix</Text>
              </View>
            </View>

            <View style={{ width: heroGrid, height: heroGrid }}>
              <View style={{ flex: 1, flexDirection: 'column' }}>
                <View style={{ flex: 1, flexDirection: 'row' }}>
                  <FlipTile uri={slots[0]} size={tile} />
                  <View style={{ width: 2, backgroundColor: '#0D0722' }} />
                  <FlipTile uri={slots[1]} size={tile} />
                </View>
                <View style={{ height: 2, backgroundColor: '#0D0722' }} />
                <View style={{ flex: 1, flexDirection: 'row' }}>
                  <FlipTile uri={slots[2]} size={tile} />
                  <View style={{ width: 2, backgroundColor: '#0D0722' }} />
                  <FlipTile uri={slots[3]} size={tile} />
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── Heavy Rotation Card ─────────────────────────────────────────────────────
const ROTATION_CARD_SIZE = 110;
const RAIL_CARD_DIM = Math.min(SCREEN_W * 0.42, 168);
const HEAVY_SECTION_H_PAD = 20;

/** 2×3 Shadow grid — square 1:1 tiles, curated chrome + typography */
function HeavyRotationShadowGrid({
  playlists,
  onOpen,
  activeAlbumId,
}: {
  playlists: CuratedPlaylist[];
  onOpen: (pl: CuratedPlaylist) => void;
  activeAlbumId?: string | null;
}) {
  const innerW = SCREEN_W - HEAVY_SECTION_H_PAD * 2 - 24;
  const colGap = 12;
  const cell = (innerW - colGap) / 2;
  const n = playlists.length;
  const lastRowStart = n <= 0 ? 0 : Math.floor((n - 1) / 2) * 2;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
      {playlists.map((pl, idx) => {
        const cov = shadowCoverForHomePlaylist(pl);
        return (
        <ShadowCuratedPlaylistCard
          key={pl.playlistId}
          title={pl.name}
          artwork={cov.artwork}
          oledTitle={cov.oledTitle}
          editorialEra={inferEditorialEraLabel(pl.name)}
          trackCount={pl.tracks.length}
          badgeSource="youtube_music"
          width={cell}
          marginRight={0}
          marginBottom={idx < lastRowStart ? 16 : 0}
          onPress={() => onOpen(pl)}
          isActivePlaylist={activeAlbumId === `ytm-pl-${pl.playlistId}`}
        />
        );
      })}
    </View>
  );
}

function HeavyRotationCard({
  playlist,
  onPress,
  variant = 'default',
  badgeSource = 'youtube_music',
}: {
  playlist: { name: string; artwork: string; trackCount: number };
  onPress: () => void;
  variant?: 'default' | 'shadowRail';
  badgeSource?: 'youtube_music' | 'stream';
}) {
  const dim = variant === 'shadowRail' ? RAIL_CARD_DIM : ROTATION_CARD_SIZE;
  return (
    <ShadowCuratedPlaylistCard
      title={playlist.name}
      artwork={playlist.artwork}
      trackCount={playlist.trackCount}
      badgeSource={badgeSource}
      width={dim}
      marginRight={12}
      onPress={onPress}
      onPlayPress={onPress}
    />
  );
}

// ─── Era-based radio stations
const ERA_STATIONS = [
  { id: 'era-70s', name: "70s Classics", decade: '70s', colors: ['#B45309', '#78350F'] as [string, string], image: 'https://images.unsplash.com/photo-1619983081563-430f63602796?w=400&h=400&fit=crop', searchQuery: '70s classic rock funk soul hits' },
  { id: 'era-80s', name: "80s Hits", decade: '80s', colors: ['#EC4899', '#9333EA'] as [string, string], image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop', searchQuery: '80s pop new wave synth hits' },
  { id: 'era-90s', name: '90s G-Funk', decade: '90s', colors: ['#06B6D4', '#3B82F6'] as [string, string], image: 'https://images.unsplash.com/photo-1484755560615-a4c64e778a6c?w=400&h=400&fit=crop', searchQuery: '90s hip hop R&B alternative grunge hits' },
  { id: 'era-2000s', name: "2000s Party", decade: '2000s', colors: ['#F97316', '#EF4444'] as [string, string], image: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=400&h=400&fit=crop', searchQuery: '2000s pop hip hop party hits' },
  { id: 'era-2010s', name: "2010s Pop", decade: '2010s', colors: ['#8B5CF6', '#EC4899'] as [string, string], image: 'https://images.unsplash.com/photo-1501386761578-ecd5f5d78b7b?w=400&h=400&fit=crop', searchQuery: '2010s indie pop EDM chart hits' },
];

interface SectionHeaderProps {
  title: string;
  onSeeAll?: () => void;
}

function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  return (
    <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <MachinedGradientText neonGlow style={{ fontSize: 26, fontWeight: '800', letterSpacing: 0.35 }}>
          {title}
        </MachinedGradientText>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginRight: 4 }}>See all</Text>
            <ChevronRight size={16} color="rgba(255,255,255,0.55)" />
          </Pressable>
        ) : null}
      </View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 14 }} />
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
            <ShadowArtworkImage
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
  channelId?: string;
  thumbnailUrl: string;
  /** Normalized art URL when backend sends `artwork` */
  artwork?: string;
  publishedAt: string;
}

interface CuratedPlaylist {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  /** Preferred cover URL when API provides it */
  artwork?: string;
  /** Shadow OLED cover when bitmap art is missing or low-res */
  oledCoverTitle?: string;
  tracks: PlaylistTrack[];
  category?: string;
  section?: string;
}

function shadowCoverForHomePlaylist(pl: CuratedPlaylist): { artwork: string; oledTitle?: string } {
  if (pl.oledCoverTitle?.trim()) {
    return { artwork: '', oledTitle: pl.oledCoverTitle.trim() };
  }
  return resolveShadowPlaylistVisual({
    title: pl.name,
    playlistId: pl.playlistId,
    thumbnailUrl: pl.thumbnailUrl,
    trackThumb: pl.tracks[0]?.thumbnailUrl || pl.tracks[0]?.artwork,
    seedVideoId: pl.tracks[0]?.videoId,
  });
}

function shadowCleanCuratedFromApi(p: CuratedPlaylist): CuratedPlaylist {
  const v = resolveShadowPlaylistVisual({
    title: p.name,
    playlistId: p.playlistId,
    thumbnailUrl: p.thumbnailUrl,
    trackThumb: p.tracks[0]?.thumbnailUrl || p.tracks[0]?.artwork,
    seedVideoId: p.tracks[0]?.videoId,
  });
  return {
    ...p,
    thumbnailUrl: v.oledTitle ? '' : (v.artwork || p.thumbnailUrl),
    artwork: v.oledTitle ? undefined : (v.artwork || p.artwork),
    oledCoverTitle: v.oledTitle,
  };
}

/** YouTube Music curated playlist tile with visible-first resolve warming + Shadow chrome. */
function HomeYtmCuratedPlaylistCard({ playlist }: { playlist: CuratedPlaylist }) {
  const router = useRouter();
  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const videoIds = useMemo(() => playlist.tracks.map(t => t.videoId), [playlist.tracks]);
  const { ref, onLayout, firstVideoId } = useCuratedPlaylistCardWarmup(
    playlist.playlistId,
    playlist.name,
    videoIds,
  );

  const playlistTracks: Track[] = useMemo(
    () =>
      playlist.tracks
        .filter((t) => !isDeadYoutubeQueueTitle(t.title))
        .map((t) => ({
          id: `ytm-${t.videoId}`,
          title: t.title,
          artist: t.channelName,
          artistId: `ytm-artist-${t.videoId}`,
          album: playlist.name,
          albumId: `ytm-pl-${playlist.playlistId}`,
          artwork: t.artwork || t.thumbnailUrl,
          duration: 0,
          isLiked: false,
          source: 'youtube_music' as const,
          youtubeId: t.videoId,
          youtubeMusicId: t.videoId,
          youtubeMusicUrl: `https://music.youtube.com/watch?v=${t.videoId}`,
        })),
    [playlist],
  );

  const cov = shadowCoverForHomePlaylist(playlist);

  return (
    <ShadowCuratedPlaylistCard
      ref={ref}
      title={playlist.name}
      artwork={cov.artwork}
      oledTitle={cov.oledTitle}
      editorialEra={inferEditorialEraLabel(playlist.name)}
      trackCount={playlist.tracks.length}
      badgeSource="youtube_music"
      width={150}
      marginRight={12}
      isActivePlaylist={currentTrack?.albumId === `ytm-pl-${playlist.playlistId}`}
      onContainerLayout={onLayout}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push(`/(app)/playlist-detail?id=${playlist.playlistId}` as never);
      }}
      onPlayPress={() => {
        if (playlistTracks.length === 0) return;
        if (firstVideoId) preResolveYoutubeVideoId(firstVideoId);
        videoIds.slice(0, 3).forEach(id => preResolveYoutubeVideoId(id));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void playTrack(playlistTracks[0], playlistTracks, { expandNowPlaying: false });
        router.push({
          pathname: '/(app)/playlist-detail',
          params: { playlistId: playlist.playlistId, playlistName: playlist.name },
        } as never);
      }}
    />
  );
}

interface SpotifyPlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  artwork?: string;
  durationMs: number;
}

interface SpotifyPlaylist {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  artwork?: string;
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

// MMKV last-known-good cache for the home screen. Additive tier on top of the
// in-memory React state — lets the UI paint instantly on app open while a
// fresh fetch runs in the background.
const homeMMKV = createMMKVCache('vybe-home');
const HOME_KEYS = {
  mixes: 'mixes',
  curatedPlaylists: 'curatedPlaylists',
  spotifyPlaylists: 'spotifyPlaylists',
  ytmTracks: 'ytmTracks',
  ytmQueryLabel: 'ytmQueryLabel',
  discoverGenreTracks: 'discoverGenreTracks',
  discoverGenreLabel: 'discoverGenreLabel',
  // Backend-sourced track feeds for From YouTube / From SoundCloud sections
  ytTrendingTracks: 'ytTrendingTracks',
  scTrendingTracks: 'scTrendingTracks',
  // playlistId → first-track thumbnail for Era Hits cards
  eraArtwork: 'eraArtwork',
  ytmNewReleases: 'ytmNewReleases',
  ytmTopVideos: 'ytmTopVideos',
  ytmMoodFocus: 'ytmMoodFocus',
  ytmMoodEnergy: 'ytmMoodEnergy',
  ytmMoodSleep: 'ytmMoodSleep',
  shadowRadar: 'shadowRadar',
  // SoundCloud-first home rails — primary discovery on the home tab.
  scCuratedPlaylists: 'scCuratedPlaylists',
} as const;

interface SoundcloudCuratedTrackRow {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  publishedAt: string;
  soundcloudUrl: string;
}
interface SoundcloudCuratedPlaylist {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  soundcloudSetUrl: string;
  tracks: SoundcloudCuratedTrackRow[];
  category?: string;
  section?: string;
}

// SoundCloud track shape returned by /api/soundcloud/search
interface SCApiTrack {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
}

function activePostToTrack(post: ActivePostItem): Track | null {
  const t = post.track;
  const vid = t.youtubeMusicId || t.youtubeId;
  if (!vid) return null;
  return {
    id: `pulse-${post.id}`,
    title: t.title,
    artist: post.userName,
    artistId: '',
    album: '',
    albumId: '',
    artwork: t.artwork ?? '',
    duration: 0,
    isLiked: false,
    source: (t.source ?? 'youtube_music') as Track['source'],
    youtubeId: t.youtubeId ?? vid,
    youtubeMusicId: t.youtubeMusicId ?? vid,
    soundcloudUrl: t.soundcloudUrl,
    audioUrl: '',
  };
}

/** Live shares when the network has posts; otherwise YTM taste radar as warm-up. */
function HomePulseFeedBlock({
  posts,
  playTrack,
}: {
  posts: ActivePostItem[];
  playTrack: (t: Track, q: Track[]) => void;
}) {
  const pulsePairs = useMemo(() => {
    const out: { post: ActivePostItem; track: Track }[] = [];
    for (const p of posts) {
      const tr = activePostToTrack(p);
      if (tr) out.push({ post: p, track: tr });
    }
    return out;
  }, [posts]);

  if (pulsePairs.length > 0) {
    const queue = pulsePairs.map((x) => x.track);
    const dim = 140;
    return (
      <View style={{ marginTop: SECTION_GAP }}>
        <SectionHeader title="Pulse Feed" />
        <Text className="text-white/50 text-sm px-5 mb-4">Live network shares</Text>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20 }}
          style={{ flexGrow: 0 }}
        >
          {pulsePairs.map(({ post, track }) => (
            <Pressable
              key={post.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                playTrack(track, queue);
              }}
              className="mr-4"
            >
              <View
                style={{
                  width: dim,
                  height: dim,
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: '#0A0A0A',
                  borderWidth: 1,
                  borderColor: 'rgba(0,229,255,0.55)',
                }}
              >
                <ShadowArtworkImage
                  source={{ uri: track.artwork || undefined }}
                  style={{ width: dim, height: dim }}
                  contentFit="cover"
                />
                <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                  <SourceCornerBadge source="youtube_music" />
                </View>
                {post.isLiveListening ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6,
                      backgroundColor: 'rgba(255,0,255,0.28)',
                      borderWidth: 1,
                      borderColor: '#FF00FF',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 }}>LIVE</Text>
                  </View>
                ) : null}
              </View>
              <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: dim }}>
                {track.title}
              </Text>
              <Text style={{ width: dim, color: '#888888', fontSize: 12 }} numberOfLines={1}>
                @{post.userName}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }

  return null;
}

function HomeDownloadSleekRail({
  allDownloads,
  playTrack,
}: {
  allDownloads: DownloadedTrack[];
  playTrack: (t: Track, q: Track[]) => void;
}) {
  const sleekTracks = useMemo(
    () => [...allDownloads].sort((a, b) => b.importedAt - a.importedAt).slice(0, 28),
    [allDownloads],
  );

  if (allDownloads.length === 0) {
    return (
      <View className="mt-8 mx-5 bg-white/5 rounded-xl p-4 items-center">
        <Text className="text-white/40 text-sm">Save songs to fill your sleek shelf</Text>
      </View>
    );
  }

  const queue = sleekTracks;
  const card = 132;

  return (
    <View className="mt-8" style={{ paddingBottom: 4 }}>
      <View className="flex-row items-center px-5 mb-2">
        <Brain size={20} color={VIBRANT_BLUE} style={{ marginRight: 8 }} />
        <MachinedGradientText neonGlow style={{ fontSize: 22, fontWeight: '800', letterSpacing: 0.4, flex: 1 }}>
          Sleek Archives
        </MachinedGradientText>
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, paddingHorizontal: 20, marginBottom: 12 }}>
        Night calm and focus pulse in one horizontal glide
      </Text>
      <ScrollView
        horizontal
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingRight: 36 }}
        style={{ flexGrow: 0 }}
      >
        {sleekTracks.map((track) => (
          <Pressable
            key={track.id}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              playTrack(track, queue);
            }}
            style={{ marginRight: 14 }}
          >
            <View
              style={{
                width: card,
                height: card,
                borderRadius: 14,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: 'rgba(0,229,255,0.45)',
                backgroundColor: '#0A0A0A',
              }}
            >
              <ShadowArtworkImage
                source={{ uri: track.artwork ?? undefined }}
                style={{ width: card, height: card }}
                contentFit="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,229,255,0.2)']}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 48,
                }}
                pointerEvents="none"
              />
            </View>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 8, width: card }} numberOfLines={1}>
              {track.title}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, width: card }} numberOfLines={1}>
              {track.artist}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Top music videos — 16:9 Vybe Video rail (YouTube playback). */
function HomeVybeVideoRail({
  tracks,
  playTrack,
}: {
  tracks: PlaylistTrack[];
  playTrack: (t: Track, q: Track[]) => void;
}) {
  const visibleTracks = tracks.filter((t) => !isDeadYoutubeQueueTitle(t.title));
  if (visibleTracks.length === 0) return null;
  const W = 168;
  const H = Math.round((W * 9) / 16);
  const queue: Track[] = visibleTracks.map((t) => ({
    id: `yt-${t.videoId}`,
    title: t.title,
    artist: t.channelName,
    artistId: '',
    album: '',
    albumId: '',
    artwork: t.thumbnailUrl,
    duration: 0,
    isLiked: false,
    source: 'youtube',
    youtubeId: t.videoId,
    audioUrl: '',
  }));
  return (
    <View style={{ marginTop: SECTION_GAP }}>
      <SectionHeader title="Vybe Video" />
      <Text className="text-white/50 text-sm px-5 mb-4">Top music videos</Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
        style={{ flexGrow: 0 }}
      >
        {visibleTracks.map((t) => {
          const track = queue.find((q) => q.id === `yt-${t.videoId}`)!;
          return (
            <Pressable
              key={t.videoId}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                playTrack(track, queue);
              }}
              className="mr-4"
            >
              <View
                style={{
                  width: W,
                  height: H,
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: '#0A0A0A',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.12)',
                }}
              >
                <ShadowArtworkImage source={{ uri: t.thumbnailUrl }} style={{ width: W, height: H }} contentFit="cover" />
                <View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: 'rgba(255,255,255,0.36)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Play size={22} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
                  </View>
                </View>
                <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                  <SourceCornerBadge source="youtube" compact />
                </View>
              </View>
              <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: W }}>
                {t.title}
              </Text>
              <Text style={{ width: W, color: '#888888', fontSize: 12 }} numberOfLines={1}>
                {t.channelName}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const pulseFeedPosts = useSocialActivityStore((s) => s.activePosts).slice(0, 24);

  const onScTrendingViewable = useCallback(
    (e: { viewableItems: Array<{ item: SCApiTrack }> }) => {
      for (const v of e.viewableItems) {
        const u = v.item?.soundcloudUrl;
        if (u) preResolveSoundcloudStreamUrl(u);
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      return () => clearCuratedPlaylistWarmSession();
    }, []),
  );

  // Track-actions bottom sheet (Share / Like / Add to playlist)
  const [actionsTrack, setActionsTrack] = useState<Track | null>(null);

  // Synchronous MMKV reads (lazy initializers) seed state from disk on mount.
  // This means if the cache is warm, the UI paints immediately — no spinner
  // gap while the network fetch runs. The existing fetch still runs below and
  // refreshes state + disk cache.
  const [mixes, setMixes] = useState<MixDefinition[]>(() => {
    const hit = homeMMKV.get<MixDefinition[]>(HOME_KEYS.mixes, TTL.CURATED);
    return hit?.value ?? [];
  });
  const [curatedPlaylists, setCuratedPlaylists] = useState<CuratedPlaylist[]>(() => {
    const hit = homeMMKV.get<CuratedPlaylist[]>(HOME_KEYS.curatedPlaylists, TTL.CURATED);
    return hit?.value ?? [];
  });
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPlaylist[]>(() => {
    const hit = homeMMKV.get<SpotifyPlaylist[]>(HOME_KEYS.spotifyPlaylists, TTL.CURATED);
    return hit?.value ?? [];
  });
  const [discoverGenreTracks, setDiscoverGenreTracks] = useState<(PlaylistTrack & { genre: string })[]>(() => {
    const hit = homeMMKV.get<(PlaylistTrack & { genre: string })[]>(HOME_KEYS.discoverGenreTracks, TTL.GENRE);
    return hit?.value ?? [];
  });
  const [discoverGenreLabel, setDiscoverGenreLabel] = useState(() => {
    const hit = homeMMKV.get<string>(HOME_KEYS.discoverGenreLabel, TTL.GENRE);
    return hit?.value ?? '';
  });
  // Backend-sourced tracks for From YouTube / From SoundCloud sections
  const [ytTrendingTracks, setYtTrendingTracks] = useState<PlaylistTrack[]>(() => {
    const hit = homeMMKV.get<PlaylistTrack[]>(HOME_KEYS.ytTrendingTracks, TTL.GENRE);
    return hit?.value ?? [];
  });
  const [scTrendingTracks, setScTrendingTracks] = useState<SCApiTrack[]>(() => {
    const hit = homeMMKV.get<SCApiTrack[]>(HOME_KEYS.scTrendingTracks, TTL.GENRE);
    return hit?.value ?? [];
  });
  /** SoundCloud-first home rails — curated playlists drive both New & Hot and Trending. */
  const [scCuratedPlaylists, setScCuratedPlaylists] = useState<SoundcloudCuratedPlaylist[]>(() => {
    const hit = homeMMKV.get<SoundcloudCuratedPlaylist[]>(HOME_KEYS.scCuratedPlaylists, TTL.CURATED);
    return hit?.value ?? [];
  });
  const [ytmTopVideos, setYtmTopVideos] = useState<PlaylistTrack[]>(() => {
    const hit = homeMMKV.get<PlaylistTrack[]>(HOME_KEYS.ytmTopVideos, TTL.GENRE);
    return hit?.value ?? [];
  });
  // playlistId → first-track artwork map for Era Hits (cached so the cards
  // paint instantly with real album art on every app open).
  /** playlistId → cover URL (MMKV key retains legacy name `eraArtwork`). */
  const [playlistThumbOverrides, setPlaylistThumbOverrides] = useState<Record<string, string>>(() => {
    const hit = homeMMKV.get<Record<string, string>>(HOME_KEYS.eraArtwork, TTL.CURATED);
    return hit?.value ?? {};
  });
  const [isLoadingMixes, setIsLoadingMixes] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: session } = authClient.useSession();
  const firstName = useMemo(() => {
    const u = session?.user as { name?: string | null; email?: string | null } | undefined;
    if (!u) return 'there';
    if (u.name?.trim()) return u.name.trim().split(/\s+/)[0] ?? 'there';
    if (u.email?.trim()) return u.email.split('@')[0] ?? 'there';
    return 'there';
  }, [session?.user]);
  const headlineRest = `, ${firstName}`;

  const fireMixTracks = useFireMixStore((s) => s.tracks);
  const fireMixStatus = useFireMixStore((s) => s.status);

  // Scroll animation for greeting fade
  const scrollY = useSharedValue(0);

  const { showVybePopup } = useVybePopup();
  useFocusEffect(
    // Always hand back a real cleanup so Hermes-minified expo-router never
    // tries to invoke `undefined.call()` (the source of the
    // "TypeError: _b.call is not a function" flood).
    useCallback(() => {
      if (usePostLoginWelcomeStore.getState().consumeEnjoyVibes()) {
        showVybePopup({
          title: 'Enjoy the Vibes 😎',
          message: "You're in. Your session is live.",
          type: 'success',
        });
      }
      return () => {};
    }, [showVybePopup]),
  );

  const cyanPulse = useSharedValue(0);
  useEffect(() => {
    cyanPulse.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, [cyanPulse]);

  const headlineCyanPulseStyle = useAnimatedStyle(() => ({
    color: interpolateColor(cyanPulse.value, [0, 1], ['#FAFAFA', '#67E8F9']),
  }));

  const greetingAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 60],
      [1, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const { scrollHandler, listMotionStyle } = useFastVerticalScrollMotion(scrollY);

  // Discovery store - select raw data, not methods that return new values
  const discoveredTracks = useDiscoveryStore(s => s.discoveredTracks);
  const autoRefreshEnabled = useDiscoveryStore(s => s.autoRefreshEnabled);
  const refreshDiscovery = useDiscoveryStore(s => s.refreshDiscovery);
  const markTrackAsSeen = useDiscoveryStore(s => s.markTrackAsSeen);
  const isDiscoveryRefreshing = useDiscoveryStore(s => s.isRefreshing);

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
    discoveredTracks.filter(t => t.isNew),
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
    return absent.sort(() => Math.random() - 0.5);
  };

  // Fetch curated mixes and trigger discovery refresh on mount.
  // Safety: even if something inside fetchMixes hangs (e.g. one of the
  // sequential awaits stalls behind a degraded Railway endpoint), force the
  // Machined-Blue skeleton to clear after 12s so the rails never sit in a
  // permanent loading state. The fallback rail (scTrendingTracks) will pick
  // up rendering responsibility once isLoadingMixes flips false.
  useEffect(() => {
    fetchMixes();
    const skeletonSafetyTimer = setTimeout(() => setIsLoadingMixes(false), 12000);
    if (autoRefreshEnabled) {
      refreshDiscovery();
    }
    return () => clearTimeout(skeletonSafetyTimer);
  }, []);

  // Era Hits artwork — independent effect so blank cards don't wait on the
  // big fetchMixes await chain. Uses the first track's videoId to build a
  // CANONICAL unsigned YT thumbnail URL. The `thumbnail` field returned by
  // /playlist-tracks (from yt-dlp) has signed `sqp=`+`rs=` query params that
  // expo-image sometimes refuses to render, which is why the cards were
  // blank. The `i.ytimg.com/vi/{id}/hqdefault.jpg` form always works.
  useEffect(() => {
    const ERA_IDS = [
      'OLAK5uy_nNJT7AbBdhV752pwUKXiyYRs6aEiUyh5Y',
      'RDCLAK5uy_lMzHW51iFg1Kx0d_2EHpzbOgCrwtu8cgI',
      'RDCLAK5uy_nQkPLhMF6chdzKSlWdX8NHMrLVpdci-eU',
      'OLAK5uy_k8MpasYgwAswSjuvZN5ilDMNPxT5R-mHk',
    ];
    let cancelled = false;
    Promise.all(
      ERA_IDS.map(id =>
        api.get<unknown>(`/api/youtube/playlist-tracks?listId=${encodeURIComponent(id)}`)
          .then((raw) => {
            const rows = normalizeYoutubePlaylistTracksPayload(raw);
            const videoId = rows[0]?.videoId ?? '';
            const art = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
            return [id, art] as [string, string];
          })
          .catch(() => [id, ''] as [string, string])
      )
    ).then(pairs => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      for (const [id, art] of pairs) if (art) map[id] = art;
      if (Object.keys(map).length === 0) return;
      setPlaylistThumbOverrides(prev => {
        const merged = { ...prev, ...map };
        homeMMKV.set(HOME_KEYS.eraArtwork, merged);
        return merged;
      });
    });
    return () => { cancelled = true; };
  }, []);

  const fetchMixes = async () => {
    setIsLoadingMixes(true);

    // FAST PATH — SC New & Hot / Trending rails. Fire immediately and set
    // state the moment it lands (typically <300ms) so the cyan skeletons
    // don't sit on screen while the slow Spotify/YouTube chain below works
    // through 6+ sequential awaits. Also drives the trending-search fallback
    // used when curated playlists comes back empty.
    void Promise.all([
      api
        .get<SoundcloudCuratedPlaylist[]>(`/api/soundcloud/playlists`)
        .catch((err: unknown) => {
          console.log('[home] sc curated playlists fast-path failed:', err);
          return null as SoundcloudCuratedPlaylist[] | null;
        }),
      api
        .get<SCApiTrack[]>(
          `/api/soundcloud/search?q=${encodeURIComponent('trending')}&maxResults=15`,
        )
        .catch(() => null as SCApiTrack[] | null),
    ]).then(([scPlaylistsFast, scTrendingFast]) => {
      if (Array.isArray(scPlaylistsFast) && scPlaylistsFast.length > 0) {
        setScCuratedPlaylists(scPlaylistsFast);
        homeMMKV.set(HOME_KEYS.scCuratedPlaylists, scPlaylistsFast);
      }
      if (Array.isArray(scTrendingFast) && scTrendingFast.length > 0) {
        setScTrendingTracks(scTrendingFast);
        homeMMKV.set(HOME_KEYS.scTrendingTracks, scTrendingFast);
      }
      // As soon as either source has rows, we have something to render —
      // clear the skeletons immediately so the user never stares at empty
      // cyan boxes while the rest of the pipeline finishes.
      const haveAnything =
        (Array.isArray(scPlaylistsFast) && scPlaylistsFast.length > 0) ||
        (Array.isArray(scTrendingFast) && scTrendingFast.length > 0);
      if (haveAnything) setIsLoadingMixes(false);
    });

    try {
      // Fire each independent fetch in parallel and never let one bad
      // endpoint (e.g. backend 502 on /api/soundcloud/mixes) short-circuit
      // the rest of the home pipeline. Previously the awaited mixes call
      // threw and skipped curated playlists, Spotify, AND the new SC New &
      // Hot / Trending rails. Per-leg .catch() guarantees independence.
      const mixesResponse = await api
        .get<MixDefinition[]>('/api/soundcloud/mixes')
        .catch((err: unknown) => {
          console.log('[home] mixes fetch failed (continuing):', err);
          return null as MixDefinition[] | null;
        });
      if (mixesResponse) {
        setMixes(mixesResponse);
        homeMMKV.set(HOME_KEYS.mixes, mixesResponse);
      }

      const playlistsResponse = await api
        .get<CuratedPlaylist[]>('/api/youtube/playlists')
        .catch((err: unknown) => {
          console.log('[home] yt curated playlists fetch failed (continuing):', err);
          return null as CuratedPlaylist[] | null;
        });
      if (playlistsResponse) {
        const filtered = playlistsResponse
          .filter((p) => p.tracks.length > 0)
          .filter((p) => {
            const n = p.name.trim().toLowerCase();
            const c = (p.category ?? '').trim().toLowerCase();
            if (/throwback hits|shadow radar|royalty\s*free/i.test(n)) return false;
            if (/throwback hits|shadow radar|royalty\s*free/i.test(c)) return false;
            if (/^from youtube music$/i.test(c)) return false;
            return true;
          })
          .map(shadowCleanCuratedFromApi);
        // Never replace a full home feed with an empty payload (transient API/yt-dlp failures).
        if (filtered.length > 0) {
          setCuratedPlaylists(filtered);
          homeMMKV.set(HOME_KEYS.curatedPlaylists, filtered);
        }
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
      if (validSpotify.length > 0) {
        setSpotifyPlaylists(validSpotify);
        homeMMKV.set(HOME_KEYS.spotifyPlaylists, validSpotify);
      }

      const taste = getTasteSeedTracks();
      const absentGenres = getAbsentGenres();
      const genreLabel =
        absentGenres.length > 0 ? absentGenres.map(g => g.name).join(' & ') : '';
      if (genreLabel) {
        setDiscoverGenreLabel(genreLabel);
        homeMMKV.set(HOME_KEYS.discoverGenreLabel, genreLabel);
      }

      const genreAll =
        absentGenres.length > 0
          ? Promise.all(
              absentGenres.map(g =>
                api
                  .get<PlaylistTrack[]>(
                    `/api/youtube/search?q=${encodeURIComponent(g.query)}&maxResults=20`,
                  )
                  .then(res => (res ?? []).map(t => ({ ...t, genre: g.name })))
                  .catch(() => [] as (PlaylistTrack & { genre: string })[]),
              ),
            )
          : Promise.resolve([] as (PlaylistTrack & { genre: string })[][]);

      const normPl = (rows: PlaylistTrack[]) =>
        rows.map(r => normalizeYtmThumb(r as YtmPlaylistTrack));

      const tastePersonalizedFallback = (() => {
        const ytmArtist = recentTracks.find((t) => t.source === 'youtube_music')?.artist?.trim();
        if (ytmArtist) return `${ytmArtist} new music`;
        const anyArtist = recentTracks.map((t) => t.artist).find(Boolean);
        if (anyArtist) return `${anyArtist} music`;
        const discArtist = discoveredTracks.map((t) => t.artist).find(Boolean);
        if (discArtist) return `${discArtist} music`;
        return 'trending music 2024';
      })();

      const settledMain = await Promise.allSettled([
        fetchYtmHomeBundle(taste, tastePersonalizedFallback),
        api
          .get<PlaylistTrack[]>(
            `/api/youtube/search?q=${encodeURIComponent('trending music videos')}&maxResults=15`,
          )
          .catch(() => null),
        api
          .get<SCApiTrack[]>(
            `/api/soundcloud/search?q=${encodeURIComponent('trending')}&maxResults=15`,
          )
          .catch(() => null),
        Promise.resolve([] as PlaylistTrack[]),
        genreAll,
        // SC-Ignition: curated SoundCloud playlists power the home tab's
        // "New & Hot" + "Trending" rails. Backend resolves these from
        // catalog/soundcloud-curated-playlists.json and returns playable rows.
        api
          .get<SoundcloudCuratedPlaylist[]>(`/api/soundcloud/playlists`)
          .catch(() => null),
      ]);

      const ytmBundle = safeYtmBundle(
        settledMain[0] as PromiseSettledResult<Awaited<ReturnType<typeof fetchYtmHomeBundle>>>,
      );
      const ytTrending =
        settledMain[1].status === 'fulfilled' ? settledMain[1].value : null;
      const scTrending =
        settledMain[2].status === 'fulfilled' ? settledMain[2].value : null;
      const genreResults =
        settledMain[4].status === 'fulfilled'
          ? settledMain[4].value
          : ([] as (PlaylistTrack & { genre: string })[][]);

      const tv = normPl(ytmBundle.topMusicVideos);
      if (tv.length > 0) {
        setYtmTopVideos(tv);
        homeMMKV.set(HOME_KEYS.ytmTopVideos, tv);
      }

      if (absentGenres.length > 0 && genreResults.length > 0) {
        const interleaved: (PlaylistTrack & { genre: string })[] = [];
        const maxLen = Math.max(...genreResults.map(r => r.length));
        for (let i = 0; i < maxLen; i++) {
          genreResults.forEach(r => {
            if (r[i]) interleaved.push(r[i]);
          });
        }
        setDiscoverGenreTracks(interleaved);
        homeMMKV.set(HOME_KEYS.discoverGenreTracks, interleaved);
      }

      if (ytTrending && ytTrending.length > 0) {
        setYtTrendingTracks(ytTrending);
        homeMMKV.set(HOME_KEYS.ytTrendingTracks, ytTrending);
      }

      // Era Hits — prefetch the full track list for each decade playlist and
      // append to the curatedPlaylists MMKV cache. This is what makes tapping
      // an Era Hits card load instantly (same path All-time Essentials uses):
      // playlist-detail.tsx reads curatedPlaylists from MMKV first and only
      // hits the network as a fallback.
      const ERA_META: { id: string; name: string }[] = [
        { id: 'OLAK5uy_nNJT7AbBdhV752pwUKXiyYRs6aEiUyh5Y', name: "The Hits: '70s" },
        { id: 'RDCLAK5uy_lMzHW51iFg1Kx0d_2EHpzbOgCrwtu8cgI', name: "The Hits: '80s" },
        { id: 'RDCLAK5uy_nQkPLhMF6chdzKSlWdX8NHMrLVpdci-eU', name: "The Hits: '90s" },
        { id: 'OLAK5uy_k8MpasYgwAswSjuvZN5ilDMNPxT5R-mHk', name: "90s & 00s Hits Rewind" },
        { id: 'PLmyAPRLQRJ6lMbAdXYGuyZ627Y9RoX25i', name: "MTV Hits 90's-2000's" },
        { id: 'RDCLAK5uy_mGYde2Wyx9INZd6GbPcMWkxDOu6Utmedw', name: "The Hits: '10s" },
        { id: 'RDCLAK5uy_nZgpioZcDw6oYAp4o3oUNTWdVK0j_XyWo', name: "'10s Party" },
        { id: 'RDCLAK5uy_mplKe9BIYCO3ZuNWSHZr48bm9DUDzbWnE', name: "Millennial Mixtape" },
      ];
      Promise.all(
        ERA_META.map(({ id, name }) =>
          api.get<unknown>(`/api/youtube/playlist-tracks?listId=${encodeURIComponent(id)}`)
            .then((raw) => {
              const arr = normalizeYoutubePlaylistTracksPayload(raw);
              if (arr.length === 0) return null;
              const reshaped: CuratedPlaylist = {
                playlistId: id,
                name,
                thumbnailUrl: arr[0]?.thumbnail ?? '',
                tracks: arr.map(t => ({
                  videoId: t.videoId,
                  title: t.title,
                  channelName: t.channel,
                  thumbnailUrl: t.thumbnail,
                  publishedAt: '',
                })),
              };
              return reshaped;
            })
            .catch(() => null)
        )
      ).then(results => {
        const eraPlaylists = results
          .filter((p): p is CuratedPlaylist => !!p)
          .map(shadowCleanCuratedFromApi);
        if (eraPlaylists.length === 0) return;
        // Merge eras into curatedPlaylists so playlist-detail finds them in
        // its first MMKV check — no network round-trip on tap.
        setCuratedPlaylists(prev => {
          const byId = new Map(prev.map(p => [p.playlistId, p]));
          for (const era of eraPlaylists) byId.set(era.playlistId, era);
          const merged = Array.from(byId.values());
          homeMMKV.set(HOME_KEYS.curatedPlaylists, merged);
          return merged;
        });
        // Also keep the artwork map populated as a belt-and-suspenders fallback.
        const artMap: Record<string, string> = {};
        for (const era of eraPlaylists) if (era.thumbnailUrl) artMap[era.playlistId] = era.thumbnailUrl;
        if (Object.keys(artMap).length > 0) {
          setPlaylistThumbOverrides(prev => {
            const merged = { ...prev, ...artMap };
            homeMMKV.set(HOME_KEYS.eraArtwork, merged);
            return merged;
          });
        }
      });

      if (scTrending && scTrending.length > 0) {
        setScTrendingTracks(scTrending);
        homeMMKV.set(HOME_KEYS.scTrendingTracks, scTrending);
      }

      const scPlaylistsResult =
        settledMain[5]?.status === 'fulfilled' ? settledMain[5].value : null;
      if (Array.isArray(scPlaylistsResult) && scPlaylistsResult.length > 0) {
        setScCuratedPlaylists(scPlaylistsResult);
        homeMMKV.set(HOME_KEYS.scCuratedPlaylists, scPlaylistsResult);
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
  const recentlyPlayed = albums;

  // Quick picks — all downloads, most recent first (paged horizontally below)
  const quickPicks = useMemo(
    () => [...allDownloads].reverse() as Track[],
    [allDownloads]
  );

  const quickPickPages = useMemo(() => {
    const pageSize = 5;
    const pages: Track[][] = [];
    for (let i = 0; i < quickPicks.length; i += pageSize) {
      pages.push(quickPicks.slice(i, i + pageSize));
    }
    return pages;
  }, [quickPicks]);

  const recentRailTracks = useMemo(
    () => (recentTracks.length > 0 ? recentTracks : importedTracks),
    [recentTracks, importedTracks]
  );

  const discoverGenreQueue = useMemo(
    () =>
      discoverGenreTracks
        .filter((x) => !isDeadYoutubeQueueTitle(x.title))
        .map((x) => ({
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
        })),
    [discoverGenreTracks],
  );

  const ytmFeedWarmSig = useMemo(
    () => ytmTopVideos.map((t) => t.videoId).join(','),
    [ytmTopVideos],
  );

  useEffect(() => {
    void Promise.allSettled([prewarmYtmFeed(ytmTopVideos as YtmPlaylistTrack[])]);
  }, [ytmFeedWarmSig]);

  const heroArtists = useMemo(() =>
    [...new Set(quickPicks.slice(0, 3).map(t => t.artist))].join(', '),
    [quickPicks]
  );

  // Prefetch Vybe Mix artwork + colors so it loads instantly when tapped
  useEffect(() => {
    const arts = quickPicks.slice(0, 4).map(t => t.artwork).filter(Boolean);
    arts.forEach(uri => { if (uri) Image.prefetch(uri); });
    if (arts[0]) prefetchHeroColors(arts[0]);
  }, [quickPicks.slice(0, 4).map(t => t.artwork).join()]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <Animated.ScrollView
        style={{ flex: 1, backgroundColor: '#000000' }}
        contentContainerStyle={{
          paddingBottom: tabScreenContentContainerPaddingBottom(insets.bottom),
        }}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#F97316"
            colors={['#F97316', '#DC2626']}
          />
        }
      >
        <Animated.View style={listMotionStyle}>
        <View
          style={{
            paddingTop: insets.top + 24,
            backgroundColor: '#000000',
            paddingHorizontal: 20,
            alignItems: 'flex-start',
            width: '100%',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingTop: 4 }}>
            <VybeHeaderMark size={36} />
            <Animated.View
              style={[
                {
                  flex: 1,
                  marginLeft: 12,
                  paddingBottom: 4,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'baseline',
                },
                greetingAnimatedStyle,
              ]}
            >
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: '800',
                  letterSpacing: -0.5,
                  textAlign: 'left',
                  textShadowColor: 'rgba(34, 211, 238, 0.6)',
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 12,
                }}
              >
                <AnimatedText style={headlineCyanPulseStyle}>Your Vybe</AnimatedText>
              </Text>
              <Text style={{ fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: '#FAFAFA', textAlign: 'left' }}>
                {headlineRest}
              </Text>
            </Animated.View>
          </View>
          <Animated.View style={[{ paddingBottom: 12, paddingTop: 6, alignSelf: 'stretch' }, greetingAnimatedStyle]}>
            <Text style={{ color: 'rgba(253,230,138,0.45)', fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textAlign: 'left' }}>
              Heat-picked rotation · sharp contrast · zero noise
            </Text>
          </Animated.View>
        </View>

        {(fireMixTracks.length > 0 || fireMixStatus === 'loading') && (
          <View style={{ marginTop: 22 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 14 }}>
              <Text style={{ color: '#FFFBEB', fontSize: 20, fontWeight: '800', letterSpacing: 0.35 }}>Your Fire Mix</Text>
              <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(234,88,12,0.45)', marginLeft: 12 }} />
            </View>
            {fireMixStatus === 'loading' && fireMixTracks.length === 0 ? (
              <ActivityIndicator color="#F97316" style={{ marginLeft: 20, marginBottom: 8 }} />
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4 }}
                style={{ flexGrow: 0 }}
              >
                {fireMixTracks.map((track) => {
                  const active = currentTrack?.id === track.id;
                  return (
                    <Pressable
                      key={track.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        playTrack(track, fireMixTracks);
                      }}
                      style={{ marginRight: 16, width: 136 }}
                    >
                      <View
                        style={[
                          { borderRadius: ART_RADIUS, overflow: 'hidden' },
                          active
                            ? {
                                ...Platform.select({
                                  ios: {
                                    shadowColor: '#EA580C',
                                    shadowOpacity: 0.95,
                                    shadowRadius: 18,
                                    shadowOffset: { width: 0, height: 0 },
                                  },
                                  android: { elevation: 14 },
                                }),
                              }
                            : {
                                ...Platform.select({
                                  ios: {
                                    shadowColor: '#000',
                                    shadowOpacity: 0.35,
                                    shadowRadius: 8,
                                    shadowOffset: { width: 0, height: 4 },
                                  },
                                  android: { elevation: 4 },
                                }),
                              },
                        ]}
                      >
                        <ShadowArtworkImage
                          source={{ uri: track.artwork }}
                          style={{ width: 136, height: 136, borderRadius: ART_RADIUS }}
                          contentFit="cover"
                        />
                      </View>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13, marginTop: 10 }} numberOfLines={1}>
                        {track.title}
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                        {track.artist}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        {/* The Decades Vault — surfaced early for fast decade dives */}
        {(() => {
          const MACHINED_PL_BORDER = 'rgba(0,229,255,0.92)';
          const playlistArtworkById = new Map<string, string>();
          curatedPlaylists.forEach((p) => {
            if (p.thumbnailUrl) playlistArtworkById.set(p.playlistId, p.thumbnailUrl);
          });
          return (
            <View style={{ marginTop: SECTION_GAP }}>
              <SectionHeader title="The Decades Vault" />
              <Text className="text-white/50 text-sm px-5 mb-4">Dial in a decade — one tap deep</Text>
              <View style={{ height: 228, flexGrow: 0 }}>
                <FlashList
                  data={DECADES_VAULT_CARDS}
                  horizontal
                  estimatedItemSize={172}
                  keyExtractor={(era) => era.playlistId}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20 }}
                  renderItem={({ item: era }) => {
                  const thumb =
                    playlistArtworkById.get(era.playlistId) || playlistThumbOverrides[era.playlistId];
                  const v = resolveShadowPlaylistVisual({
                    title: era.name,
                    playlistId: era.playlistId,
                    thumbnailUrl: thumb,
                    trackThumb: thumb,
                    seedVideoId: era.seedVideoId,
                  });
                  return (
                    <ShadowCuratedPlaylistCard
                      title={era.name}
                      artwork={v.artwork}
                      oledTitle={v.oledTitle}
                      subtitle={era.subtitle}
                      badgeSource="youtube_music"
                      width={160}
                      marginRight={12}
                      fixedBorderColor={MACHINED_PL_BORDER}
                      isActivePlaylist={currentTrack?.albumId === `ytm-pl-${era.playlistId}`}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        router.push(`/(app)/playlist-detail?id=${era.playlistId}` as never);
                      }}
                    />
                  );
                }}
                />
              </View>
            </View>
          );
        })()}

        <View style={{ marginTop: SECTION_GAP }}>
          <DailyMixHeroCard
            title={madeForYou?.title ?? 'Vybe Mix'}
            artistNames={heroArtists || 'Flume, ODESZA, Tycho'}
            artworks={(() => {
              // Prefer SoundCloud — square artwork fits the tile grid
              const seen = new Set<string>();
              const pool: string[] = [];
              for (const t of recentTracks) {
                if (t.source === 'soundcloud' && t.artwork && !seen.has(t.artwork)) {
                  seen.add(t.artwork); pool.push(t.artwork);
                  if (pool.length === 4) break;
                }
              }
              if (pool.length < 4) {
                for (const d of allDownloads) {
                  if (d.source === 'soundcloud' && d.artwork && !seen.has(d.artwork)) {
                    seen.add(d.artwork); pool.push(d.artwork);
                    if (pool.length === 4) break;
                  }
                }
              }
              // Fall back to any source if not enough SoundCloud art
              if (pool.length < 4) {
                for (const t of recentTracks) {
                  if (t.artwork && !seen.has(t.artwork)) {
                    seen.add(t.artwork); pool.push(t.artwork);
                    if (pool.length === 4) break;
                  }
                }
              }
              if (pool.length < 4) {
                for (const d of allDownloads) {
                  if (d.artwork && !seen.has(d.artwork)) {
                    seen.add(d.artwork); pool.push(d.artwork);
                    if (pool.length === 4) break;
                  }
                }
              }
              return pool;
            })()}
            onPress={() => router.push('/(app)/vybe-mix')}
          />
        </View>

        {/* ── SoundCloud-first home rails ──────────────────────────────────
            "New & Hot" + "Trending" pulled from the SC-Ignition curated set.
            Backend route /api/soundcloud/playlists resolves these from
            backend/catalog/soundcloud-curated-playlists.json. While the
            request is in flight we fall back to the Machined-Blue skeleton
            rail so the home tab never feels empty during cold start. */}
        {scCuratedPlaylists.length === 0 && isLoadingMixes ? (
          <>
            <View style={{ marginTop: SECTION_GAP }}>
              <SectionHeader title="New & Hot" />
              <MachinedBlueSkeletonRail />
            </View>
            <View style={{ marginTop: SECTION_GAP }}>
              <SectionHeader title="Trending" />
              <MachinedBlueSkeletonRail />
            </View>
          </>
        ) : null}
        {/* Fallback rails — when the curated catalog returns empty but the
            parallel /api/soundcloud/search trending fetch came back with
            tracks, surface those instead so the home tab never sits with a
            blank "New & Hot / Trending" pair. Tap-to-play wires straight to
            the SC-Ignition pool, same as the mini-player. */}
        {scCuratedPlaylists.length === 0 && !isLoadingMixes && scTrendingTracks.length > 0 ? (() => {
          const trendingQueue: Track[] = scTrendingTracks.map((x) => ({
            id: `sc-${x.trackId}`,
            title: x.title,
            artist: x.artist,
            artistId: '',
            album: '',
            albumId: '',
            artwork: x.artwork,
            duration: x.duration,
            isLiked: false,
            source: 'soundcloud' as const,
            soundcloudUrl: x.soundcloudUrl,
            audioUrl: '',
          }));
          const half = Math.max(1, Math.ceil(trendingQueue.length / 2));
          const newHot = trendingQueue.slice(0, half);
          const trending = trendingQueue.slice(half).length > 0
            ? trendingQueue.slice(half)
            : trendingQueue;
          const renderTrackRail = (rows: Track[]) => (
            <View style={{ height: 232, flexGrow: 0 }}>
              <FlashList
                data={rows}
                horizontal
                estimatedItemSize={80}
                keyExtractor={(t) => t.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item: t }) => (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      if (t.artwork) prefetchHeroColors(t.artwork);
                      void playTrack(t, trendingQueue);
                    }}
                    style={{ width: 150, marginRight: 12 }}
                  >
                    <ShadowArtworkImage
                      source={{ uri: t.artwork }}
                      style={{ width: 150, height: 150, borderRadius: ART_RADIUS }}
                      contentFit="cover"
                    />
                    <View style={{ position: 'absolute', top: 8, right: 8 }}>
                      <SourceCornerBadge source="soundcloud" compact />
                    </View>
                    <Text
                      style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 8, width: 150 }}
                      numberOfLines={1}
                    >
                      {t.title}
                    </Text>
                    <Text
                      style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, width: 150 }}
                      numberOfLines={1}
                    >
                      {t.artist}
                    </Text>
                  </Pressable>
                )}
              />
            </View>
          );
          return (
            <>
              <View style={{ marginTop: SECTION_GAP }}>
                <SectionHeader title="New & Hot" onSeeAll={() => router.push('/(app)/discover' as never)} />
                {renderTrackRail(newHot)}
              </View>
              <View style={{ marginTop: SECTION_GAP }}>
                <SectionHeader title="Trending" onSeeAll={() => router.push('/(app)/discover' as never)} />
                {renderTrackRail(trending)}
              </View>
            </>
          );
        })() : null}
        {scCuratedPlaylists.length > 0 && (() => {
          // Split the curated set in half: first slice powers the New & Hot
          // rail, second slice powers Trending. Keeps both rails populated
          // even when the catalog is small without duplicating cards.
          const half = Math.max(1, Math.ceil(scCuratedPlaylists.length / 2));
          const newHot = scCuratedPlaylists.slice(0, half);
          const trending = scCuratedPlaylists.slice(half).length > 0
            ? scCuratedPlaylists.slice(half)
            : scCuratedPlaylists;
          const renderRail = (rows: SoundcloudCuratedPlaylist[]) => (
            <View style={{ height: 232, flexGrow: 0 }}>
              <FlashList
                data={rows}
                horizontal
                // Speed Mode: per the zero-lag tuning spec, our rail items
                // virtualize off an 80pt baseline. FlashList still measures
                // real cell heights — this just primes the windowing.
                estimatedItemSize={80}
                keyExtractor={(pl) => pl.playlistId}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                renderItem={({ item: pl }) => {
                const art = pl.thumbnailUrl || pl.tracks[0]?.thumbnailUrl || '';
                return (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      if (art) prefetchHeroColors(art);
                      router.push({
                        pathname: '/(app)/playlist-detail',
                        params: {
                          scSet: encodeURIComponent(pl.soundcloudSetUrl),
                          playlistName: pl.name,
                        },
                      } as never);
                    }}
                    style={{ width: 150, marginRight: 12 }}
                  >
                    <ShadowArtworkImage
                      source={{ uri: art }}
                      style={{ width: 150, height: 150, borderRadius: ART_RADIUS }}
                      contentFit="cover"
                    />
                    <View style={{ position: 'absolute', top: 8, right: 8 }}>
                      <SourceCornerBadge source="soundcloud" compact />
                    </View>
                    <Text
                      style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 8, width: 150 }}
                      numberOfLines={1}
                    >
                      {pl.name}
                    </Text>
                    {pl.category ? (
                      <Text
                        style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, width: 150 }}
                        numberOfLines={1}
                      >
                        {pl.category}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              }}
              />
            </View>
          );
          return (
            <>
              <View style={{ marginTop: SECTION_GAP }}>
                <SectionHeader title="New & Hot" onSeeAll={() => router.push('/(app)/discover' as never)} />
                {renderRail(newHot)}
              </View>
              <View style={{ marginTop: SECTION_GAP }}>
                <SectionHeader title="Trending" onSeeAll={() => router.push('/(app)/discover' as never)} />
                {renderRail(trending)}
              </View>
            </>
          );
        })()}

        {curatedPlaylists.length > 0 && (
          <View style={{ marginTop: SECTION_GAP }}>
            <SectionHeader title="Heavy Rotation" />
            <View
              style={{
                marginHorizontal: 20,
                borderWidth: 0.5,
                borderColor: 'rgba(255,255,255,0.1)',
                borderRadius: 20,
                padding: 12,
              }}
            >
              <HeavyRotationShadowGrid
                playlists={curatedPlaylists}
                activeAlbumId={currentTrack?.albumId}
                onOpen={(pl) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  prefetchHeroColors(pl.thumbnailUrl);
                  router.push({ pathname: '/(app)/playlist-detail', params: { playlistId: pl.playlistId, playlistName: pl.name } } as never);
                }}
              />
            </View>
          </View>
        )}

        {/* ── Quick Picks ── */}
        <View style={{ marginTop: SECTION_GAP }}>
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
              {quickPickPages.map((page, pageIdx) => (
                <View key={pageIdx} style={{ width: Dimensions.get('window').width }}>
                  {page.map(track => (
                    <QuickPickRow
                      key={track.id}
                      track={track}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, quickPicks); }}
                      onMore={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActionsTrack(track); }}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
          {quickPickPages.length > 1 && (
            <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, textAlign: 'center', paddingTop: 6, paddingBottom: 2 }}>
              Swipe right for more
            </Text>
          )}
        </View>

        {/* ── New Releases ── */}
        {spotifyPlaylists.length > 0 && (
          <View style={{ marginTop: SECTION_GAP }}>
            <SectionHeader title="New Releases" onSeeAll={() => router.push('/(app)/discover' as never)} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
              {spotifyPlaylists.map(pl => (
                <HeavyRotationCard
                  key={pl.playlistId}
                  playlist={{
                    name: pl.name,
                    artwork:
                      pl.artwork ||
                      pl.thumbnailUrl ||
                      pl.tracks[0]?.artwork ||
                      pl.tracks[0]?.thumbnailUrl ||
                      '',
                    trackCount: pl.tracks.length,
                  }}
                  variant="shadowRail"
                  badgeSource="stream"
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    const spTracks: Track[] = pl.tracks.map(t => ({
                      id: `sp-${t.videoId}`,
                      title: t.title,
                      artist: t.channelName,
                      artistId: `sp-artist-${t.videoId}`,
                      album: pl.name,
                      albumId: `sp-pl-${pl.playlistId}`,
                      artwork: t.artwork || t.thumbnailUrl,
                      duration: Math.round(t.durationMs / 1000),
                      isLiked: false,
                      source: 'youtube_music' as const,
                      youtubeId: t.videoId,
                      youtubeMusicId: t.videoId,
                    }));
                    if (spTracks.length > 0) playTrack(spTracks[0], spTracks);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Continue Listening ── */}
        {recentTracks.length > 0 && (
          <View style={{ marginTop: SECTION_GAP }}>
            <SectionHeader title="Continue Listening" />
            {recentTracks.map(track => (
              <QuickPickRow
                key={track.id}
                track={track}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, recentTracks); }}
                onMore={() => setActionsTrack(track)}
              />
            ))}
          </View>
        )}

        {/* Fresh Finds - New discoveries based on listening */}
        {freshFinds.length > 0 && (
          <View style={{ marginTop: SECTION_GAP }}>
            <View className="flex-row items-center px-5 mb-4">
              <Sparkles size={20} color="#8B5CF6" />
              <MachinedGradientText neonGlow style={{ fontSize: 22, fontWeight: '800', letterSpacing: 0.55, marginLeft: 8 }}>
                Fresh Finds
              </MachinedGradientText>
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
            <FlashList
              data={freshFinds}
              horizontal
              keyExtractor={(item) => item.id}
              estimatedItemSize={156}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              renderItem={({ item: track }) => (
                <Pressable
                  onPress={() => handlePlayFreshFind(track)}
                  style={{ width: 140, marginRight: 16 }}
                >
                  <View className="relative">
                    <ShadowArtworkImage
                      source={{ uri: track.artwork }}
                      style={{ width: 140, height: 140, borderRadius: ART_RADIUS }}
                      contentFit="cover"
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(139,92,246,0.5)']}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 60,
                        borderBottomLeftRadius: ART_RADIUS,
                        borderBottomRightRadius: ART_RADIUS,
                      }}
                    />
                    <View style={{ position: 'absolute', top: 8, right: 8 }}>
                      <SourceCornerBadge source={track.source} compact />
                    </View>
                    {track.isNew && (
                      <View
                        className="absolute top-2 left-2 px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: 'rgba(57,255,20,0.14)',
                          borderWidth: StyleSheet.hairlineWidth,
                          borderColor: 'rgba(57,255,20,0.9)',
                        }}
                      >
                        <Text className="text-[9px] font-extrabold" style={{ color: '#39FF14' }}>NEW</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: 140 }}>
                    {track.title}
                  </Text>
                  <Text className="text-white/60 text-xs" numberOfLines={1} style={{ width: 140 }}>
                    {track.artist}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        )}

        {/* Discover Something Different */}
        {discoverGenreTracks.length > 0 && (
          <View className="mt-8">
            <SectionHeader title="Discover Something Different" />
            <Text className="text-white/50 text-sm px-5 mb-4">
              {discoverGenreLabel ? `Exploring ${discoverGenreLabel} — genres outside your library` : 'Genres outside your library'}
            </Text>
            <FlashList
              data={discoverGenreTracks}
              horizontal
              keyExtractor={(t) => `${t.videoId}-${t.genre}`}
              estimatedItemSize={156}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              renderItem={({ item: t }) => {
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
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      playTrack(track, discoverGenreQueue);
                    }}
                    style={{ marginRight: 16 }}
                  >
                    <View className="relative">
                      <ShadowArtworkImage
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
                      <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(139,92,246,0.85)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{t.genre}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        )}

        {/* Recently Played - Shows actual recent tracks including imports */}
        {(recentTracks.length > 0 || importedTracks.length > 0) && (
          <View style={{ marginTop: SECTION_GAP }}>
            <SectionHeader title="Recently Played" />
            <FlashList
              data={recentRailTracks}
              horizontal
              keyExtractor={(item) => item.id}
              estimatedItemSize={172}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              renderItem={({ item: track }) => (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    addToRecents(track);
                    playTrack(track, recentRailTracks);
                  }}
                  style={{ width: 140, marginRight: 16 }}
                >
                  <View
                    style={{
                      width: 140,
                      height: 140,
                      borderRadius: ART_RADIUS,
                      overflow: 'hidden',
                      backgroundColor: '#1A1A1A',
                      borderWidth: 0.5,
                      borderColor: 'rgba(255,255,255,0.1)',
                    }}
                  >
                    {track.artwork ? (
                      <ShadowArtworkImage
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
                    <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                      <SourceCornerBadge source={track.source} compact />
                    </View>
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
              )}
            />
          </View>
        )}

        {/* Fallback: Show albums if no recents yet */}
        {recentTracks.length === 0 && importedTracks.length === 0 && (
          <View className="mt-8">
            <SectionHeader title="Recently Played" />
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
                artwork: t.artwork || t.thumbnailUrl,
                duration: Math.round(t.durationMs / 1000),
                isLiked: false,
                source: 'youtube_music' as const,
                youtubeId: t.videoId,
                youtubeMusicId: t.videoId,
                youtubeMusicUrl: `https://music.youtube.com/watch?v=${t.videoId}`,
              }));
              const cover =
                playlist.artwork || playlist.thumbnailUrl || playlistTracks[0]?.artwork || '';
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
                      <ShadowArtworkImage source={{ uri: cover }} style={{ width: 64, height: 64 }} contentFit="cover" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }} numberOfLines={1}>{playlist.name}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 }}>{playlist.tracks.length} songs · via Spotify</Text>
                    </View>
                    <Pressable
                      onPress={(e) => {
                        (e as unknown as { stopPropagation?: () => void }).stopPropagation?.();
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
                          <ShadowArtworkImage source={{ uri: track.artwork }} style={{ width: 120, height: 120 }} contentFit="cover" />
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

        {/* From YouTube — trending music videos from backend */}
        {ytTrendingTracks.length > 0 ? (
          <View style={{ marginTop: SECTION_GAP }}>
            <SectionHeader title="From YouTube" />
            <Text className="text-white/50 text-sm px-5 mb-4">
              Music videos and more
            </Text>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {ytTrendingTracks.map(t => {
                const track = {
                  id: `yt-${t.videoId}`,
                  title: t.title,
                  artist: t.channelName,
                  artistId: '',
                  album: '',
                  albumId: '',
                  artwork: t.thumbnailUrl,
                  duration: 0,
                  isLiked: false,
                  source: 'youtube' as const,
                  youtubeId: t.videoId,
                  audioUrl: '',
                };
                const queueTracks = ytTrendingTracks.map(x => ({
                  id: `yt-${x.videoId}`,
                  title: x.title,
                  artist: x.channelName,
                  artistId: '',
                  album: '',
                  albumId: '',
                  artwork: x.thumbnailUrl,
                  duration: 0,
                  isLiked: false,
                  source: 'youtube' as const,
                  youtubeId: x.videoId,
                  audioUrl: '',
                }));
                const W = 168;
                const H = Math.round((W * 9) / 16);
                return (
                  <Pressable
                    key={track.id}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      playTrack(track, queueTracks);
                    }}
                    className="mr-4"
                  >
                    <View
                      style={{
                        width: W,
                        height: H,
                        borderRadius: 16,
                        overflow: 'hidden',
                        backgroundColor: '#0A0A0A',
                        borderWidth: 0.5,
                        borderColor: 'rgba(255,255,255,0.1)',
                      }}
                    >
                      <ShadowArtworkImage
                        source={{ uri: track.artwork }}
                        style={{ width: W, height: H }}
                        contentFit="cover"
                      />
                      <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: 'rgba(255,255,255,0.36)',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Play size={22} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
                        </View>
                      </View>
                      <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                        <SourceCornerBadge source="youtube" compact />
                      </View>
                    </View>
                    <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: W }}>
                      {track.title}
                    </Text>
                    <Text style={{ width: W, color: '#888888', fontSize: 12 }} numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <HomePulseFeedBlock posts={pulseFeedPosts} playTrack={playTrack} />

        <HomeVybeVideoRail tracks={ytmTopVideos} playTrack={playTrack} />

        {/* From SoundCloud — trending from backend */}
        {scTrendingTracks.length > 0 ? (
          <View style={{ marginTop: SECTION_GAP }}>
            <SectionHeader title="From SoundCloud" />
            <Text className="text-white/50 text-sm px-5 mb-4">
              Independent artists and remixes
            </Text>
            <View style={{ height: 224, flexGrow: 0 }}>
              <FlashList
                data={scTrendingTracks}
                horizontal
                estimatedItemSize={156}
                keyExtractor={(t) => `sc-${t.trackId}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                onViewableItemsChanged={onScTrendingViewable}
                viewabilityConfig={{ itemVisiblePercentThreshold: 55, minimumViewTime: 80 }}
                renderItem={({ item: t }) => {
                const track = {
                  id: `sc-${t.trackId}`,
                  title: t.title,
                  artist: t.artist,
                  artistId: '',
                  album: '',
                  albumId: '',
                  artwork: t.artwork,
                  duration: t.duration,
                  isLiked: false,
                  source: 'soundcloud' as const,
                  soundcloudUrl: t.soundcloudUrl,
                  audioUrl: '',
                };
                const queueTracks = scTrendingTracks.map(x => ({
                  id: `sc-${x.trackId}`,
                  title: x.title,
                  artist: x.artist,
                  artistId: '',
                  album: '',
                  albumId: '',
                  artwork: x.artwork,
                  duration: x.duration,
                  isLiked: false,
                  source: 'soundcloud' as const,
                  soundcloudUrl: x.soundcloudUrl,
                  audioUrl: '',
                }));
                const dim = 140;
                return (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      playTrack(track, queueTracks);
                    }}
                    className="mr-4"
                  >
                    <View
                      style={{
                        width: dim,
                        height: dim,
                        borderRadius: 16,
                        overflow: 'hidden',
                        backgroundColor: '#0A0A0A',
                        borderWidth: 0.5,
                        borderColor: 'rgba(255,255,255,0.1)',
                      }}
                    >
                      <ShadowArtworkImage
                        source={{ uri: track.artwork }}
                        style={{ width: dim, height: dim }}
                        contentFit="cover"
                      />
                      <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                        <SourceCornerBadge source="soundcloud" compact />
                      </View>
                    </View>
                    <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: dim }}>
                      {track.title}
                    </Text>
                    <Text style={{ width: dim, color: '#888888', fontSize: 12 }} numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </Pressable>
                );
              }}
              />
            </View>
          </View>
        ) : null}

        {/* Bottom shelf — single horizontal glide (replaces split Late Night / Focus grids) */}
        <HomeDownloadSleekRail
          allDownloads={allDownloads}
          playTrack={playTrack}
        />

        </Animated.View>
      </Animated.ScrollView>

    </View>
  );
}
