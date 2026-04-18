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
  FlatList,
} from 'react-native';
import { MasonryFlashList } from '@shopify/flash-list';
import type { MasonryFlashListRef } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect, type Router } from 'expo-router';
import { Play } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import { useDiscoverFeedStore, DiscoverItem, DiscoverSection } from '@/stores/discoverFeedStore';
import { useDownloadsStore, type DownloadedTrack } from '@/stores/downloadsStore';
import { usePlaybackController } from '@/stores/playbackController';
import { useSocialActivityStore } from '@/stores/socialActivityStore';
import type { ActivePostItem } from '@/types/socialActivity';
import { MixDefinition, Track } from '@/types/music';
import { createMMKVCache, TTL } from '@/lib/mmkv-cache';
import { api } from '@/lib/api/api';
import { getDiscover, normalizeYtmThumb, type YtmPlaylistTrack } from '@/lib/api/ytMusic';
import { getTasteSeedTracks } from '@/lib/tasteSeed';
import { useCancelPrefetchOnBlur } from '@/hooks/usePrefetch';
import { curatedPlaylistCoverArt, playlistTitleEmojiEnd } from '@/components/PlaylistCard';
import { SourceCornerBadge } from '@/components/SourceCornerBadge';
import type { SourceCornerBadgeSource } from '@/components/SourceCornerBadge';

const { width: SCREEN_W } = Dimensions.get('window');

const DISCOVER_SCROLL_PADDING_BOTTOM = 180;
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

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<ActivePostItem>);

function postToTrack(post: ActivePostItem): Track {
  const t = post.track;
  const src = t.source ?? (t.youtubeId || t.youtubeMusicId ? 'youtube_music' : t.soundcloudUrl ? 'soundcloud' : 'youtube_music');
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    artistId: '',
    album: '',
    albumId: '',
    artwork: t.artwork ?? '',
    duration: 0,
    isLiked: false,
    source: src,
    youtubeId: t.youtubeId,
    youtubeMusicId: t.youtubeMusicId,
    soundcloudUrl: t.soundcloudUrl,
    audioUrl: '',
  };
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

const RADAR_CARD_W = 220;
const RADAR_CARD_H = 280;
const RADAR_GAP = 14;
const RADAR_SNAP = RADAR_CARD_W + RADAR_GAP;

const styles = StyleSheet.create({
  radarSection: { marginBottom: 8 },
  radarSectionTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: H_PAD,
    marginBottom: 4,
  },
  radarCardOuter: {
    width: RADAR_CARD_W,
    height: RADAR_CARD_H,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#FFFFFF18',
  },
  radarLivePill: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255,0,255,0.25)',
    borderWidth: 1,
    borderColor: '#FF00FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  radarLiveText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  radarBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  radarLiveRing: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#FF00FF',
    shadowColor: '#FF00FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 10,
  },
  radarIdleRing: {
    padding: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  radarAvatarInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarAvatarImg: { width: 44, height: 44 },
  radarAvatarInitial: { color: '#fff', fontSize: 18, fontWeight: '900' },
  radarUser: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700' },
  radarTrackTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginTop: 2, letterSpacing: -0.3 },
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
        textShadowColor: 'rgba(139,92,246,0.45)',
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
    backgroundColor: 'rgba(139,92,246,0.35)',
    borderColor: 'rgba(216,70,239,0.65)',
  },
  chipLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '800' },
  chipLabelSelected: { color: '#fff' },
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
    backgroundColor: 'rgba(124,58,237,0.2)',
  },
  beatsTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  beatsSub: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2, fontWeight: '600' },
});

