import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Dimensions,
  StyleSheet,
  Platform,
} from 'react-native';
import { MasonryFlashList } from '@shopify/flash-list';
import type { MasonryFlashListRef } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect, type Router } from 'expo-router';
import { Play } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useDiscoverFeedStore, DiscoverItem, DiscoverSection } from '@/stores/discoverFeedStore';
import { useDownloadsStore, type DownloadedTrack } from '@/stores/downloadsStore';
import { usePlaybackController } from '@/stores/playbackController';
import { MixDefinition, Track } from '@/types/music';
import { createMMKVCache, TTL } from '@/lib/mmkv-cache';
import { api } from '@/lib/api/api';
import { getDiscover, normalizeYtmThumb, type YtmPlaylistTrack } from '@/lib/api/ytMusic';
import { getTasteSeedTracks } from '@/lib/tasteSeed';
import { useCancelPrefetchOnBlur } from '@/hooks/usePrefetch';
import { curatedPlaylistCoverArt, playlistTitleEmojiEnd } from '@/components/PlaylistCard';
import { SourceCornerBadge } from '@/components/SourceCornerBadge';
import type { SourceCornerBadgeSource } from '@/components/SourceCornerBadge';
import { CRATE_TILE_TINT_GRADIENT, VIBRANT_BLUE } from '@/constants/machinedTheme';
import { MachinedGradientText } from '@/components/MachinedGradientText';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { tabScreenContentContainerPaddingBottom } from '@/constants/Layout';
import { DiscoveryRailSection } from '@/components/Discovery/Section';
import { logUiTap } from '@/lib/uiTapLog';
import { raceWithDiscoverTimeout, isDiscoverBackendFailure } from '@/lib/discoverRace';

const { width: SCREEN_W } = Dimensions.get('window');

const H_PAD = 20;
const GUTTER = 10;
const TITLE_BLOCK = 44;
const PEEK_MS = 5000;

const VIBE_CHIPS: { id: string; label: string; keywords: string[] }[] = [
  { id: 'all', label: 'All', keywords: [] },
  { id: 'chill', label: 'Chill', keywords: ['chill', 'ambient', 'lofi', 'lo-fi', 'downtempo', 'calm', 'slow'] },
  { id: 'phonk', label: 'Phonk', keywords: ['phonk', 'drift', 'memphis', 'cowbell'] },
  { id: 'gym', label: 'Gym', keywords: ['gym', 'workout', 'lift', 'trap', 'bass', 'power', 'energy'] },
  { id: 'late', label: 'Late Night', keywords: ['night', 'late', 'midnight', 'nocturnal', 'after dark'] },
  { id: 'focus', label: 'Focus', keywords: ['focus', 'study', 'concentration', 'instrumental', 'deep work'] },
];

function inferVibes(...parts: (string | undefined | null)[]): string[] {
  const blob = parts.filter(Boolean).join(' ').toLowerCase();
  const out: string[] = [];
  for (const v of VIBE_CHIPS) {
    if (v.id === 'all') continue;
    if (v.keywords.some((k) => blob.includes(k))) out.push(v.id);
  }
  return out.length ? out : ['chill'];
}

function discoverItemToTrack(item: DiscoverItem): Track {
  const isYt = item.sourcePlatform === 'YOUTUBE';
  const bareId = item.id.replace(/^yt-|^sc-/, '');
  return {
    id: item.id,
    title: item.title,
    artist: item.creatorName,
    artistId: '',
    album: '',
    albumId: '',
    isLiked: false,
    artwork: item.thumbnailUrl,
    duration: 0,
    source: isYt ? 'youtube' : 'soundcloud',
    audioUrl: isYt ? '' : item.externalUrl,
    youtubeId: isYt ? bareId : undefined,
    soundcloudUrl: isYt ? undefined : item.externalUrl,
  };
}

type CrateTileKind = 'video' | 'square';

