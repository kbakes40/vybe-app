import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, ActivityIndicator, RefreshControl, NativeSyntheticEvent, NativeScrollEvent, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Play,
  Pause,
  ChevronRight,
  Moon,
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
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { PlaylistCard } from '@/components/PlaylistCard';
import { clearCuratedPlaylistWarmSession } from '@/lib/curatedPlaylistWarmup';
import { preResolveYoutubeVideoId } from '@/lib/youtubeResolvePreloadCache';
import { normalizeYoutubePlaylistTracksPayload } from '@/lib/youtubePlaylistTracksNormalize';
import { useCuratedPlaylistCardWarmup } from '@/hooks/useCuratedPlaylistCardWarmup';
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
import { prefetchHeroColors } from '@/lib/usePlaylistHeroColors';
import { createMMKVCache, TTL } from '@/lib/mmkv-cache';
import { tabScreenScrollBottomPad } from '@/constants/miniPlayer';
import { ShadowSavedMark } from '@/components/DownloadButton';
import { SourceCornerBadge } from '@/components/SourceCornerBadge';
import { QuickPickRow } from '@/components/QuickPickRow';

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
        <Image
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
          colors={['#1A0836', '#0F0428', '#0D0722']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 20,
            overflow: 'hidden',
            borderWidth: 0.5,
            borderColor: 'rgba(255,255,255,0.1)',
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
                      backgroundColor: 'rgba(139,92,246,0.22)',
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: 'rgba(196,181,253,0.45)',
                    }}
                  >
                    <Text style={{ color: '#E9D5FF', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }}>MADE FOR YOU</Text>
                  </View>
                  <View
                    style={{
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      backgroundColor: 'rgba(57,255,20,0.1)',
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: 'rgba(57,255,20,0.75)',
                    }}
                  >
                    <Text style={{ color: '#39FF14', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }}>NEW</Text>
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

/** 2×3 Shadow grid — square tiles, center glass play, YT badge, typography below */
function HeavyRotationShadowGrid({
  playlists,
  onOpen,
}: {
  playlists: CuratedPlaylist[];
  onOpen: (pl: CuratedPlaylist) => void;
}) {
  const innerW = SCREEN_W - HEAVY_SECTION_H_PAD * 2 - 24;
  const colGap = 12;
  const cell = (innerW - colGap) / 2;
  const six = playlists.slice(0, 6);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {six.map((pl, idx) => (
        <Pressable
          key={pl.playlistId}
          onPress={() => onOpen(pl)}
          style={{ width: cell, marginBottom: idx < 4 ? 16 : 0 }}
        >
          <View style={{ width: cell, height: cell, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0A0A0A' }}>
            <Image source={{ uri: pl.thumbnailUrl }} style={{ width: cell, height: cell }} contentFit="cover" cachePolicy="memory-disk" />
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: 'rgba(255,255,255,0.36)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Play size={24} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
              </View>
            </View>
            <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
              <SourceCornerBadge source="youtube_music" />
            </View>
          </View>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, marginTop: 10, letterSpacing: 0.15 }} numberOfLines={2}>
            {pl.name}
          </Text>
          <Text style={{ color: '#888888', fontSize: 12, marginTop: 4, fontWeight: '600' }}>{pl.tracks.length} songs</Text>
        </Pressable>
      ))}
    </View>
  );
}