function RadarCarouselCard({
  item,
  index,
  scrollX,
}: {
  item: ActivePostItem;
  index: number;
  scrollX: SharedValue<number>;
}) {
  const anim = useAnimatedStyle(() => {
    const input = [(index - 1) * RADAR_SNAP, index * RADAR_SNAP, (index + 1) * RADAR_SNAP];
    const scale = interpolate(scrollX.value, input, [0.94, 1.1, 0.94], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  const playTrack = usePlaybackController((s) => s.playTrack);

  const track = postToTrack(item);
  const ringStyle = item.isLiveListening ? styles.radarLiveRing : styles.radarIdleRing;

  return (
    <Animated.View style={[{ width: RADAR_CARD_W, marginRight: RADAR_GAP }, anim]}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          void playTrack(track, [track], { expandNowPlaying: true });
        }}
        style={styles.radarCardOuter}
      >
        <Image source={{ uri: item.track.artwork ?? '' }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFillObject} />
        {item.isLiveListening ? (
          <View style={styles.radarLivePill}>
            <Text style={styles.radarLiveText}>LIVE</Text>
          </View>
        ) : null}
        <View style={styles.radarBottom}>
          <View style={ringStyle}>
            <View style={styles.radarAvatarInner}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.radarAvatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.radarAvatarInitial}>{item.userName.charAt(0).toUpperCase()}</Text>
              )}
            </View>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.radarUser} numberOfLines={1}>
              {item.userName}
            </Text>
            <Text style={styles.radarTrackTitle} numberOfLines={2}>
              {item.track.title}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function VybeWavesRadar() {
  const posts = useSocialActivityStore((s) => s.activePosts).slice(0, 5);
  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  if (posts.length === 0) return null;

  const sidePad = (SCREEN_W - RADAR_CARD_W) / 2;

  return (
    <View style={styles.radarSection}>
      <Text style={styles.radarSectionTitle}>Vybe Waves · Live radar</Text>
      <AnimatedFlatList
        data={posts}
        keyExtractor={(p) => p.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={RADAR_SNAP}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: sidePad, paddingVertical: 8 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item, index }) => <RadarCarouselCard item={item} index={index} scrollX={scrollX} />}
      />
    </View>
  );
}

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
          backgroundColor: '#111',
          borderWidth: 1,
          borderColor: '#FFFFFF15',
        }}
      >
        <Image source={{ uri: item.artwork }} style={{ width: colW, height: item.mediaHeight }} contentFit="cover" />
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
interface CuratedPlaylist {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  artwork?: string;
  tracks: PlaylistTrack[];
  category?: string;
  section?: string;
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

function buildCrateTiles(args: {
  colW: number;
  router: Router;
  playTrack: (track: Track, queue?: Track[], options?: { expandNowPlaying?: boolean }) => Promise<void>;
  ytVideosFeed: PlaylistTrack[];
  ytmTracksFeed: PlaylistTrack[];
  scTracksFeed: SCSearchTrack[];
  ytCuratedPlaylists: CuratedPlaylist[];
  scMixes: MixDefinition[];
  spotifyPlaylists: SpotifyPlaylist[];
  mixArtworkById: Record<string, string>;
  discoverFeedItems: DiscoverItem[];
  downloads: DownloadedTrack[];
}): CrateTile[] {
  const {
    colW,
    router,
    playTrack,
    ytVideosFeed,
    ytmTracksFeed,
    scTracksFeed,
    ytCuratedPlaylists,
    scMixes,
    spotifyPlaylists,
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

  const ytmQueue: Track[] = ytmTracksFeed.map((t) => ({
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
    youtubeMusicId: t.videoId,
    youtubeId: t.videoId,
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void playTrack(track, ytVideoQueue);
      },
    });
  }

  for (const t of ytmTracksFeed) {
    const track = ytmQueue.find((q) => q.id === `ytm-${t.videoId}`)!;
    tiles.push({
      id: `crate-${track.id}`,
      kind: 'square',
      title: t.title,
      artwork: t.thumbnailUrl,
      mediaHeight: squareH,
      layoutHeight: squareH + TITLE_BLOCK,
      vibes: inferVibes(t.title, t.channelName),
      badge: 'youtube_music',
      peekTrack: track,
      peekQueue: ytmQueue,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push('/(app)/track-feed?kind=ytm' as never);
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push('/(app)/track-feed?kind=sc' as never);
      },
    });
  }

  for (const pl of ytCuratedPlaylists) {
    if (pl.tracks.length === 0) continue;
    const queue: Track[] = pl.tracks.map((t) => ({
      id: `ytm-${t.videoId}`,
      title: t.title,
      artist: t.channelName,
      artistId: '',
      album: pl.name,
      albumId: `ytm-pl-${pl.playlistId}`,
      artwork: t.artwork || t.thumbnailUrl,
      duration: 0,
      isLiked: false,
      source: 'youtube_music' as const,
      youtubeMusicId: t.videoId,
      youtubeId: t.videoId,
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
      badge: 'youtube_music',
      peekTrack: queue[0],
      peekQueue: queue,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push(`/(app)/playlist-detail?id=${pl.playlistId}` as never);
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push(`/(app)/vybe-mix?mixId=${mix.id}` as never);
      },
    });
  }

