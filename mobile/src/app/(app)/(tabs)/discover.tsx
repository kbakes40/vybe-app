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
import { Play, Radio } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
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
import { CRATE_TILE_TINT_GRADIENT, DOCK_CYAN, VIBRANT_BLUE } from '@/constants/machinedTheme';
import {
  getTopStations,
  readTopStationsCache,
  type RadioStation,
} from '@/lib/radioBrowserService';
import { MachinedGradientText } from '@/components/MachinedGradientText';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { DiscoverSourceRail } from '@/components/discover/DiscoverSourceRail';
import { tabScreenContentContainerPaddingBottom } from '@/constants/Layout';
import { useLouisOledChrome } from '@/hooks/useLouisOledChrome';
import { DiscoveryRailSection } from '@/components/Discovery/Section';
import { vibeChipGlyph } from '@/components/Discovery/DiscoverTechnicalGlyphs';
import { logUiTap } from '@/lib/uiTapLog';
import {
  raceWithDiscoverTimeout,
  raceWithScDiscoverTimeout,
  isDiscoverBackendFailure,
} from '@/lib/discoverRace';

const { width: SCREEN_W } = Dimensions.get('window');

const H_PAD = 20;
const GUTTER = 10;
const TITLE_BLOCK = 44;
/** Extra vertical space for centered SC title + artist + like line under artwork */
const SC_META_EXTRA = 46;
const PEEK_MS = 5000;

const CYAN_ENGINE = '#00E5FF';

const VIBE_CHIPS: { id: string; label: string; keywords: string[] }[] = [
  { id: 'all', label: 'All', keywords: [] },
  { id: 'chill', label: 'Chill', keywords: ['chill', 'ambient', 'lofi', 'lo-fi', 'downtempo', 'calm', 'slow'] },
  { id: 'fast', label: 'Fast', keywords: ['fast', 'uptempo', 'dnb', 'drum and bass', 'speed', 'tempo', 'rave'] },
  { id: 'phonk', label: 'Phonk', keywords: ['phonk', 'drift', 'memphis', 'cowbell'] },
  { id: 'gym', label: 'Gym', keywords: ['gym', 'workout', 'lift', 'trap', 'bass', 'power', 'energy'] },
  { id: 'late', label: 'Late Night', keywords: ['night', 'late', 'midnight', 'nocturnal', 'after dark'] },
  { id: 'focus', label: 'Focus', keywords: ['focus', 'study', 'concentration', 'instrumental', 'deep work'] },
];

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function inferVibes(...parts: (string | undefined | null)[]): string[] {
  const blob = parts.filter(Boolean).join(' ').toLowerCase();
  const out: string[] = [];
  for (const v of VIBE_CHIPS) {
    if (v.id === 'all') continue;
    if (v.keywords.some((k) => blob.includes(k))) out.push(v.id);
  }
  return out.length ? out : ['chill'];
}