function HeavyRotationCard({
  playlist,
  onPress,
  variant = 'default',
}: {
  playlist: { name: string; artwork: string; trackCount: number };
  onPress: () => void;
  variant?: 'default' | 'shadowRail';
}) {
  const dim = variant === 'shadowRail' ? RAIL_CARD_DIM : ROTATION_CARD_SIZE;
  const showBadge = true;
  return (
    <Pressable onPress={onPress} style={{ width: dim, marginRight: variant === 'shadowRail' ? 14 : 12 }}>
      <View
        style={{
          width: dim,
          height: dim,
          borderRadius: ART_RADIUS,
          overflow: 'hidden',
          backgroundColor: '#121214',
          borderWidth: variant === 'shadowRail' ? StyleSheet.hairlineWidth : 0,
          borderColor: 'rgba(255,255,255,0.14)',
        }}
      >
        <Image source={{ uri: playlist.artwork }} style={{ width: dim, height: dim }} contentFit="cover" />
        {variant === 'shadowRail' ? (
          <View
            style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(8,8,12,0.18)' }]}
            pointerEvents="none"
          />
        ) : null}
        {showBadge ? (
          <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
            <SourceCornerBadge source="youtube_music" />
          </View>
        ) : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}>
          <View
            style={{
              width: variant === 'shadowRail' ? 40 : 36,
              height: variant === 'shadowRail' ? 40 : 36,
              borderRadius: variant === 'shadowRail' ? 20 : 18,
              backgroundColor: 'rgba(255,255,255,0.34)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Play size={variant === 'shadowRail' ? 18 : 16} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
          </View>
        </View>
      </View>
      <Text style={{ color: '#fff', fontSize: variant === 'shadowRail' ? 14 : 12, fontWeight: '800', marginTop: 10, letterSpacing: 0.2 }} numberOfLines={2}>
        {playlist.name}
      </Text>
      <Text style={{ color: '#888888', fontSize: 12, marginTop: 4, fontWeight: '600' }}>{playlist.trackCount} songs</Text>
    </Pressable>
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
    <View style={{ paddingHorizontal: 20, marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: 0.35 }}>{title}</Text>
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
  channelId?: string;
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

/** YouTube Music curated playlist tile with visible-first resolve warming + ready play affordance. */
function HomeYtmCuratedPlaylistCard({ playlist }: { playlist: CuratedPlaylist }) {
  const router = useRouter();
  const playTrack = usePlaybackController(s => s.playTrack);
  const videoIds = useMemo(() => playlist.tracks.map(t => t.videoId), [playlist.tracks]);
  const { ref, onLayout, isReady, firstVideoId } = useCuratedPlaylistCardWarmup(
    playlist.playlistId,
    playlist.name,
    videoIds,
  );

  const playlistTracks: Track[] = useMemo(
    () =>
      playlist.tracks.map(t => ({
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
      })),
    [playlist],
  );

  const cover = playlist.thumbnailUrl || playlistTracks[0]?.artwork || '';

  return (
    <View ref={ref} collapsable={false} onLayout={onLayout} className="mr-4">
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push(`/(app)/playlist-detail?id=${playlist.playlistId}` as never);
        }}
      >
        <View style={{ width: 150 }}>
          <View
            style={{
              width: 150,
              height: 150,
              borderRadius: ART_RADIUS,
              overflow: 'hidden',
              backgroundColor: '#121214',
              borderWidth: 0.5,
              borderColor: 'rgba(255,255,255,0.1)',
            }}
          >
            <Image source={{ uri: cover }} style={{ width: 150, height: 150 }} contentFit="cover" />
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(6,6,10,0.12)' }]} pointerEvents="none" />
            <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
              <SourceCornerBadge source="youtube_music" />
            </View>
            <Pressable
              onPressIn={() => {
                if (firstVideoId) preResolveYoutubeVideoId(firstVideoId);
                videoIds.slice(0, 3).forEach(id => preResolveYoutubeVideoId(id));
              }}
              onPress={(e) => {
                e.stopPropagation();
                if (playlistTracks.length === 0) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                void playTrack(playlistTracks[0], playlistTracks, { expandNowPlaying: false });
                router.push({
                  pathname: '/(app)/playlist-detail',
                  params: { playlistId: playlist.playlistId, playlistName: playlist.name },
                } as never);
              }}
              style={[StyleSheet.absoluteFillObject, { alignItems: 'center', justifyContent: 'center' }]}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: 'rgba(255,255,255,0.34)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Play size={22} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
              </View>
            </Pressable>
          </View>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13, marginTop: 10, letterSpacing: 0.2 }} numberOfLines={2}>
            {playlist.name}
          </Text>
          <Text style={{ color: '#888888', fontSize: 11, marginTop: 3, fontWeight: '600' }}>{playlist.tracks.length} songs</Text>
        </View>
      </Pressable>
    </View>
  );
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
} as const;