  for (const pl of spotifyPlaylists) {
    const queue: Track[] = pl.tracks.map((t) => ({
      id: `sp-yt-${t.videoId}`,
      title: t.title,
      artist: t.channelName,
      artistId: '',
      album: pl.name,
      albumId: `sp-${pl.playlistId}`,
      artwork: t.artwork || t.thumbnailUrl,
      duration: Math.round((t.durationMs ?? 0) / 1000),
      isLiked: false,
      source: 'youtube_music' as const,
      youtubeId: t.videoId,
      youtubeMusicId: t.videoId,
      audioUrl: '',
    }));
    if (queue.length === 0) continue;
    const cover = pl.artwork || pl.thumbnailUrl || queue[0]?.artwork || '';
    tiles.push({
      id: `crate-sp-${pl.playlistId}`,
      kind: 'square',
      title: pl.name,
      artwork: cover,
      mediaHeight: squareH,
      layoutHeight: squareH + TITLE_BLOCK,
      vibes: inferVibes(pl.name),
      badge: 'stream',
      peekTrack: queue[0],
      peekQueue: queue,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void playTrack(queue[0], queue);
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
  const [ytCuratedPlaylists, setYtCuratedPlaylists] = useState<CuratedPlaylist[]>(() => {
    const hit = discoverMMKV.get<CuratedPlaylist[]>(DISCOVER_KEYS.ytCuratedPlaylists, TTL.CURATED);
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
        ytmTracksFeed,
        scTracksFeed,
        ytCuratedPlaylists,
        scMixes,
        spotifyPlaylists,
        mixArtworkById,
        discoverFeedItems: filteredDiscoverItems,
        downloads,
      }),
    [
      colW,
      router,
      playTrack,
      ytVideosFeed,
      ytmTracksFeed,
      scTracksFeed,
      ytCuratedPlaylists,
      scMixes,
      spotifyPlaylists,
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
      const spotifyPromise = Promise.all(
        SPOTIFY_DISCOVER_IDS.map((id) =>
          api.get<SpotifyPlaylist>(`/api/spotify/playlist/${id}`).catch(() => null),
        ),
      );
      const settled = await Promise.allSettled([
        api.get<CuratedPlaylist[]>('/api/youtube/playlists').catch(() => null),
        api.get<MixDefinition[]>('/api/soundcloud/mixes').catch(() => null),
        spotifyPromise,
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
      ]);

      const yt = settled[0].status === 'fulfilled' ? settled[0].value : null;
      const sc = settled[1].status === 'fulfilled' ? settled[1].value : null;
      const sp = settled[2].status === 'fulfilled' ? settled[2].value : [];
      const ytVideos = settled[3].status === 'fulfilled' ? settled[3].value : null;
      const ytmRaw = settled[4].status === 'fulfilled' ? settled[4].value : [];
      const scTracks = settled[5].status === 'fulfilled' ? settled[5].value : null;

      const ytmTracks = ytmRaw.map((t) => normalizeYtmThumb(t as YtmPlaylistTrack));

      if (yt && yt.length > 0) {
        const filtered = yt.filter((p) => p.tracks.length > 0);
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

      <View style={{ paddingTop: insets.top + 24, paddingHorizontal: H_PAD, paddingBottom: 10 }}>
        <Pressable onLongPress={handleEditPreferences} delayLongPress={550}>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>Discover</Text>
        </Pressable>
        <Text style={{ color: 'rgba(255,255,255,0.5)', marginTop: 6, fontSize: 14, fontWeight: '600' }}>
          Crate digging — fast scan, slow listens
        </Text>
      </View>

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
              void Haptics.selectionAsync();
              setVibeChip(chip.id);
            }}
            style={[styles.chip, vibeChip === chip.id && styles.chipSelected]}
          >
            <Text style={[styles.chipLabel, vibeChip === chip.id && styles.chipLabelSelected]}>{chip.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoadingFeed && sections.length === 0 ? (
        <Animated.View entering={FadeIn} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
          <ActivityIndicator size="large" color="#8B5CF6" />
          <Text style={{ color: 'rgba(255,255,255,0.55)', marginTop: 16, fontWeight: '600' }}>Building your VYBE…</Text>
        </Animated.View>
      ) : null}

      <MasonryFlashList
        ref={masonryRef as React.RefObject<MasonryFlashListRef<CrateTile>>}
        data={masonryData}
        numColumns={2}
        keyExtractor={(it) => it.id}
        estimatedItemSize={240}
        optimizeItemArrangement
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: H_PAD, paddingBottom: DISCOVER_SCROLL_PADDING_BOTTOM }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#8B5CF6"
            colors={['#8B5CF6']}
          />
        }
        ListHeaderComponent={
          <>
            <VybeWavesRadar />
            {preferences?.onboardingComplete ? (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/(app)/vybe-beats');
                }}
                style={styles.beatsRow}
              >
                <LinearGradient colors={['#3d1f73', '#1a0a2e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.beatsInner}>
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
  );
}