function stationToTrack(station: RadioStation): Track {
  return {
    id: `radio-browser:${station.id}`,
    title: station.name,
    artist: station.country ? `LIVE · ${station.country}` : 'LIVE',
    artistId: '',
    album: 'LIVE RADIO',
    albumId: `radio-browser:${station.id}`,
    isLiked: false,
    artwork: station.faviconUrl ?? '',
    duration: 0,
    source: 'global_radio',
    audioUrl: station.streamUrl,
    globalRadioStationId: `rb:${station.id}`,
    globalRadioMetadataSource: 'static',
    globalRadioDiTag: station.name.toUpperCase(),
    globalRadioDiLeading: 'default',
    globalRadioFirePulse: 'normal',
    globalRadioIslandAlbum: `RADIO: ${station.name.toUpperCase()}`,
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

type CrateTileKind = 'video' | 'square' | 'station';

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
  /** SoundCloud — centered artwork + metadata under image */
  artist?: string;
  likeCount?: number;
  scLayout?: boolean;
  /** Radio-Browser live station — when present, cell renders the StationCard variant. */
  station?: RadioStation;
};

/** Matches backend — /api/soundcloud/discover-feed */
export type ScDiscoverTrackRow = {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
  likeCount: number;
};

export type ScDiscoverFeedPayload = {
  collections: Array<{ slot: 'trending' | 'explore' | 'spotlight'; track: ScDiscoverTrackRow }>;
  crateTracks: ScDiscoverTrackRow[];
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

class DiscoverListErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[DISCOVER_FEED_ERROR_BOUNDARY]', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
          <ActivityIndicator size="small" color={CYAN_ENGINE} />
          <Text style={{ color: 'rgba(255,255,255,0.7)', marginTop: 10, fontWeight: '700' }}>
            Discover is recovering...
          </Text>
        </View>
      );
    }
    return this.props.children;
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
  crateTitleCenter: {
    marginTop: 10,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.15,
  },
  crateArtistCenter: {
    marginTop: 4,
    textAlign: 'center',
    alignSelf: 'center',
    width: '100%',
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  crateLikesLine: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
  },
  chipScroll: { flexGrow: 0, marginBottom: 12 },
  /** Inactive: borderless, 0.4 opacity. Active: 1px cyan only. */
  chip: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: 76,
    marginRight: 10,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 0,
    opacity: 0.4,
  },
  chipSelected: {
    opacity: 1,
    borderWidth: 1,
    borderColor: CYAN_ENGINE,
    backgroundColor: 'transparent',
  },
  chipIconSlot: {
    width: '100%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  chipLabel: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
    ...Platform.select({
      ios: { fontFamily: 'SF Pro Text' },
      android: { fontFamily: 'sans-serif' },
    }),
  },
  chipLabelSelected: {
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '700',
  },
  genreSectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    paddingHorizontal: H_PAD,
    marginBottom: 10,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
  },
  listTopFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    zIndex: 6,
  },
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

const GEO_LABEL = Platform.select({
  ios: { fontFamily: 'SF Pro Text' },
  android: { fontFamily: 'sans-serif' },
});

function formatScLikes(n: number): string {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M Likes`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K Likes`;
  return `${Math.round(n)} Likes`;
}

/**
 * StationCard — Machined glassmorphism tile for a live Radio-Browser station.
 * Square art slot shows the station favicon (high-res square) when available;
 * otherwise falls back to a DOCK_CYAN placeholder with the station's first
 * letter. A LIVE RADIO badge sits in the top-left corner of the card.
 */