// SoundCloud track shape returned by /api/soundcloud/search
interface SCApiTrack {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);

  useFocusEffect(
    useCallback(() => {
      return () => clearCuratedPlaylistWarmSession();
    }, []),
  );

  const [showProfileMenu, setShowProfileMenu] = useState(false);
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
  const [ytmTracks, setYtmTracks] = useState<PlaylistTrack[]>(() => {
    const hit = homeMMKV.get<PlaylistTrack[]>(HOME_KEYS.ytmTracks, TTL.GENRE);
    return hit?.value ?? [];
  });
  const [ytmQueryLabel, setYtmQueryLabel] = useState(() => {
    const hit = homeMMKV.get<string>(HOME_KEYS.ytmQueryLabel, TTL.GENRE);
    return hit?.value ?? '';
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
  // playlistId → first-track artwork map for Era Hits (cached so the cards
  // paint instantly with real album art on every app open).
  const [eraArtwork, setEraArtwork] = useState<Record<string, string>>(() => {
    const hit = homeMMKV.get<Record<string, string>>(HOME_KEYS.eraArtwork, TTL.CURATED);
    return hit?.value ?? {};
  });
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
      'PLmyAPRLQRJ6lMbAdXYGuyZ627Y9RoX25i',
      'RDCLAK5uy_mGYde2Wyx9INZd6GbPcMWkxDOu6Utmedw',
      'RDCLAK5uy_nZgpioZcDw6oYAp4o3oUNTWdVK0j_XyWo',
      'RDCLAK5uy_mplKe9BIYCO3ZuNWSHZr48bm9DUDzbWnE',
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
      setEraArtwork(prev => {
        const merged = { ...prev, ...map };
        homeMMKV.set(HOME_KEYS.eraArtwork, merged);
        return merged;
      });
    });
    return () => { cancelled = true; };
  }, []);

  const fetchMixes = async () => {
    setIsLoadingMixes(true);

    try {
      // Fetch all mixes
      const mixesResponse = await api.get<MixDefinition[]>('/api/soundcloud/mixes');
      if (mixesResponse) {
        setMixes(mixesResponse);
        homeMMKV.set(HOME_KEYS.mixes, mixesResponse);
      }

      // Fetch curated YouTube Music playlists
      const playlistsResponse = await api.get<CuratedPlaylist[]>('/api/youtube/playlists');
      if (playlistsResponse) {
        const filtered = playlistsResponse.filter(p => p.tracks.length > 0);
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

      // Fetch personalized YouTube Music tracks based on listening history
      const ytmQuery = buildYTMQuery();
      const ytmLabel = ytmQuery.replace(/ music$| new music$/, '').trim();
      setYtmQueryLabel(ytmLabel);
      homeMMKV.set(HOME_KEYS.ytmQueryLabel, ytmLabel);
      const ytmResponse = await api.get<PlaylistTrack[]>(`/api/youtube/search?q=${encodeURIComponent(ytmQuery)}&maxResults=10`);
      if (ytmResponse && ytmResponse.length > 0) {
        setYtmTracks(ytmResponse);
        homeMMKV.set(HOME_KEYS.ytmTracks, ytmResponse);
      }

      // Fetch tracks for genres the user hasn't explored
      const absentGenres = getAbsentGenres();
      if (absentGenres.length > 0) {
        const genreLabel = absentGenres.map(g => g.name).join(' & ');
        setDiscoverGenreLabel(genreLabel);
        homeMMKV.set(HOME_KEYS.discoverGenreLabel, genreLabel);
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
        homeMMKV.set(HOME_KEYS.discoverGenreTracks, interleaved);
      }

      // From YouTube — trending music videos from backend (cached 1h)
      const ytTrending = await api.get<PlaylistTrack[]>(`/api/youtube/search?q=${encodeURIComponent('trending music videos')}&maxResults=15`).catch(() => null);
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
        const eraPlaylists = results.filter((p): p is CuratedPlaylist => !!p);
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
          setEraArtwork(prev => {
            const merged = { ...prev, ...artMap };
            homeMMKV.set(HOME_KEYS.eraArtwork, merged);
            return merged;
          });
        }
      });

      // From SoundCloud — trending tracks from backend (cached 1h)
      const scTrending = await api.get<SCApiTrack[]>(`/api/soundcloud/search?q=${encodeURIComponent('trending')}&maxResults=15`).catch(() => null);
      if (scTrending && scTrending.length > 0) {
        setScTrendingTracks(scTrending);
        homeMMKV.set(HOME_KEYS.scTrendingTracks, scTrending);
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

  // Prefetch Vybe Mix artwork + colors so it loads instantly when tapped
  useEffect(() => {
    const arts = quickPicks.slice(0, 4).map(t => t.artwork).filter(Boolean);
    arts.forEach(uri => { if (uri) Image.prefetch(uri); });
    if (arts[0]) prefetchHeroColors(arts[0]);
  }, [quickPicks.slice(0, 4).map(t => t.artwork).join()]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#000000' }}
        contentContainerStyle={{ paddingBottom: tabScreenScrollBottomPad(insets.bottom, !!currentTrack) }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#8B5CF6"
            colors={['#8B5CF6']}
          />
        }
      >
        <View style={{ paddingTop: insets.top, backgroundColor: '#000000' }}>
          <View className="flex-row items-center justify-between px-5 pt-4 pb-1">
            <VybeIcon size={36} variant="primary" />
            <ProfileAvatar
              size={36}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowProfileMenu(true);
              }}
            />
          </View>
          <Animated.View style={[{ paddingHorizontal: 20, paddingBottom: 12 }, greetingAnimatedStyle]}>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>
              {greeting || 'Your Heavy Rotation'}
            </Text>
          </Animated.View>
        </View>

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
              {[quickPicks.slice(0, 5), quickPicks.slice(5, 10), quickPicks.slice(10, 15), quickPicks.slice(15, 20)].filter(page => page.length > 0).map((page, pageIdx) => (
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
          {quickPicks.length > 5 && (
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
              {spotifyPlaylists.slice(0, 6).map(pl => (
                <HeavyRotationCard
                  key={pl.playlistId}
                  playlist={{ name: pl.name, artwork: pl.thumbnailUrl, trackCount: pl.tracks.length }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    const spTracks: Track[] = pl.tracks.map(t => ({
                      id: `sp-${t.videoId}`,
                      title: t.title,
                      artist: t.channelName,
                      artistId: `sp-artist-${t.videoId}`,
                      album: pl.name,
                      albumId: `sp-pl-${pl.playlistId}`,
                      artwork: t.thumbnailUrl,
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
            {recentTracks.slice(0, 3).map(track => (
              <QuickPickRow
                key={track.id}
                track={track}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, recentTracks); }}
                onMore={() => setActionsTrack(track)}
              />
            ))}
          </View>
        )}

        {/* All-time Essentials — YouTube Music playlists */}
        {curatedPlaylists.length > 0 && (() => {
          // Exclude era playlists — they get their own dedicated row below.
          const essentials = curatedPlaylists.filter(p => !p.category && (p as any).section !== 'era');
          // Hide "Hits / Mainstream" sub-row — those playlists are already
          // surfaced in other home-screen sections, so it was showing duplicates.
          // Also exclude any `section: 'popular'` categories here — those
          // render separately under the "Popular Playlists" section below,
          // so including them here created the duplicate rows.
          const HIDDEN_CATEGORIES = new Set(['Hits / Mainstream']);
          const categories = Array.from(new Set(
            curatedPlaylists
              .filter(p => p.category && !HIDDEN_CATEGORIES.has(p.category) && (p as any).section !== 'popular')
              .map(p => p.category!)
          ));

          return (
            <View style={{ marginTop: SECTION_GAP }}>
              <SectionHeader title="All-time Essentials" />
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, paddingHorizontal: 20, marginBottom: 16, letterSpacing: 0.25 }}>
                Handpicked YouTube Music playlists
              </Text>
              {essentials.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20 }}
                  style={{ flexGrow: 0 }}
                >
                  {essentials.map(pl => (
                    <HomeYtmCuratedPlaylistCard key={pl.playlistId} playlist={pl} />
                  ))}
                </ScrollView>
              )}
              {categories.map(cat => {
                const catPlaylists = curatedPlaylists.filter(p => p.category === cat);
                return (
                  <View key={cat} style={{ marginTop: SECTION_GAP }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 19, fontWeight: '800', letterSpacing: 0.45 }}>{cat}</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 12 }} />
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 20 }}
                      style={{ flexGrow: 0 }}
                    >
                      {catPlaylists.map(pl => (
                        <HomeYtmCuratedPlaylistCard key={pl.playlistId} playlist={pl} />
                      ))}
                    </ScrollView>
                  </View>
                );
              })}
            </View>
          );
        })()}

        {/* Fresh Finds - New discoveries based on listening */}
        {freshFinds.length > 0 && (
          <View style={{ marginTop: SECTION_GAP }}>
            <View className="flex-row items-center px-5 mb-4">
              <Sparkles size={20} color="#8B5CF6" />
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 0.55, marginLeft: 8 }}>Fresh Finds</Text>
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

        {/* Era Hits — curated YouTube Music playlists by decade */}
        {(() => {
          // Hardcoded first-track videoId per era so the thumbnail resolves
          // synchronously from the canonical `i.ytimg.com/vi/{id}/hqdefault.jpg`
          // URL (same format All-time Essentials uses and renders cleanly in
          // expo-image). No runtime fetch, no MMKV race, no empty state.
          const ERA_HITS: { name: string; playlistId: string; subtitle: string; seedVideoId: string }[] = [
            { name: "The Hits: '70s",       playlistId: 'OLAK5uy_nNJT7AbBdhV752pwUKXiyYRs6aEiUyh5Y', subtitle: 'Greatest hits from the 70s', seedVideoId: '7E8-1t-qh4U' },
            { name: "The Hits: '80s",       playlistId: 'RDCLAK5uy_lMzHW51iFg1Kx0d_2EHpzbOgCrwtu8cgI', subtitle: 'Greatest hits from the 80s', seedVideoId: 'Zi_XLOBDo_Y' },
            { name: "The Hits: '90s",       playlistId: 'RDCLAK5uy_nQkPLhMF6chdzKSlWdX8NHMrLVpdci-eU', subtitle: 'Greatest hits from the 90s', seedVideoId: 'FrLequ6dUdM' },
            { name: "90s & 00s Hits Rewind",playlistId: 'OLAK5uy_k8MpasYgwAswSjuvZN5ilDMNPxT5R-mHk', subtitle: 'Throwbacks across two decades', seedVideoId: 'uzlHFKhd1Jo' },
            { name: "MTV Hits 90's-2000's", playlistId: 'PLmyAPRLQRJ6lMbAdXYGuyZ627Y9RoX25i',         subtitle: 'MTV era classics', seedVideoId: 'TIy3n2b7V9k' },
            { name: "The Hits: '10s",       playlistId: 'RDCLAK5uy_mGYde2Wyx9INZd6GbPcMWkxDOu6Utmedw', subtitle: 'Greatest hits from the 2010s', seedVideoId: 'fRh_vgS2dFE' },
            { name: "'10s Party",           playlistId: 'RDCLAK5uy_nZgpioZcDw6oYAp4o3oUNTWdVK0j_XyWo', subtitle: 'Pop party 2010s', seedVideoId: '2zNSgSzhBfM' },
            { name: "Millennial Mixtape",   playlistId: 'RDCLAK5uy_mplKe9BIYCO3ZuNWSHZr48bm9DUDzbWnE', subtitle: 'Anthems for the millennial', seedVideoId: 'ZSM3w1v-A_Y' },
          ];

          // Pull each era playlist's artwork directly from YouTube Music if it's
          // already loaded into the curatedPlaylists cache; otherwise fall back
          // to a gradient + decade label.
          const playlistArtworkById = new Map<string, string>();
          curatedPlaylists.forEach(p => { if (p.thumbnailUrl) playlistArtworkById.set(p.playlistId, p.thumbnailUrl); });

          return (
            <View className="mt-8">
              <SectionHeader title="Era Hits" />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20 }}
                style={{ flexGrow: 0 }}
              >
                {ERA_HITS.map((era) => {
                  // Priority:
                  //   1. Backend curated thumbnail (once era commit is deployed)
                  //   2. Runtime-fetched first-track thumbnail from MMKV
                  //   3. Hardcoded seed videoId → canonical YT thumbnail URL
                  //      (always works, same format All-time Essentials uses)
                  const artworkUri =
                    playlistArtworkById.get(era.playlistId)
                    || eraArtwork[era.playlistId]
                    || `https://i.ytimg.com/vi/${era.seedVideoId}/hqdefault.jpg`;
                  return (
                    <Pressable
                      key={era.playlistId}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        router.push(`/(app)/playlist-detail?id=${era.playlistId}` as never);
                      }}
                      style={{ marginRight: 14, width: 160 }}
                    >
                      <View style={{ width: 160, height: 160, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1a1a1a' }}>
                        <Image
                          source={{ uri: artworkUri }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          placeholder={undefined}
                        />
                      </View>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', marginTop: 8 }} numberOfLines={1}>{era.name}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{era.subtitle}</Text>
                    </Pressable>
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
          <View style={{ marginTop: SECTION_GAP }}>
            <SectionHeader title="Recently Played" onSeeAll={() => router.push('/(app)/downloads' as never)} />
            <ScrollView
              horizontal
              nestedScrollEnabled
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
                      borderRadius: ART_RADIUS,
                      overflow: 'hidden',
                      backgroundColor: '#1A1A1A',
                      borderWidth: 0.5,
                      borderColor: 'rgba(255,255,255,0.1)',
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
                    <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                      <SourceCornerBadge source={track.source} compact />
                    </View>
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

          return (
            <View className="mt-8">
              <SectionHeader title="Popular Playlists" />
              {popularCategories.map(cat => {
                const catPlaylists = popularPlaylists.filter(p => (p.category ?? 'Other') === cat);
                // Chill / Relaxed + Workout / Energy render as 2-row grids
                // so the ~10 playlists in each feel browsable without endless
                // horizontal scroll. Other categories stay single-row.
                const useTwoRows = cat === 'Chill / Relaxed' || cat === 'Workout / Energy';
                if (useTwoRows) {
                  const pairs: CuratedPlaylist[][] = [];
                  for (let i = 0; i < catPlaylists.length; i += 2) pairs.push(catPlaylists.slice(i, i + 2));
                  return (
                    <View key={cat} style={{ marginTop: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{cat}</Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 12 }} />
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
                        {pairs.map((pair, colIdx) => (
                          <View key={colIdx} style={{ marginRight: 16 }}>
                            {pair.map(pl => (
                              <View key={pl.playlistId} style={{ marginBottom: 14 }}>
                                <HomeYtmCuratedPlaylistCard playlist={pl} />
                              </View>
                            ))}
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  );
                }
                return (
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
                      {catPlaylists.map(pl => (
                        <HomeYtmCuratedPlaylistCard key={pl.playlistId} playlist={pl} />
                      ))}
                    </ScrollView>
                  </View>
                );
              })}
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
                      <Image
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


        {/* YouTube Music — personalised */}
        {ytmTracks.length > 0 ? (
          <View style={{ marginTop: SECTION_GAP }}>
            <SectionHeader title="Vybe Music" />
            <Text className="text-white/50 text-sm px-5 mb-4">
              {ytmQueryLabel ? `More like ${ytmQueryLabel}` : 'Picked for you'}
            </Text>
            <ScrollView
              horizontal
              nestedScrollEnabled
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
                const dim = 140;
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
                      <Image
                        source={{ uri: t.thumbnailUrl }}
                        style={{ width: dim, height: dim }}
                        contentFit="cover"
                      />
                      <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                        <SourceCornerBadge source="youtube_music" compact />
                      </View>
                    </View>
                    <Text className="text-white font-semibold text-sm mt-2" numberOfLines={1} style={{ width: dim }}>
                      {t.title}
                    </Text>
                    <Text style={{ width: dim, color: '#888888', fontSize: 12 }} numberOfLines={1}>
                      {t.channelName}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* From SoundCloud — trending from backend */}
        {scTrendingTracks.length > 0 ? (
          <View style={{ marginTop: SECTION_GAP }}>
            <SectionHeader title="From SoundCloud" />
            <Text className="text-white/50 text-sm px-5 mb-4">
              Independent artists and remixes
            </Text>
            <ScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {scTrendingTracks.map(t => {
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
                    key={track.id}
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
                      <Image
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
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Late Night Mix — from downloads */}
        <View className="mt-8">
          <View className="flex-row items-center px-5 mb-2">
            <Moon size={20} color="#8B5CF6" />
            <Text className="text-white text-xl font-bold ml-2">Late Night</Text>
          </View>
          <Text className="text-white/50 text-sm px-5 mb-4">
            Ambient, downtempo & experimental for the late hours
          </Text>
          {allDownloads.length === 0 ? (
            <View className="mx-5 bg-white/5 rounded-xl p-4 items-center">
              <Text className="text-white/40 text-sm">Save songs to fill this playlist</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
              {[...allDownloads].sort((a, b) => a.importedAt - b.importedAt).map((track) => (
                <Pressable key={track.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, [...allDownloads].sort((a, b) => a.importedAt - b.importedAt)); }} className="mr-4">
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
        </View>

        {/* Focus Flow — from downloads */}
        <View className="mt-8">
          <View className="flex-row items-center px-5 mb-2">
            <Brain size={20} color="#10B981" />
            <Text className="text-white text-xl font-bold ml-2">Focus Flow</Text>
          </View>
          <Text className="text-white/50 text-sm px-5 mb-4">
            Lo-fi, ambient & instrumental for deep concentration
          </Text>
          {allDownloads.length === 0 ? (
            <View className="mx-5 bg-white/5 rounded-xl p-4 items-center">
              <Text className="text-white/40 text-sm">Save songs to fill this playlist</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
              {[...allDownloads].sort((a, b) => b.importedAt - a.importedAt).map((track) => (
                <Pressable key={track.id} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, [...allDownloads].sort((a, b) => b.importedAt - a.importedAt)); }} className="mr-4">
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
        </View>

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