type CrateTile = {
  id: string;
  kind: CrateTileKind;
  title: string;
  artwork: string;
  layoutHeight: number;
  mediaHeight: number;
  vibes: string[];
  badge: SourceCornerBadgeSource;
  peekTrack: Track | null;
  peekQueue: Track[];
  onPress: () => void;
};

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

type PreviewSession = { id: number; timer: ReturnType<typeof setTimeout> };
let previewGen = 0;

function beginDiscoverPreview(track: Track, queue: Track[]): PreviewSession {
  previewGen += 1;
  const id = previewGen;
  const q = queue.length ? queue : [track];
  void usePlaybackController.getState().playTrack(track, q, { expandNowPlaying: false });
  const timer = setTimeout(() => {
    if (id === previewGen) {
      void usePlaybackController.getState().pause();
    }
  }, PEEK_MS);
  return { id, timer };
}

function endDiscoverPreview(session: PreviewSession | null) {
  if (!session) return;
  clearTimeout(session.timer);
  if (session.id === previewGen) {
    previewGen += 1;
    void usePlaybackController.getState().pause();
  }
}

const styles = StyleSheet.create({
  peekHint: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    alignItems: 'center',
  },
  peekHintText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  crateTitle: {
    marginTop: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.35,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,229,255,0.45)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
      },
      android: {},
    }),
  },
  chipScroll: { flexGrow: 0, marginBottom: 10 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  chipSelected: {
    backgroundColor: 'rgba(0,229,255,0.14)',
    borderColor: 'rgba(0,229,255,0.55)',
    ...Platform.select({
      ios: {
        shadowColor: VIBRANT_BLUE,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
      },
      android: { elevation: 5 },
      default: {},
    }),
  },
  chipLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '800' },
  chipLabelSelected: { color: VIBRANT_BLUE, fontWeight: '900' },
  beatsRow: {
    marginHorizontal: H_PAD,
    marginBottom: 14,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FFFFFF12',
  },
  beatsInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,229,255,0.08)',
  },
  beatsTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  beatsSub: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2, fontWeight: '600' },
});