function StationMasonryCell({
  item,
  colW,
  onPress,
}: {
  item: CrateTile;
  colW: number;
  onPress: () => void;
}) {
  const station = item.station;
  const firstLetter = (item.artist || '•').toUpperCase();
  const artSize = Math.round(colW * 0.78);
  const faviconUri = station?.faviconUrl ?? null;

  return (
    <Pressable
      onPress={onPress}
      style={{ width: colW, marginBottom: GUTTER }}
    >
      <View
        style={{
          width: colW,
          height: item.mediaHeight,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: '#000000',
          borderWidth: 1,
          borderColor: 'rgba(0,229,255,0.35)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Machined base — soft cyan mist + vignette */}
        <LinearGradient
          colors={['rgba(0,229,255,0.14)', 'rgba(0,0,0,0.85)']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* Glass pane over the base */}
        {Platform.OS === 'ios' ? (
          <BlurView
            intensity={18}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
        ) : null}

        {/* Art slot */}
        <View
          style={{
            width: artSize,
            height: artSize,
            borderRadius: 14,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(255,255,255,0.18)',
            backgroundColor: '#000000',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {faviconUri ? (
            <Image
              source={{ uri: faviconUri }}
              style={{ width: artSize, height: artSize }}
              contentFit="cover"
            />
          ) : (
            <View
              style={{
                width: artSize,
                height: artSize,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,229,255,0.06)',
              }}
            >
              <Text
                style={[
                  {
                    color: DOCK_CYAN,
                    fontSize: Math.round(artSize * 0.55),
                    fontWeight: '900',
                    letterSpacing: -1,
                    textShadowColor: 'rgba(0,229,255,0.55)',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: 12,
                  },
                  GEO_LABEL,
                ]}
              >
                {firstLetter}
              </Text>
            </View>
          )}
        </View>

        {/* Top-edge fade — lifts the LIVE RADIO badge off any artwork */}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent']}
          locations={[0, 1]}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 44,
          }}
          pointerEvents="none"
        />

        {/* LIVE RADIO badge — top-left corner */}
        <View
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 7,
            paddingVertical: 4,
            borderRadius: 6,
            overflow: 'hidden',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(0,229,255,0.55)',
            backgroundColor: 'rgba(0,0,0,0.55)',
          }}
          pointerEvents="none"
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: DOCK_CYAN,
              marginRight: 6,
            }}
          />
          <Text
            style={[
              {
                color: DOCK_CYAN,
                fontSize: 9,
                fontWeight: '900',
                letterSpacing: 1.0,
                textTransform: 'uppercase',
              },
              GEO_LABEL,
            ]}
          >
            LIVE RADIO
          </Text>
        </View>

        {/* Small Radio glyph — top-right to mirror existing corner badges */}
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.55)',
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: 'rgba(255,255,255,0.18)',
          }}
          pointerEvents="none"
        >
          <Radio size={12} color={DOCK_CYAN} strokeWidth={2.2} />
        </View>
      </View>

      <Text style={styles.crateTitle} numberOfLines={2}>
        {item.title}
      </Text>
    </Pressable>
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

  const scCentered = item.badge === 'soundcloud' && item.scLayout;
  const isStation = item.kind === 'station';

  const artSize = Math.min(colW * 0.72, item.mediaHeight * 0.78);

  if (isStation) {
    return <StationMasonryCell item={item} colW={colW} onPress={onPress} />;
  }

  return (
    <Pressable
      onPress={onPress}
      onLongPress={item.peekTrack ? onLongPress : undefined}
      onPressOut={item.peekTrack ? onPressOut : undefined}
      delayLongPress={320}
      style={{ width: colW, marginBottom: GUTTER, alignItems: scCentered ? 'center' : undefined }}
    >
      <View
        style={{
          width: colW,
          height: item.mediaHeight,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: '#000000',
          borderWidth: 1,
          borderColor: 'rgba(0,229,255,0.2)',
        }}
      >
        {scCentered ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000000' }}>
            <Image
              source={{ uri: item.artwork }}
              style={{ width: artSize, height: artSize, borderRadius: 12 }}
              contentFit="cover"
            />
          </View>
        ) : (
          <Image source={{ uri: item.artwork }} style={{ width: colW, height: item.mediaHeight }} contentFit="cover" />
        )}
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
      {scCentered ? (
        <>
          <Text style={[styles.crateTitleCenter, GEO_LABEL]} numberOfLines={2}>
            {playlistTitleEmojiEnd(item.title)}
          </Text>
          {item.artist ? (
            <Text style={[styles.crateArtistCenter, GEO_LABEL]} numberOfLines={1}>
              {item.artist}
            </Text>
          ) : null}
          <Text style={[styles.crateLikesLine, GEO_LABEL]} numberOfLines={1}>
            {(item.likeCount ?? 0) > 0 ? formatScLikes(item.likeCount ?? 0) : '—'}
          </Text>
        </>
      ) : (
        <Text style={styles.crateTitle} numberOfLines={2}>
          {playlistTitleEmojiEnd(item.title)}
        </Text>
      )}
    </Pressable>
  );
}

/** Live SoundCloud Explore / Trending / Spotlight — one hero track per slot */
function DiscoverScCollectionsRow({
  feed,
  playTrack,
}: {
  feed: ScDiscoverFeedPayload | null;
  playTrack: (track: Track, queue?: Track[], options?: { expandNowPlaying?: boolean }) => Promise<void>;
}) {
  if (!feed?.collections?.length) return null;

  const crateTracks = feed?.crateTracks ?? [];
  const collections = feed?.collections ?? [];
  const queue: Track[] = crateTracks.map((x) => ({
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
    soundcloudId: x.trackId,
    audioUrl: '',
  }));

  const gap = 10;
  const cardW = (SCREEN_W - H_PAD * 2 - gap * 2) / 3;
  const iconH = Math.min(112, Math.round(cardW * 1.05));
  const artBox = Math.min(cardW * 0.72, iconH * 0.72);

  const slotTitle: Record<string, string> = {
    trending: 'Trending',
    explore: 'Explore',
    spotlight: 'Spotlight',
  };

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
        {collections.map(({ slot, track }) => {
          const self = queue.find((q) => q.id === `sc-${track.trackId}`) ?? queue[0];
          return (
            <Pressable
              key={`${slot}-${track.trackId}`}
              onPress={() => {
                logUiTap('Discover collections', 'play_sc_track');
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                void playTrack(self, queue);
              }}
              style={{
                width: cardW,
                marginRight: gap,
                borderRadius: 14,
                overflow: 'hidden',
                backgroundColor: '#000000',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.2)',
                paddingBottom: 12,
              }}
            >
              <View
                style={{
                  width: cardW,
                  height: iconH,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#000000',
                }}
              >
                <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }} pointerEvents="none">
                  <SourceCornerBadge source="soundcloud" />
                </View>
                <Image
                  source={{ uri: track.artwork }}
                  style={{ width: artBox, height: artBox, borderRadius: 12 }}
                  contentFit="cover"
                />
              </View>
              <Text
                style={{
                  marginTop: 8,
                  paddingHorizontal: 8,
                  color: CYAN_ENGINE,
                  fontSize: 10,
                  fontWeight: '800',
                  textAlign: 'center',
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  ...GEO_LABEL,
                }}
                numberOfLines={1}
              >
                {slotTitle[slot] ?? slot}
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  paddingHorizontal: 8,
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 12,
                  fontWeight: '700',
                  textAlign: 'center',
                  letterSpacing: 0.15,
                  ...GEO_LABEL,
                }}
                numberOfLines={2}
              >
                {track.title}
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  paddingHorizontal: 8,
                  color: 'rgba(255,255,255,0.9)',
                  fontSize: 12,
                  fontWeight: '600',
                  textAlign: 'center',
                  ...GEO_LABEL,
                }}
                numberOfLines={1}
              >
                {track.artist}
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  paddingHorizontal: 8,
                  color: 'rgba(255,255,255,0.85)',
                  fontSize: 11,
                  fontWeight: '700',
                  textAlign: 'center',
                  ...GEO_LABEL,
                }}
                numberOfLines={1}
              >
                {formatScLikes(track.likeCount)}
              </Text>
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
  scTracks: Array<SCSearchTrack & { likeCount?: number }>;
  playTrack: (track: Track, queue?: Track[], options?: { expandNowPlaying?: boolean }) => Promise<void>;
}) {
  const safeScTracks = ensureArray<SCSearchTrack & { likeCount?: number }>(scTracks);
  const slice = safeScTracks.slice(0, 16);
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
                  backgroundColor: '#000000',
                  borderWidth: 1,
                  borderColor: 'rgba(0,229,255,0.5)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShadowArtworkImage
                  source={{ uri: t.artwork }}
                  style={{ width: Math.round(dim * 0.72), height: Math.round(dim * 0.72), borderRadius: 12 }}
                  contentFit="cover"
                />
                <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                  <SourceCornerBadge source="soundcloud" />
                </View>
              </View>
              <Text
                style={[{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700', marginTop: 8, width: dim, textAlign: 'center' }, GEO_LABEL]}
                numberOfLines={2}
              >
                {t.title}
              </Text>
              <Text style={[{ color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600', width: dim, textAlign: 'center' }, GEO_LABEL]} numberOfLines={1}>
                {t.artist}
              </Text>
              <Text style={[{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700', width: dim, textAlign: 'center', marginTop: 4 }, GEO_LABEL]} numberOfLines={1}>
                {t.likeCount != null && t.likeCount > 0 ? formatScLikes(t.likeCount) : '—'}
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
  /** Live SC discover — when non-empty, replaces SC search tiles for the crate grid */
  scDiscoverCrateTracks: ScDiscoverTrackRow[];
  scCuratedPlaylists: SoundcloudCuratedPlaylist[];
  scMixes: MixDefinition[];
  mixArtworkById: Record<string, string>;
  discoverFeedItems: DiscoverItem[];
  downloads: DownloadedTrack[];
  radioStations: RadioStation[];
}): CrateTile[] {
  const {
    colW,
    router,
    playTrack,
    ytVideosFeed,
    scTracksFeed,
    scDiscoverCrateTracks,
    scCuratedPlaylists,
    scMixes,
    mixArtworkById,
    discoverFeedItems,
    downloads,
    radioStations,
  } = args;

  const safeYtVideosFeed = ensureArray<PlaylistTrack>(ytVideosFeed);
  const safeScTracksFeed = ensureArray<SCSearchTrack>(scTracksFeed);
  const safeScDiscoverCrateTracks = ensureArray<ScDiscoverTrackRow>(scDiscoverCrateTracks);
  const safeScCuratedPlaylists = ensureArray<SoundcloudCuratedPlaylist>(scCuratedPlaylists);
  const safeScMixes = ensureArray<MixDefinition>(scMixes);
  const safeDiscoverFeedItems = ensureArray<DiscoverItem>(discoverFeedItems);
  const safeDownloads = ensureArray<DownloadedTrack>(downloads);
  const safeRadioStations = ensureArray<RadioStation>(radioStations);

  const videoH = Math.round((colW * 9) / 16);
  const squareH = colW;

  const ytVideoQueue: Track[] = safeYtVideosFeed.map((x) => ({
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

  const scFeedRows: Array<SCSearchTrack & { likeCount?: number }> =
    safeScDiscoverCrateTracks.length > 0
      ? safeScDiscoverCrateTracks.map((x) => ({
          trackId: x.trackId,
          title: x.title,
          artist: x.artist,
          artwork: x.artwork,
          duration: x.duration,
          soundcloudUrl: x.soundcloudUrl,
          likeCount: x.likeCount,
        }))
      : safeScTracksFeed.map((x) => ({ ...x, likeCount: undefined }));

  const scQueue: Track[] = scFeedRows.map((x) => ({
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
    soundcloudId: x.trackId,
    audioUrl: '',
  }));

  const discoverTracks: Track[] = safeDiscoverFeedItems.map(discoverItemToTrack);

  const tiles: CrateTile[] = [];

  for (const t of safeYtVideosFeed) {
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

  for (const t of scFeedRows) {
    const track = scQueue.find((q) => q.id === `sc-${t.trackId}`)!;
    const hasDiscover = safeScDiscoverCrateTracks.length > 0;
    tiles.push({
      id: `crate-${track.id}`,
      kind: 'square',
      title: t.title,
      artwork: t.artwork,
      mediaHeight: squareH,
      layoutHeight: squareH + TITLE_BLOCK + SC_META_EXTRA,
      vibes: inferVibes(t.title, t.artist),
      badge: 'soundcloud',
      artist: t.artist,
      likeCount: t.likeCount,
      scLayout: true,
      peekTrack: track,
      peekQueue: scQueue,
      onPress: () => {
        logUiTap('Discover crates', hasDiscover ? 'play_sc_discover' : 'play_sc_feed');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (hasDiscover) {
          void playTrack(track, scQueue);
        } else {
          router.push('/(app)/track-feed?kind=sc' as never);
        }
      },
    });
  }

  for (const pl of safeScCuratedPlaylists) {
    const playlistTracks = ensureArray<SoundcloudCuratedTrackRow>(pl?.tracks);
    if (playlistTracks.length === 0) continue;
    if ((pl as { section?: string }).section === 'popular') continue;
    const queue: Track[] = playlistTracks.map((t) => ({
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

  for (const mix of safeScMixes) {
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

  for (const item of safeDiscoverFeedItems) {
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

  for (const d of safeDownloads) {
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

  shuffleInPlace(tiles);

  // Build live-radio station tiles (Radio-Browser) and interleave 1 for every
  // 3 tracks so the feed reads as a unified "Vibe" stream.
  const stationTiles: CrateTile[] = safeRadioStations.map((station) => {
    const stationTrack = stationToTrack(station);
    const firstLetter = (station.name.trim().charAt(0) || '•').toUpperCase();
    return {
      id: `crate-rb-${station.id}`,
      kind: 'station',
      title: station.name,
      artwork: station.faviconUrl ?? '',
      mediaHeight: squareH,
      layoutHeight: squareH + TITLE_BLOCK,
      vibes: inferVibes(station.name, (station.tags ?? []).join(' '), station.country),
      badge: 'stream',
      peekTrack: null,
      peekQueue: [],
      artist: firstLetter,
      station,
      onPress: () => {
        logUiTap('Discover crates', 'play_radio_station');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void playTrack(stationTrack, [stationTrack]);
      },
    };
  });

  if (stationTiles.length === 0) return tiles;

  const interleaved: CrateTile[] = [];
  let si = 0;
  for (let ti = 0; ti < tiles.length; ti++) {
    interleaved.push(tiles[ti]);
    if ((ti + 1) % 3 === 0 && si < stationTiles.length) {
      interleaved.push(stationTiles[si++]);
    }
  }
  while (si < stationTiles.length) interleaved.push(stationTiles[si++]);
  return interleaved;
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
  const { louis, kickTranslateStyle, tabListTopPadding } = useLouisOledChrome(insets.top);
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
    return ensureArray<SoundcloudCuratedPlaylist>(hit?.value);
  });
  const [scMixes, setScMixes] = useState<MixDefinition[]>(() => {
    const hit = discoverMMKV.get<MixDefinition[]>(DISCOVER_KEYS.scMixes, TTL.CURATED);
    return ensureArray<MixDefinition>(hit?.value);
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
    return ensureArray<PlaylistTrack>(hit?.value);
  });
  const [ytmTracksFeed, setYtmTracksFeed] = useState<PlaylistTrack[]>(() => {
    const hit = discoverMMKV.get<PlaylistTrack[]>(DISCOVER_KEYS.ytmTracksFeed, TTL.GENRE);
    return ensureArray<PlaylistTrack>(hit?.value);
  });
  const [scTracksFeed, setScTracksFeed] = useState<SCSearchTrack[]>(() => {
    const hit = discoverMMKV.get<SCSearchTrack[]>(DISCOVER_KEYS.scTracksFeed, TTL.GENRE);
    return ensureArray<SCSearchTrack>(hit?.value);
  });

  const [scDiscoverFeed, setScDiscoverFeed] = useState<ScDiscoverFeedPayload | null>(null);
  const [discoverFeedNonce, setDiscoverFeedNonce] = useState(0);

  // Radio-Browser live stations — seed from 15-minute MMKV cache so the feed
  // paints stations on first frame; fresh fetch happens in background.
  const [radioStations, setRadioStations] = useState<RadioStation[]>(() =>
    ensureArray<RadioStation>(readTopStationsCache()),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stations = await getTopStations(40);
        if (!cancelled) setRadioStations(ensureArray<RadioStation>(stations));
      } catch (err) {
        console.warn('[Discover] radio-browser fetch failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discoverFeedNonce]);

  const masonryRef = useRef<MasonryFlashListRef<CrateTile>>(null);
  const [vibeChip, setVibeChip] = useState('all');
  const colW = (SCREEN_W - H_PAD * 2 - GUTTER) / 2;

  const filteredDiscoverItems = useMemo(() => {
    const safeSections = ensureArray<DiscoverSection>(sections);
    const sectionItems = safeSections.flatMap((s) => s?.items ?? []);
    const safeVybeBeats = ensureArray<DiscoverItem>(vybeBeats);
    const raw =
      sectionItems.length > 0
        ? sectionItems
        : safeVybeBeats;
    return raw.filter((item) => {
      const idOk = /^yt-[\w-]+$|^sc-\d+$/.test(item.id);
      const creatorOk = !/tap to search/i.test(item.creatorName ?? '');
      const hasUrl = !!item.externalUrl && /^https?:\/\//.test(item.externalUrl);
      return idOk && creatorOk && hasUrl;
    });
  }, [sections, vybeBeats]);

  const scDiscoverCrateTracks = scDiscoverFeed?.crateTracks ?? [];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await raceWithScDiscoverTimeout(
          api.get<ScDiscoverFeedPayload>(
            `/api/soundcloud/discover-feed?vibe=${encodeURIComponent(vibeChip)}&limit=36`,
          ),
        );
        if (!cancelled) setScDiscoverFeed(data);
      } catch (e) {
        if (isDiscoverBackendFailure(e)) {
          console.warn('[Discover] discover-feed timeout / server error — showing crate without SC hero');
        } else {
          console.warn('[Discover] discover-feed failed', e);
        }
        if (!cancelled) setScDiscoverFeed(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vibeChip, discoverFeedNonce]);

  /** Never block the tab on a stuck `fetchFeed` spinner (zombie loading state). */
  useEffect(() => {
    if (!isLoadingFeed || sections.length > 0) return;
    const t = setTimeout(() => {
      useDiscoverFeedStore.setState({ isLoadingFeed: false });
    }, 3000);
    return () => clearTimeout(t);
  }, [isLoadingFeed, sections.length]);

  const allCrateTiles = useMemo(
    () =>
      buildCrateTiles({
        colW,
        router,
        playTrack,
        ytVideosFeed,
        scTracksFeed,
        scDiscoverCrateTracks,
        scCuratedPlaylists,
        scMixes,
        mixArtworkById,
        discoverFeedItems: filteredDiscoverItems,
        downloads,
        radioStations,
      }),
    [
      colW,
      router,
      playTrack,
      ytVideosFeed,
      scTracksFeed,
      scDiscoverCrateTracks,
      scCuratedPlaylists,
      scMixes,
      mixArtworkById,
      filteredDiscoverItems,
      downloads,
      radioStations,
    ],
  );

  const masonryData = useMemo(() => {
    if (vibeChip === 'all') return allCrateTiles;
    return allCrateTiles.filter((t) => t.vibes.includes(vibeChip));
  }, [allCrateTiles, vibeChip]);
  const safeMasonryData = masonryData ?? [];
  const shouldShowDiscoverLoader =
    isLoadingFeed || safeMasonryData.length === 0;

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
    setDiscoverFeedNonce((n) => n + 1);
    await refreshFeed();
    setIsRefreshing(false);
  }, [refreshFeed]);

  // Discover onboarding is disabled — long-press on the header is a no-op.
  const handleEditPreferences = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: '#000000' }, louis && kickTranslateStyle]}>
      <View style={{ paddingTop: tabListTopPadding, paddingHorizontal: H_PAD, paddingBottom: 10 }}>
        <Pressable onLongPress={handleEditPreferences} delayLongPress={550}>
          <MachinedGradientText neonGlow style={{ fontSize: 24, fontWeight: '800', letterSpacing: 0.35 }}>
            Discover
          </MachinedGradientText>
        </Pressable>
        <Text
          style={{
            color: 'rgba(255,255,255,0.9)',
            marginTop: 6,
            fontSize: 14,
            fontWeight: '600',
            ...GEO_LABEL,
          }}
        >
          Crate digging — fast scan, slow listens
        </Text>
      </View>

      <Text style={styles.genreSectionTitle}>Genre</Text>
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
            <View style={styles.chipIconSlot}>{vibeChipGlyph(chip.id, vibeChip === chip.id)}</View>
            <Text style={[styles.chipLabel, vibeChip === chip.id && styles.chipLabelSelected]}>{chip.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoadingFeed && sections.length === 0 ? (
        <Animated.View entering={FadeIn} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
          <ActivityIndicator size="large" color={VIBRANT_BLUE} />
          <Text style={{ color: 'rgba(255,255,255,0.55)', marginTop: 16, fontWeight: '600' }}>Building your VYBE…</Text>
        </Animated.View>
      ) : null}

      {/* FlashList doesn't accept `style` (only `contentContainerStyle`).
          Wrap in a flex:1 View so the list fills remaining vertical space
          inside the Discover screen container. */}
      <View style={{ flex: 1, position: 'relative' }}>
        <LinearGradient
          colors={['#000000', 'rgba(0,0,0,0)']}
          locations={[0, 1]}
          style={styles.listTopFade}
          pointerEvents="none"
        />
        <DiscoverListErrorBoundary>
          {shouldShowDiscoverLoader ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
              <ActivityIndicator size="large" color={CYAN_ENGINE} />
            </View>
          ) : null}
          <MasonryFlashList
            ref={masonryRef as React.RefObject<MasonryFlashListRef<CrateTile>>}
            data={safeMasonryData}
            numColumns={2}
            keyExtractor={(it) => it.id}
            estimatedItemSize={148}
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
                <DiscoverSourceRail />
                <DiscoveryRailSection sectionTitle="Discover collections" actionType="horizontal_rail">
                  <DiscoverScCollectionsRow feed={scDiscoverFeed} playTrack={playTrack} />
                </DiscoveryRailSection>
                <DiscoveryRailSection sectionTitle="SoundCloud vault" actionType="horizontal_rail">
                  <DiscoverVaultExclusivesRail
                    scTracks={scDiscoverCrateTracks.length > 0 ? scDiscoverCrateTracks : scTracksFeed}
                    playTrack={playTrack}
                  />
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
        </DiscoverListErrorBoundary>
      </View>
    </Animated.View>
  );
}