function CrateMasonryCell({
  item,
  colW,
}: {
  item: CrateTile;
  colW: number;
}) {
  const sessionRef = useRef<PreviewSession | null>(null);
  const didLongPressRef = useRef(false);

  const onLongPress = () => {
    if (!item.peekTrack) return;
    didLongPressRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sessionRef.current = beginDiscoverPreview(item.peekTrack, item.peekQueue);
  };

  const onPressOut = () => {
    endDiscoverPreview(sessionRef.current);
    sessionRef.current = null;
    setTimeout(() => {
      didLongPressRef.current = false;
    }, 40);
  };

  const onPress = () => {
    if (didLongPressRef.current) return;
    item.onPress();
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={item.peekTrack ? onLongPress : undefined}
      onPressOut={item.peekTrack ? onPressOut : undefined}
      delayLongPress={320}
      style={{ width: colW, marginBottom: GUTTER }}
    >
      <View
        style={{
          width: colW,
          height: item.mediaHeight,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: '#050a12',
          borderWidth: 1,
          borderColor: 'rgba(0,229,255,0.2)',
        }}
      >
        <Image source={{ uri: item.artwork }} style={{ width: colW, height: item.mediaHeight }} contentFit="cover" />
        <LinearGradient
          colors={[...CRATE_TILE_TINT_GRADIENT]}
          locations={[0, 0.45, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} locations={[0.35, 1]} style={StyleSheet.absoluteFillObject} pointerEvents="none" />
        <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
          <SourceCornerBadge source={item.badge} />
        </View>
        {item.peekTrack ? (
          <View style={styles.peekHint} pointerEvents="none">
            <Text style={styles.peekHintText}>Hold to peek</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.crateTitle} numberOfLines={2}>
        {playlistTitleEmojiEnd(item.title)}
      </Text>
    </Pressable>
  );
}

function DiscoverVaultCollectionsRow({
  playlists,
  router,
}: {
  playlists: SoundcloudCuratedPlaylist[];
  router: Router;
}) {
  const ready = playlists.filter((p) => p.tracks.length > 0);
  if (ready.length === 0) return null;
  const pick = (re: RegExp) =>
    ready.find((p) => re.test(`${p.name} ${p.category ?? ''} ${(p as { section?: string }).section ?? ''}`));
  const midnight =
    pick(/industrial|factory|warehouse|dark|techno|minimal|focus|study|deep work|concentration/i) ?? ready[0];
  const hi =
    pick(/workout|gym|energy|power|lift|hypertrophy|phonk|drill|hardstyle|metallic/i) ??
    ready[Math.min(1, ready.length - 1)];
  const ambient =
    pick(/lo-?fi|lofi|chill|relax|downtempo|ambient|calm|soft/i) ?? ready[Math.min(2, ready.length - 1)];

  const gap = 10;
  const cardW = (SCREEN_W - H_PAD * 2 - gap * 2) / 3;

  const rows: { key: string; title: string; sub: string; pl: SoundcloudCuratedPlaylist }[] = [
    { key: 'midnight', title: 'Midnight Studio', sub: 'Industrial / focus', pl: midnight },
    { key: 'hi', title: 'High-Performance', sub: 'High-energy / gym', pl: hi },
    { key: 'ambient', title: 'Ambient Heat', sub: 'Lo-fi / relax', pl: ambient },
  ];

  return (
    <View style={{ marginBottom: 14 }}>
      <MachinedGradientText
        neonGlow
        style={{
          fontSize: 12,
          fontWeight: '900',
          letterSpacing: 1.1,
          paddingHorizontal: H_PAD,
          marginBottom: 8,
          textTransform: 'uppercase',
        }}
      >
        Discover collections
      </MachinedGradientText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: H_PAD }}
        style={{ flexGrow: 0 }}
      >
        {rows.map(({ key, title, sub, pl }) => {
          const art = curatedPlaylistCoverArt(pl);
          const artH = Math.round(cardW * 1.08);
          return (
            <Pressable
              key={key}
              onPress={() => {
                logUiTap('Discover collections', 'open_collection');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push(
                  `/(app)/playlist-detail?scSet=${encodeURIComponent(pl.soundcloudSetUrl)}` as never,
                );
              }}
              style={{
                width: cardW,
                marginRight: gap,
                borderRadius: 16,
                overflow: 'hidden',
                backgroundColor: '#050a12',
                borderWidth: 1,
                borderColor: 'rgba(0,229,255,0.55)',
              }}
            >
              <View style={{ width: cardW, height: artH }}>
                <ShadowArtworkImage
                  source={{ uri: art }}
                  style={{ width: cardW, height: artH }}
                  contentFit="cover"
                />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.92)']}
                  locations={[0.25, 1]}
                  style={StyleSheet.absoluteFillObject}
                  pointerEvents="none"
                />
                <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                  <SourceCornerBadge source="soundcloud" />
                </View>
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    paddingHorizontal: 10,
                    paddingBottom: 10,
                    paddingTop: 28,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: -0.2 }} numberOfLines={2}>
                    {title}
                  </Text>
                  <Text
                    style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '600', marginTop: 4 }}
                    numberOfLines={2}
                  >
                    {sub}
                  </Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function DiscoverVaultExclusivesRail({
  scTracks,
  playTrack,
}: {
  scTracks: SCSearchTrack[];
  playTrack: (track: Track, queue?: Track[], options?: { expandNowPlaying?: boolean }) => Promise<void>;
}) {
  const slice = scTracks.slice(0, 16);
  if (slice.length === 0) return null;

  const queue: Track[] = slice.map((t) => ({
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
    soundcloudId: t.trackId,
    audioUrl: '',
  }));

  const dim = 132;

  return (
    <View style={{ marginBottom: 16 }}>
      <MachinedGradientText
        neonGlow
        style={{
          fontSize: 12,
          fontWeight: '900',
          letterSpacing: 1.1,
          paddingHorizontal: H_PAD,
          marginBottom: 6,
          textTransform: 'uppercase',
        }}
      >
        SoundCloud vault
      </MachinedGradientText>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600', paddingHorizontal: H_PAD, marginBottom: 10 }}>
        High-speed streams — SoundCloud-first picks
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: H_PAD }}
        style={{ flexGrow: 0 }}
      >
        {slice.map((t) => {
          const self = queue.find((q) => q.id === `sc-${t.trackId}`)!;
          return (
            <Pressable
              key={t.trackId}
              onPress={() => {
                logUiTap('SoundCloud vault', 'playTrack');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                void playTrack(self, queue);
              }}
              style={{ marginRight: 12 }}
            >
              <View
                style={{
                  width: dim,
                  height: dim,
                  borderRadius: 14,
                  overflow: 'hidden',
                  backgroundColor: '#0A0A0A',
                  borderWidth: 1,
                  borderColor: 'rgba(0,229,255,0.5)',
                }}
              >
                <ShadowArtworkImage source={{ uri: t.artwork }} style={{ width: dim, height: dim }} contentFit="cover" />
                <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                  <SourceCornerBadge source="soundcloud" />
                </View>
              </View>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 8, width: dim }} numberOfLines={1}>
                {t.title}
              </Text>
              <Text style={{ color: '#888', fontSize: 11, width: dim }} numberOfLines={1}>
                {t.artist}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// Curated playlist types — match home screen backend response shapes
interface PlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  channelId?: string;
  thumbnailUrl: string;
  artwork?: string;
  publishedAt: string;
}
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
// MMKV last-known-good cache for the discover tab. Additive: the zustand
// store (persisted to AsyncStorage) is still the source of truth for the
// session. On cold app start, if the zustand hydration hasn't populated yet,
// we seed the zustand store synchronously from MMKV so the feed paints on
// first frame instead of waiting for network + AsyncStorage hydration.
const discoverMMKV = createMMKVCache('vybe-discover');
const DISCOVER_KEYS = {
  sections: 'sections',
  vybeBeats: 'vybeBeats',
  scCuratedPlaylists: 'scCuratedPlaylists',
  scMixes: 'scMixes',
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

function buildCrateTiles(args: {
  colW: number;
  router: Router;
  playTrack: (track: Track, queue?: Track[], options?: { expandNowPlaying?: boolean }) => Promise<void>;
  ytVideosFeed: PlaylistTrack[];
  scTracksFeed: SCSearchTrack[];
  scCuratedPlaylists: SoundcloudCuratedPlaylist[];
  scMixes: MixDefinition[];
  mixArtworkById: Record<string, string>;
  discoverFeedItems: DiscoverItem[];
  downloads: DownloadedTrack[];
}): CrateTile[] {
  const {
    colW,
    router,
    playTrack,
    ytVideosFeed,
    scTracksFeed,
    scCuratedPlaylists,
    scMixes,
    mixArtworkById,
    discoverFeedItems,
    downloads,
  } = args;

  const videoH = Math.round((colW * 9) / 16);
  const squareH = colW;

  const ytVideoQueue: Track[] = ytVideosFeed.map((x) => ({
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

  const scQueue: Track[] = scTracksFeed.map((x) => ({
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

  const discoverTracks: Track[] = discoverFeedItems.map(discoverItemToTrack);

  const tiles: CrateTile[] = [];

  for (const t of ytVideosFeed) {
    const track = ytVideoQueue.find((q) => q.id === `yt-${t.videoId}`)!;
    tiles.push({
      id: `crate-${track.id}`,
      kind: 'video',
      title: t.title,
      artwork: t.thumbnailUrl,
      mediaHeight: videoH,
      layoutHeight: videoH + TITLE_BLOCK,
      vibes: inferVibes(t.title, t.channelName),
      badge: 'youtube',
      peekTrack: track,
      peekQueue: ytVideoQueue,
      onPress: () => {
        logUiTap('Discover crates', 'play_youtube_track');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void playTrack(track, ytVideoQueue);
      },
    });
  }

  for (const t of scTracksFeed) {
    const track = scQueue.find((q) => q.id === `sc-${t.trackId}`)!;
    tiles.push({
      id: `crate-${track.id}`,
      kind: 'square',
      title: t.title,
      artwork: t.artwork,
      mediaHeight: squareH,
      layoutHeight: squareH + TITLE_BLOCK,
      vibes: inferVibes(t.title, t.artist),
      badge: 'soundcloud',
      peekTrack: track,
      peekQueue: scQueue,
      onPress: () => {
        logUiTap('Discover crates', 'navigate_sc_feed');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push('/(app)/track-feed?kind=sc' as never);
      },
    });
  }

  for (const pl of scCuratedPlaylists) {
    if (pl.tracks.length === 0) continue;
    if ((pl as { section?: string }).section === 'popular') continue;
    const queue: Track[] = pl.tracks.map((t) => ({
      id: `sc-${t.videoId}`,
      title: t.title,
      artist: t.channelName,
      artistId: '',
      album: pl.name,
      albumId: `sc-pl-${pl.playlistId}`,
      artwork: t.thumbnailUrl,
      duration: 0,
      isLiked: false,
      source: 'soundcloud' as const,
      soundcloudUrl: t.soundcloudUrl,
      soundcloudId: t.videoId,
      audioUrl: '',
    }));
    const art = curatedPlaylistCoverArt(pl);
    tiles.push({
      id: `crate-pl-${pl.playlistId}`,
      kind: 'square',
      title: pl.name,
      artwork: art,
      mediaHeight: squareH,
      layoutHeight: squareH + TITLE_BLOCK,
      vibes: inferVibes(pl.name, pl.category, pl.section),
      badge: 'soundcloud',
      peekTrack: queue[0],
      peekQueue: queue,
      onPress: () => {
        logUiTap('Discover crates', 'open_sc_playlist');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push(
          `/(app)/playlist-detail?scSet=${encodeURIComponent(pl.soundcloudSetUrl)}` as never,
        );
      },
    });
  }

  for (const mix of scMixes) {
    const art = mixArtworkById[mix.id] || mix.coverImage;
    const tagBlob = mix.tags?.length ? mix.tags.join(' ') : '';
    tiles.push({
      id: `crate-mix-${mix.id}`,
      kind: 'square',
      title: mix.name,
      artwork: art,
      mediaHeight: squareH,
      layoutHeight: squareH + TITLE_BLOCK,
      vibes: inferVibes(mix.name, mix.description, tagBlob),
      badge: 'soundcloud',
      peekTrack: null,
      peekQueue: [],
      onPress: () => {
        logUiTap('Discover crates', 'open_vybe_mix');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push(`/(app)/vybe-mix?mixId=${mix.id}` as never);
      },
    });
  }

  for (const item of discoverFeedItems) {
    const track = discoverItemToTrack(item);
    tiles.push({
      id: `crate-d-${item.id}`,
      kind: 'square',
      title: item.title,
      artwork: item.thumbnailUrl,
      mediaHeight: squareH,
      layoutHeight: squareH + TITLE_BLOCK,
      vibes: inferVibes(item.title, item.creatorName, item.searchQuery ?? ''),
      badge: item.sourcePlatform === 'YOUTUBE' ? 'youtube' : 'soundcloud',
      peekTrack: track,
      peekQueue: discoverTracks,
      onPress: () => {
        logUiTap('Discover crates', 'play_feed_item');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void playTrack(track, discoverTracks);
      },
    });
  }

  for (const d of downloads) {
    tiles.push({
      id: `crate-dl-${d.id}`,
      kind: 'square',
      title: d.title,
      artwork: d.artwork ?? '',
      mediaHeight: squareH,
      layoutHeight: squareH + TITLE_BLOCK,
      vibes: inferVibes(d.title, d.artist),
      badge: 'vybe',
      peekTrack: d,
      peekQueue: downloads,
      onPress: () => {
        logUiTap('Discover crates', 'play_download');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void playTrack(d, downloads);
      },
    });
  }

  return shuffleInPlace(tiles);
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
  useCancelPrefetchOnBlur();
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
  const [scCuratedPlaylists, setScCuratedPlaylists] = useState<SoundcloudCuratedPlaylist[]>(() => {
    const hit = discoverMMKV.get<SoundcloudCuratedPlaylist[]>(DISCOVER_KEYS.scCuratedPlaylists, TTL.CURATED);
    return hit?.value ?? [];
  });
  const [scMixes, setScMixes] = useState<MixDefinition[]>(() => {
    const hit = discoverMMKV.get<MixDefinition[]>(DISCOVER_KEYS.scMixes, TTL.CURATED);
    return hit?.value ?? [];
  });
  // Per-mix artwork sourced from the user's downloaded library — each mix
  // gets a different track's album art so cards feel personal instead of
  // showing the same stock unsplash photos.
  const mixArtworkById = useMemo<Record<string, string>>(() => {
    const arts = downloads.map((d) => d.artwork).filter((a): a is string => !!a);
    if (arts.length === 0) return {};
    const map: Record<string, string> = {};
    scMixes.forEach((mix, i) => { map[mix.id] = arts[i % arts.length]; });
    return map;
  }, [downloads, scMixes]);
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

  const masonryRef = useRef<MasonryFlashListRef<CrateTile>>(null);
  const [vibeChip, setVibeChip] = useState('all');
  const colW = (SCREEN_W - H_PAD * 2 - GUTTER) / 2;

  const filteredDiscoverItems = useMemo(() => {
    const raw =
      sections.flatMap((s) => s.items).length > 0
        ? sections.flatMap((s) => s.items)
        : vybeBeats;
    return raw.filter((item) => {
      const idOk = /^yt-[\w-]+$|^sc-\d+$/.test(item.id);
      const creatorOk = !/tap to search/i.test(item.creatorName ?? '');
      const hasUrl = !!item.externalUrl && /^https?:\/\//.test(item.externalUrl);
      return idOk && creatorOk && hasUrl;
    });
  }, [sections, vybeBeats]);

  const allCrateTiles = useMemo(
    () =>
      buildCrateTiles({
        colW,
        router,
        playTrack,
        ytVideosFeed,
        scTracksFeed,
        scCuratedPlaylists,
        scMixes,
        mixArtworkById,
        discoverFeedItems: filteredDiscoverItems,
        downloads,
      }),
    [
      colW,
      router,
      playTrack,
      ytVideosFeed,
      scTracksFeed,
      scCuratedPlaylists,
      scMixes,
      mixArtworkById,
      filteredDiscoverItems,
      downloads,
    ],
  );

  const masonryData = useMemo(() => {
    if (vibeChip === 'all') return allCrateTiles;
    return allCrateTiles.filter((t) => t.vibes.includes(vibeChip));
  }, [allCrateTiles, vibeChip]);

  useEffect(() => {
    masonryRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [vibeChip]);

  // Fetch curated playlists + trending feeds from backend (cached, so hits are <100ms)
  useEffect(() => {
    (async () => {
      let settled: readonly [
        PromiseSettledResult<SoundcloudCuratedPlaylist[] | null>,
        PromiseSettledResult<MixDefinition[] | null>,
        PromiseSettledResult<PlaylistTrack[] | null>,
        PromiseSettledResult<YtmPlaylistTrack[]>,
        PromiseSettledResult<SCSearchTrack[] | null>,
      ];
      try {
        settled = (await raceWithDiscoverTimeout(
          Promise.allSettled([
            api.get<SoundcloudCuratedPlaylist[]>('/api/soundcloud/playlists').catch(() => null),
            api.get<MixDefinition[]>('/api/soundcloud/mixes').catch(() => null),
            api
              .get<PlaylistTrack[]>(
                `/api/youtube/search?q=${encodeURIComponent('popular music videos')}&maxResults=15`,
              )
              .catch(() => null),
            getDiscover(50, getTasteSeedTracks()),
            api
              .get<SCSearchTrack[]>(
                `/api/soundcloud/search?q=${encodeURIComponent('hidden gems')}&maxResults=15`,
              )
              .catch(() => null),
          ]),
        )) as readonly [
          PromiseSettledResult<SoundcloudCuratedPlaylist[] | null>,
          PromiseSettledResult<MixDefinition[] | null>,
          PromiseSettledResult<PlaylistTrack[] | null>,
          PromiseSettledResult<YtmPlaylistTrack[]>,
          PromiseSettledResult<SCSearchTrack[] | null>,
        ];
      } catch (e) {
        if (isDiscoverBackendFailure(e)) {
          console.warn('[Discover] Vault feeds timeout / server error — keeping MMKV / last state');
        }
        return;
      }

      const scPl = settled[0].status === 'fulfilled' ? settled[0].value : null;
      const sc = settled[1].status === 'fulfilled' ? settled[1].value : null;
      const ytVideos = settled[2].status === 'fulfilled' ? settled[2].value : null;
      const ytmRaw = settled[3].status === 'fulfilled' ? settled[3].value : [];
      const scTracks = settled[4].status === 'fulfilled' ? settled[4].value : null;

      const ytmTracks = ytmRaw.map((t) => normalizeYtmThumb(t as YtmPlaylistTrack));

      if (scPl && scPl.length > 0) {
        const filtered = scPl.filter((p) => p.tracks.length > 0);
        setScCuratedPlaylists(filtered);
        discoverMMKV.set(DISCOVER_KEYS.scCuratedPlaylists, filtered);
      }
      if (sc && sc.length > 0) {
        setScMixes(sc);
        discoverMMKV.set(DISCOVER_KEYS.scMixes, sc);
      }
      if (ytVideos && ytVideos.length > 0) {
        setYtVideosFeed(ytVideos);
        discoverMMKV.set(DISCOVER_KEYS.ytVideosFeed, ytVideos);
      }
      if (ytmTracks.length > 0) {
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
    // Skip only if we already have real tracks in Vybe Beats. `sections` may
    // be populated with "tap to search" placeholders — if so, still run the
    // fallback YT/SC search to get real tracks.
    if (vybeBeats.length > 0) return;

    // Build seed queries from the onboarding answers.
    // Artists are the strongest signal, then genre+mood combos, then bare genres.
    const artists = (preferences.favoriteArtists ?? []).filter((a) => a && a.length > 0);
    const genres = (preferences.genres ?? []).filter((g) => g && g.length > 0);
    const moods = (preferences.moods ?? []).filter((m) => m && m.length > 0);

    const seeds: string[] = [];
    artists.forEach((a) => seeds.push(a));
    genres.forEach((g, i) => {
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
        const ytPromises = seeds.map(async (q) => {
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

        const scPromises = seeds.map(async (q) => {
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
        setVybeBeats(unique);
      } catch (err) {
        console.warn('[Discover] Local beats fallback failed:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [preferences?.onboardingComplete, preferences?.genres, preferences?.moods, preferences?.favoriteArtists, sections.length, vybeBeats.length]);

  // Check if onboarding is needed and fetch data — re-runs every time the tab gains focus
  // so the card appears immediately after the user completes "Update Preferences"
  useFocusEffect(
    // Hermes-minified expo-router invokes our cleanup as `_b.call()`; if we
    // return nothing implicitly the call site explodes with
    // "TypeError: _b.call is not a function". Always return a function.
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

        refreshFeed();
      };
      init();
      return () => {};
    }, [refreshFeed, fetchPreferences, completeOnboardingWithInstantFeed, router])
  );

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refreshFeed();
    setIsRefreshing(false);
  }, [refreshFeed]);

  // Discover onboarding is disabled — long-press on the header is a no-op.
  const handleEditPreferences = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View className="flex-1 bg-[#000000]">
      {/* Background gradient */}
      <LinearGradient
        colors={['#0a1628', '#050c14', '#0A0A0A']}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: insets.top + 120,
        }}
      />

      <View style={{ paddingTop: insets.top + 64, paddingHorizontal: H_PAD, paddingBottom: 10 }}>
        <Pressable onLongPress={handleEditPreferences} delayLongPress={550}>
          <MachinedGradientText neonGlow style={{ fontSize: 24, fontWeight: '800', letterSpacing: 0.35 }}>
            Discover
          </MachinedGradientText>
        </Pressable>
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 6, fontSize: 14, fontWeight: '600' }}>
          Crate digging — fast scan, slow listens
        </Text>
      </View>

      <DiscoveryRailSection sectionTitle="Vibe chips" actionType="horizontal_rail">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: H_PAD, paddingBottom: 6 }}
        style={styles.chipScroll}
      >
        {VIBE_CHIPS.map((chip) => (
            <Pressable
              key={chip.id}
              onPress={() => {
                logUiTap(`Vibe: ${chip.label}`, 'vibe_chip');
                void Haptics.selectionAsync();
                setVibeChip(chip.id);
              }}
            style={[styles.chip, vibeChip === chip.id && styles.chipSelected]}
          >
            <Text style={[styles.chipLabel, vibeChip === chip.id && styles.chipLabelSelected]}>{chip.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      </DiscoveryRailSection>

      {isLoadingFeed && sections.length === 0 ? (
        <Animated.View entering={FadeIn} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
          <ActivityIndicator size="large" color={VIBRANT_BLUE} />
          <Text style={{ color: 'rgba(255,255,255,0.55)', marginTop: 16, fontWeight: '600' }}>Building your VYBE…</Text>
        </Animated.View>
      ) : null}

      {/* FlashList doesn't accept `style` (only `contentContainerStyle`).
          Wrap in a flex:1 View so the list fills remaining vertical space
          inside the Discover screen container. */}
      <View style={{ flex: 1 }}>
      <MasonryFlashList
        ref={masonryRef as React.RefObject<MasonryFlashListRef<CrateTile>>}
        data={masonryData}
        numColumns={2}
        keyExtractor={(it) => it.id}
        estimatedItemSize={80}
        optimizeItemArrangement
        contentContainerStyle={{
          paddingHorizontal: H_PAD,
          paddingBottom: tabScreenContentContainerPaddingBottom(insets.bottom),
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={VIBRANT_BLUE}
            colors={[VIBRANT_BLUE]}
          />
        }
        ListHeaderComponent={
          <>
            <DiscoveryRailSection sectionTitle="Discover collections" actionType="horizontal_rail">
              <DiscoverVaultCollectionsRow playlists={scCuratedPlaylists} router={router} />
            </DiscoveryRailSection>
            <DiscoveryRailSection sectionTitle="SoundCloud vault" actionType="horizontal_rail">
              <DiscoverVaultExclusivesRail scTracks={scTracksFeed} playTrack={playTrack} />
            </DiscoveryRailSection>
            {preferences?.onboardingComplete ? (
              <Pressable
                onPress={() => {
                  logUiTap('Vybe Beats', 'navigate_vybe_beats');
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/(app)/vybe-beats');
                }}
                style={styles.beatsRow}
              >
                <LinearGradient colors={['#06202c', '#051018']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.beatsInner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.beatsTitle}>Vybe Beats</Text>
                    <Text style={styles.beatsSub}>Your taste — full crate</Text>
                  </View>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={20} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 2 }} />
                  </View>
                </LinearGradient>
              </Pressable>
            ) : null}
          </>
        }
        overrideItemLayout={(layout, item) => {
          layout.size = item.layoutHeight;
        }}
        renderItem={({ item }) => <CrateMasonryCell item={item} colW={colW} />}
      />
      </View>
    </View>
  );
}
