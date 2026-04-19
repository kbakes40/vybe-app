import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Share,
  Modal,
  StyleSheet,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Circle } from 'react-native-svg';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import {
  buildPlaylistDetailFlashRows,
  HouseAdLinkSheet,
  MainstreetTeesBannerRow,
  useEasterEggAdViewabilityHandler,
  HOUSE_AD_VIEWABILITY,
  HOUSE_AD_URLS,
  type PlaylistDetailListItem,
} from '@/components/HouseAds';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft,
  Play,
  Share2,
  MoreVertical,
  Music,
  Shuffle,
  ListPlus,
  X,
  Trash2,
  Library,
  Sparkles,
  User,
  FileText,
} from 'lucide-react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  SharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useSharedValue,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { normalizeYoutubePlaylistTracksPayload } from '@/lib/youtubePlaylistTracksNormalize';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore, downloadYouTubeTrack, downloadSoundCloudTrack } from '@/stores/downloadsStore';

// Swipe-to-delete action rendered on the right side of a row.
function DeleteAction({ progress, onPress }: { progress: SharedValue<number>; onPress: () => void }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.8, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [16, 0], Extrapolation.CLAMP) }],
  }));
  return (
    <Animated.View style={[style, { width: 76, justifyContent: 'center', alignItems: 'center' }]}>
      <Pressable
        onPress={onPress}
        style={{
          width: 64, height: '85%',
          backgroundColor: '#EF4444', borderRadius: 10,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Trash2 size={20} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', marginTop: 2 }}>Delete</Text>
      </Pressable>
    </Animated.View>
  );
}
import { api } from '@/lib/api/api';
import { createMMKVCache, TTL } from '@/lib/mmkv-cache';
import { Track } from '@/types/music';
import { stackScreenContentContainerPaddingBottom } from '@/constants/Layout';
import {
  DECADES_70S_PLAYLIST_ID,
  DECADES_90S_PLAYLIST_ID,
  buildMainstreetThreadsVaultTrack,
} from '@/constants/decadesVault';
import { HahaVendingSilhouette } from '@/components/easterEggs/HahaVendingSilhouette';
import { DownloadButton, GhostSweepRing } from '@/components/DownloadButton';
import { MachinedCloudIcon } from '@/components/MachinedCloudIcon';
import { useUserPlaylistStore } from '@/stores/userPlaylistStore';
import { PlaylistDetailTrackRow } from '@/components/PlaylistDetailTrackRow';
import { PlaylistDiscoverMoreRow } from '@/components/PlaylistDiscoverMoreRow';
import { preResolveSoundcloudStreamUrl } from '@/lib/soundcloudStreamPreloadCache';
import { preResolveYoutubeVideoId } from '@/lib/youtubeResolvePreloadCache';

// Read from the same caches Home / Discover write to so we can resolve the
// playlist immediately even if the fresh API response drifts.
const homeMMKV = createMMKVCache('vybe-home');
const discoverMMKV = createMMKVCache('vybe-discover');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HALF = SCREEN_WIDTH / 2;

/** Taller editorial hero — bleeds under status bar when header is transparent */
const HERO_HEIGHT = Math.round(SCREEN_WIDTH * 0.95);

const ACTION_SIZE = 48;

const AnimatedFlashList = Animated.createAnimatedComponent(FlashList<PlaylistDetailListItem>);

function upgradePlaylistArtworkUrl(url: string): string {
  if (!url) return url;
  const m = url.match(/i\.ytimg\.com\/vi\/([^/]+)\//);
  if (m?.[1]) return `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg`;
  return url.replace(/\/(hqdefault|mqdefault|sddefault)\.jpg/i, '/maxresdefault.jpg');
}

const SHADOW_MAGENTA = '#FF00FF';

/** Determinate thin progress ring (Shadow) for batch download */
function ShadowProgressRing({ size, progress }: { size: number; progress: number }) {
  const STROKE = Math.max(1, size * 0.045);
  const R = (size - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const clamped = Math.min(1, Math.max(0, progress));
  const strokeDashoffset = C * (1 - clamped);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke="rgba(255,255,255,0.68)"
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${C}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  shadowSheetLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginLeft: 16,
  },
});

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
}

function toTrack(t: PlaylistTrack, playlist: CuratedPlaylist): Track {
  return {
    id: `ytm-${t.videoId}`,
    title: t.title,
    artist: t.channelName,
    artistId: t.channelId ? `yt-ch-${t.channelId}` : `ytm-artist-${t.videoId}`,
    album: playlist.name,
    albumId: `ytm-pl-${playlist.playlistId}`,
    artwork: t.thumbnailUrl,
    duration: 0,
    isLiked: false,
    source: 'youtube_music' as const,
    youtubeId: t.videoId,
    youtubeMusicId: t.videoId,
    youtubeMusicUrl: `https://music.youtube.com/watch?v=${t.videoId}`,
  };
}

type PlaylistDetailListHeaderProps = {
  playlist: CuratedPlaylist;
  tracks: Track[];
  durationStr: string;
  insetsTop: number;
  artworks: string[];
  downloadingAll: boolean;
  downloadAllProgress: number;
  scrollY: SharedValue<number>;
  onBack: () => void;
  onDownloadAll: () => void;
  onPlayAll: () => void;
  onShuffle: () => void;
  onShare: () => void;
  onOpenMore: () => void;
};

function PlaylistDetailListHeader({
  playlist,
  tracks,
  durationStr,
  insetsTop,
  artworks,
  downloadingAll,
  downloadAllProgress,
  scrollY,
  onBack,
  onDownloadAll,
  onPlayAll,
  onShuffle,
  onShare,
  onOpenMore,
}: PlaylistDetailListHeaderProps) {
  const heroScaleStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    const scale = interpolate(y, [0, 240], [1, 1.1], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  const heroBlurStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    const opacity = interpolate(y, [0, 48, 200], [0, 0.4, 0.92], Extrapolation.CLAMP);
    return { opacity };
  });

  const upgradedArtworks = artworks.map(upgradePlaylistArtworkUrl);
  const primaryThumb = upgradedArtworks[0] ?? upgradePlaylistArtworkUrl(playlist.thumbnailUrl);

  const editorialAuthor =
    tracks.length === 0
      ? 'VYBE'
      : [...new Set(tracks.map((t) => t.artist))].length <= 2
        ? [...new Set(tracks.map((t) => t.artist))].join(' · ').toUpperCase()
        : 'VARIOUS ARTISTS';

  return (
    <>
      <View style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT, overflow: 'hidden', backgroundColor: '#000' }}>
        <Animated.View style={[{ width: SCREEN_WIDTH, height: HERO_HEIGHT }, heroScaleStyle]}>
          {upgradedArtworks.length >= 4 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: SCREEN_WIDTH, height: HERO_HEIGHT }}>
              {upgradedArtworks.slice(0, 4).map((uri, i) => (
                <Image
                  key={i}
                  source={{ uri }}
                  style={{ width: HALF, height: HERO_HEIGHT / 2 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={180}
                />
              ))}
            </View>
          ) : primaryThumb ? (
            <Image
              source={{ uri: primaryThumb }}
              style={{ width: SCREEN_WIDTH, height: HERO_HEIGHT }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={180}
            />
          ) : (
            <View
              style={{
                width: SCREEN_WIDTH,
                height: HERO_HEIGHT,
                backgroundColor: '#0A0A0A',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Music size={72} color="rgba(255,255,255,0.12)" />
            </View>
          )}
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            heroBlurStyle,
            { backgroundColor: 'rgba(0,0,0,0.22)' },
          ]}
        />

        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent']}
          locations={[0, 0.35]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140, zIndex: 1 }}
          pointerEvents="none"
        />

        <LinearGradient
          colors={['transparent', '#000000']}
          locations={[0.15, 1]}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: HERO_HEIGHT * 0.55, zIndex: 2 }}
          pointerEvents="none"
        />

        <Pressable
          onPress={onBack}
          style={{
            position: 'absolute',
            top: insetsTop + 6,
            left: 14,
            zIndex: 12,
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: 'rgba(0,0,0,0.45)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={24} color="#fff" />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 18, backgroundColor: '#000000' }}>
        <Text
          style={{
            color: '#FFFFFF',
            fontSize: 32,
            fontWeight: '900',
            letterSpacing: -0.8,
            marginBottom: 12,
          }}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {playlist.name}
        </Text>

        <Text
          style={{
            color: SHADOW_MAGENTA,
            fontSize: 12,
            fontWeight: '700',
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 22,
          }}
          numberOfLines={2}
        >
          {`${editorialAuthor}  ·  ${tracks.length} SONGS  ·  ${durationStr.toUpperCase()}`}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Pressable
            onPress={onPlayAll}
            style={{
              flex: 1,
              minWidth: 0,
              height: 52,
              borderRadius: 26,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              ...Platform.select({
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 6 },
                  shadowOpacity: 0.35,
                  shadowRadius: 12,
                },
                android: { elevation: 8 },
                default: {},
              }),
            }}
          >
            <Play size={22} color="#000000" fill="#000000" style={{ marginLeft: 2 }} />
            <Text style={{ color: '#000000', fontWeight: '800', fontSize: 16, marginLeft: 10, letterSpacing: 0.2 }}>
              Play
            </Text>
          </Pressable>

          <Pressable
            onPress={onShuffle}
            style={{
              flex: 1,
              minWidth: 0,
              height: 52,
              borderRadius: 26,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.35)',
              backgroundColor: 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <Shuffle size={20} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 15, letterSpacing: 0.3 }}>Shuffle</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 8 }}>
          <Pressable
            onPress={onDownloadAll}
            disabled={downloadingAll}
            style={{
              width: ACTION_SIZE,
              height: ACTION_SIZE,
              borderRadius: ACTION_SIZE / 2,
              backgroundColor: 'rgba(255,255,255,0.08)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {downloadingAll ? (
              downloadAllProgress <= 0.02 ? (
                <GhostSweepRing size={22} />
              ) : (
                <ShadowProgressRing size={22} progress={downloadAllProgress} />
              )
            ) : (
              <MachinedCloudIcon size={22} strokeWidth={2} />
            )}
          </Pressable>

          <Pressable
            onPress={onShare}
            style={{
              width: ACTION_SIZE,
              height: ACTION_SIZE,
              borderRadius: ACTION_SIZE / 2,
              backgroundColor: 'rgba(255,255,255,0.08)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Share2 size={20} color="#FFFFFF" strokeWidth={2} />
          </Pressable>

          <Pressable
            onPress={onOpenMore}
            style={{
              width: ACTION_SIZE,
              height: ACTION_SIZE,
              borderRadius: ACTION_SIZE / 2,
              backgroundColor: 'rgba(255,255,255,0.08)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MoreVertical size={20} color="#FFFFFF" strokeWidth={2} />
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 22, paddingHorizontal: 4, backgroundColor: '#000000' }}>
        <Text
          style={{
            color: 'rgba(255,255,255,0.38)',
            fontSize: 11,
            fontWeight: '700',
            letterSpacing: 1.4,
            marginLeft: 12,
            marginBottom: 8,
          }}
        >
          TRACKS
        </Text>
      </View>
    </>
  );
}

function singleRouteParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

export default function PlaylistDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; playlistId?: string; playlistName?: string }>();
  /** Home uses `?id=`, Heavy Rotation uses `params.playlistId` — both must work. */
  const id = singleRouteParam(params.id) || singleRouteParam(params.playlistId);
  const routePlaylistName = singleRouteParam(params.playlistName);

  const [playlist, setPlaylist] = useState<CuratedPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadAllProgress, setDownloadAllProgress] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [mainstreetSheetOpen, setMainstreetSheetOpen] = useState(false);
  // Track per-row progress during Download All so each row can render its
  // own live % without using the per-button DownloadButton state machine.
  const [batchActiveId, setBatchActiveId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState(0);
  const [recDownloadingAll, setRecDownloadingAll] = useState(false);

  // Recommended SoundCloud tracks based on the playlist's name keywords.
  const [recommended, setRecommended] = useState<Track[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(false);

  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);
  const removeDownload = useDownloadsStore(s => s.removeDownload);

  useEffect(() => {
    async function load() {
      if (!id) {
        setLoading(false);
        return;
      }
      try {
        // 1. Check MMKV caches first (populated by Home/Discover) — gives
        // instant content and survives backend response drift.
        const cached = [
          homeMMKV.get<CuratedPlaylist[]>('curatedPlaylists', TTL.CURATED)?.value,
          discoverMMKV.get<CuratedPlaylist[]>('ytCuratedPlaylists', TTL.CURATED)?.value,
        ];
        for (const list of cached) {
          const hit = list?.find(p => p.playlistId === id);
          if (hit) { setPlaylist(hit); setLoading(false); return; }
        }
        // 2. Try the curated playlists endpoint (only knows about the hand-picked
        // ones in the backend config).
        const all = await api.get<CuratedPlaylist[]>('/api/youtube/playlists');
        const found = all?.find(p => p.playlistId === id);
        if (found) { setPlaylist(found); return; }

        // 3. Fall back to /playlist-tracks for arbitrary YouTube playlist IDs
        // (Era Hits cards, anything else passed through). Uses yt-dlp on the
        // backend so it works for any public YouTube/YT Music playlist.
        const rawTracks = await api.get<unknown>(`/api/youtube/playlist-tracks?listId=${encodeURIComponent(id)}`);
        const tracksData = normalizeYoutubePlaylistTracksPayload(rawTracks);
        if (tracksData.length > 0) {
          // Reshape to the CuratedPlaylist contract this screen expects.
          const reshaped: CuratedPlaylist = {
            playlistId: id,
            name: 'Playlist',
            thumbnailUrl: tracksData[0]?.thumbnail ?? '',
            tracks: tracksData.map(t => ({
              videoId: t.videoId,
              title: t.title,
              channelName: t.channel,
              thumbnailUrl: t.thumbnail,
              publishedAt: '',
            })),
          };
          setPlaylist(reshaped);
        }
      } catch (e) {
        console.error('[PlaylistDetail] load error:', e);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  const tracks = useMemo(() => {
    if (!playlist) return [] as Track[];
    const base = playlist.tracks.map((t) => toTrack(t, playlist));
    if (playlist.playlistId !== DECADES_70S_PLAYLIST_ID) return base;
    const egg = buildMainstreetThreadsVaultTrack(`ytm-pl-${playlist.playlistId}`);
    const at = Math.min(6, base.length);
    const out = [...base];
    out.splice(at, 0, egg);
    return out;
  }, [playlist]);

  const playlistTitleForAds = playlist?.name?.trim() || routePlaylistName?.trim() || '';
  const flashListData = useMemo(
    () => buildPlaylistDetailFlashRows(tracks, playlistTitleForAds, id || undefined),
    [tracks, playlistTitleForAds, id],
  );

  const mergedFlashData = useMemo((): PlaylistDetailListItem[] => {
    if (!(recommended.length > 0 || recommendedLoading)) return flashListData;
    const tail: PlaylistDetailListItem[] = [{ type: 'discover-header' }];
    if (recommendedLoading && recommended.length === 0) {
      tail.push(
        { type: 'discover-skeleton', id: 'd-sk-0' },
        { type: 'discover-skeleton', id: 'd-sk-1' },
        { type: 'discover-skeleton', id: 'd-sk-2' },
      );
    } else {
      for (const t of recommended) {
        tail.push({ type: 'discover-track', track: t });
      }
    }
    tail.push({ type: 'discover-fade' });
    return [...flashListData, ...tail];
  }, [flashListData, recommended, recommendedLoading]);

  const { onViewableItemsChanged, resetFired } = useEasterEggAdViewabilityHandler();
  useEffect(() => {
    resetFired();
  }, [id, resetFired]);

  // Warm disk+memory cache for hero + every row thumbnail (no FastImage native dep).
  useEffect(() => {
    if (!playlist?.tracks?.length) return;
    const urls: string[] = [];
    if (playlist.thumbnailUrl) urls.push(playlist.thumbnailUrl);
    for (const t of playlist.tracks) {
      if (t.thumbnailUrl) urls.push(t.thumbnailUrl);
    }
    if (urls.length > 0) void Image.prefetch(urls);
  }, [playlist?.playlistId, playlist?.tracks?.length]);

  // Lazy-fetch SoundCloud recommendations once playlist name is known.
  useEffect(() => {
    if (!playlist?.name) return;
    let cancelled = false;
    setRecommendedLoading(true);

    const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');

    // Build a set of progressively simpler queries — start with the most
    // specific (cleaned full name) and fall back to shorter / more generic
    // queries so we always surface something, even for playlists whose name
    // returns zero results on SoundCloud.
    const rawName = playlist.name;
    const cleaned = rawName
      .toLowerCase()
      // strip punctuation like em-dashes, bullets, parens — SoundCloud search
      // is fuzzy on spaces but chokes on symbols
      .replace(/[—–\-·•|()\[\]]/g, ' ')
      .replace(/essentials|playlist|mix|hits|classics|greatest|the best of|the best|super/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Pull the two most distinctive tokens (skips short fillers like "the", "of")
    const tokens = cleaned.split(' ').filter(w => w.length >= 3);
    const twoTokens = tokens.slice(0, 2).join(' ');
    const firstToken = tokens[0] ?? '';

    // Category fallback from the curated playlist metadata — these are the
    // section labels ("Chill / Relaxed", "Workout / Energy", etc.) that always
    // have SoundCloud hits.
    const catFallback = (playlist as { category?: string }).category
      ?.toLowerCase()
      .replace(/[\/&]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const candidates = Array.from(new Set(
      [cleaned, twoTokens, firstToken, catFallback, 'popular']
        .filter((q): q is string => !!q && q.length > 0)
    ));

    async function fetchRecommendations() {
      for (const q of candidates) {
        if (cancelled) return;
        try {
          const r = await fetch(`${backendBase}/api/soundcloud/search?q=${encodeURIComponent(q)}&maxResults=20`);
          if (!r.ok) continue;
          const json = await r.json();
          const items = (json?.data ?? []) as Array<{ trackId: string; title: string; artist: string; artwork: string; duration: number; soundcloudUrl: string }>;
          if (items.length === 0) continue;
          const mapped: Track[] = items.map(t => ({
            id: `sc-${t.trackId}`,
            title: t.title,
            artist: t.artist,
            artwork: t.artwork,
            duration: t.duration,
            isLiked: false,
            source: 'soundcloud' as const,
            soundcloudUrl: t.soundcloudUrl,
            audioUrl: '',
            artistId: '', album: '', albumId: '',
          }));
          if (!cancelled) setRecommended(mapped);
          return;
        } catch {
          // try next candidate
        }
      }
    }

    fetchRecommendations().finally(() => {
      if (!cancelled) setRecommendedLoading(false);
    });

    return () => { cancelled = true; };
  }, [playlist?.name]);

  // Pre-warm SoundCloud streams + artwork for Discover More (instant tap / scroll).
  useEffect(() => {
    if (recommended.length === 0) return;
    for (const t of recommended.slice(0, 20)) {
      if (t.soundcloudUrl) preResolveSoundcloudStreamUrl(t.soundcloudUrl);
      const ytid = t.youtubeMusicId ?? t.youtubeId;
      if (ytid) preResolveYoutubeVideoId(ytid);
    }
    const arts = recommended.slice(0, 12).map(t => t.artwork).filter(Boolean);
    void Image.prefetch(arts);
  }, [recommended]);

  // Pre-warm CDN URL cache for the first 8 tracks so playback is instant
  useEffect(() => {
    if (tracks.length === 0) return;
    const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
    tracks.slice(0, 8).forEach(track => {
      const videoId = track.youtubeId || track.youtubeMusicId;
      if (videoId) {
        preResolveYoutubeVideoId(videoId);
        fetch(`${backendBase}/api/youtube/warm/${videoId}`).catch(() => {});
      }
    });
  }, [tracks.length]);

  // No more auto-push to the full-screen nowPlaying view on play. Music
  // starts in the background, the MiniPlayer shows at the bottom, and the
  // user stays on whatever screen they were on (matches Spotify's behavior
  // and keeps Apple TV / AirPlay from being interrupted by a black screen).
  const playableTracks = useMemo(
    () => tracks.filter((t) => !t.externalHandoffUrl?.trim()),
    [tracks],
  );

  const handlePlayAll = useCallback(() => {
    if (playableTracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playTrack(playableTracks[0]!, playableTracks);
  }, [playableTracks, playTrack]);

  const handlePlayTrack = useCallback(
    (track: Track) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (track.externalHandoffUrl?.trim()) {
        void Linking.openURL(track.externalHandoffUrl.trim());
        return;
      }
      playTrack(track, playableTracks.length > 0 ? playableTracks : tracks);
    },
    [tracks, playableTracks, playTrack],
  );

  const handleShare = useCallback(async () => {
    if (!playlist) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const url = `https://music.youtube.com/playlist?list=${playlist.playlistId}`;
      await Share.share({ message: `${playlist.name}\n${url}`, url });
    } catch {}
  }, [playlist]);

  const addToQueue = usePlaybackController(s => s.addToQueue);
  const handleShuffle = useCallback(() => {
    if (playableTracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMoreOpen(false);
    // Cap the shuffle queue at 30 so we don't choke playback when a
    // 50+ track playlist tries to spin up crossfade prefetch + /info
    // round-trips in parallel. User still gets 30 varied tracks queued,
    // plenty for a listening session.
    const shuffled = [...playableTracks].sort(() => Math.random() - 0.5).slice(0, 30);
    // Defer the playTrack call a tick so the ripple/haptic animations
    // get a frame to render before the blocking audio-session setup.
    requestAnimationFrame(() => {
      playTrack(shuffled[0], shuffled);
    });
  }, [playableTracks, playTrack]);

  const handleAddAllToQueue = useCallback(() => {
    if (playableTracks.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMoreOpen(false);
    playableTracks.forEach((t) => addToQueue(t));
  }, [playableTracks, addToQueue]);

  const handleDownloadAllRecommended = useCallback(async () => {
    if (recDownloadingAll || recommended.length === 0) return;
    const toDownload = recommended
      .filter(t => !isTrackDownloaded(t.id) && t.source === 'soundcloud')
      .slice(0, 20);
    if (toDownload.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRecDownloadingAll(true);
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;
    try {
      for (const track of toDownload) {
        setBatchActiveId(track.id);
        setBatchProgress(0);
        try {
          await downloadSoundCloudTrack(
            track as Track & { soundcloudUrl: string },
            backendUrl,
            (p) => setBatchProgress(p),
          );
        } catch (err) {
          console.warn('[PlaylistDetail] downloadSoundCloudTrack failed for', track.title, err);
        }
      }
    } finally {
      setBatchActiveId(null);
      setBatchProgress(0);
      setRecDownloadingAll(false);
    }
  }, [recDownloadingAll, recommended, isTrackDownloaded]);

  const handleDownloadAll = useCallback(async () => {
    if (!playlist || downloadingAll) return;
    const toDownload = tracks
      .filter(
        t =>
          !t.externalHandoffUrl?.trim() &&
          !isTrackDownloaded(t.id) &&
          !!(t.youtubeId || t.youtubeMusicId || t.soundcloudUrl),
      )
      .slice(0, 20);
    if (toDownload.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDownloadingAll(true);
    setDownloadAllProgress(0);
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;
    const n = toDownload.length;
    try {
      for (let i = 0; i < n; i++) {
        const track = toDownload[i];
        setBatchActiveId(track.id);
        setBatchProgress(0);
        setDownloadAllProgress(i / n);
        try {
          if (track.soundcloudUrl) {
            await downloadSoundCloudTrack(
              track as Track & { soundcloudUrl: string },
              backendUrl,
              p => {
                setBatchProgress(p);
                setDownloadAllProgress((i + p) / n);
              },
            );
          } else {
            await downloadYouTubeTrack(track, backendUrl, p => {
              setBatchProgress(p);
              setDownloadAllProgress((i + p) / n);
            });
          }
        } catch (err) {
          console.warn('[PlaylistDetail] batch download failed for', track.title, err);
        }
      }
      setDownloadAllProgress(1);
    } finally {
      setBatchActiveId(null);
      setBatchProgress(0);
      setDownloadingAll(false);
      setDownloadAllProgress(0);
    }
  }, [playlist, tracks, downloadingAll, isTrackDownloaded]);

  const handleAddPlaylistToLibrary = useCallback(() => {
    if (!playlist || playableTracks.length === 0) return;
    const { playlists, createPlaylist, addTracksToPlaylist } = useUserPlaylistStore.getState();
    const libName = `Library · ${playlist.name}`;
    const existing = playlists.find(p => p.name === libName);
    if (existing) {
      addTracksToPlaylist(existing.id, playableTracks);
    } else {
      createPlaylist(libName, playableTracks);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMoreOpen(false);
  }, [playlist, playableTracks]);

  const handleAddToVybeMix = useCallback(() => {
    setMoreOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(app)/vybe-mix' as never);
  }, [router]);

  const handleGoToArtist = useCallback(() => {
    const first = playableTracks[0];
    if (!first) return;
    setMoreOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(app)/artist/${encodeURIComponent(first.artistId)}` as never);
  }, [playableTracks, router]);

  const listPadBottom = stackScreenContentContainerPaddingBottom(insets.bottom);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  // Build 2x2 collage artwork from first 4 tracks
  const artworks = playlist?.tracks.slice(0, 4).map(t => t.thumbnailUrl) ?? [];

  const durationStr = useMemo(() => {
    const totalMins = Math.round(tracks.length * 3.5);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return hours > 0 ? `${hours} hr ${mins} min` : `${mins} min`;
  }, [tracks.length]);

  const artworkSig = artworks.join('|');

  const renderPlaylistRow = useCallback(
    ({ item }: ListRenderItemInfo<PlaylistDetailListItem>) => {
      if (item.type === 'house-ad' && item.kind === 'mainstreet') {
        return (
          <MainstreetTeesBannerRow
            graffitiNeonBorder={!!item.easterEgg}
            onOpenSheet={() => setMainstreetSheetOpen(true)}
          />
        );
      }
      if (item.type === 'discover-header') {
        return (
          <View style={{ marginBottom: 6, paddingHorizontal: 4 }}>
            <View style={{ borderTopWidth: 1, borderColor: '#FFFFFF10', marginBottom: 14 }} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text
                  style={{
                    fontWeight: '900',
                    letterSpacing: 2,
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: 11,
                  }}
                >
                  DISCOVER MORE
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 8 }}>
                  Vybe Waves · matched to this playlist
                </Text>
              </View>
              {recommended.length > 0 ? (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    handleDownloadAllRecommended();
                  }}
                  disabled={recDownloadingAll}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.22)',
                    backgroundColor: 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {recDownloadingAll ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MachinedCloudIcon size={20} strokeWidth={2.2} />
                  )}
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      }
      if (item.type === 'discover-skeleton') {
        if (id === DECADES_90S_PLAYLIST_ID) {
          return (
            <View key={item.id} style={{ marginBottom: 12, alignItems: 'center' }}>
              <HahaVendingSilhouette />
            </View>
          );
        }
        return (
          <View
            style={{
              height: 72,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 10,
              marginBottom: 6,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#FFFFFF10',
              backgroundColor: 'rgba(10,10,10,0.5)',
            }}
          >
            <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' }} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ height: 14, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', width: '72%', marginBottom: 8 }} />
              <View style={{ height: 12, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.05)', width: '48%' }} />
            </View>
          </View>
        );
      }
      if (item.type === 'discover-fade') {
        return (
          <View style={{ height: 52, marginBottom: 4, marginHorizontal: -8 }}>
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', '#000000']}
              locations={[0, 0.5, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          </View>
        );
      }
      if (item.type === 'discover-track') {
        const { track } = item;
        const row = (
          <PlaylistDiscoverMoreRow
            track={track}
            isBatchTarget={batchActiveId === track.id}
            batchProgress={batchProgress}
            onPress={(t) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              playTrack(t, recommended);
            }}
          />
        );
        if (!isTrackDownloaded(track.id)) return row;
        return (
          <ReanimatedSwipeable
            friction={2}
            rightThreshold={60}
            renderRightActions={(progress) => (
              <DeleteAction
                progress={progress}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  removeDownload(track.id);
                }}
              />
            )}
            onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          >
            {row}
          </ReanimatedSwipeable>
        );
      }
      if (item.type !== 'track') return null;
      const { track } = item;
      return (
        <PlaylistDetailTrackRow
          track={track}
          isActive={currentTrack?.id === track.id}
          isBatchTarget={batchActiveId === track.id}
          batchProgress={batchProgress}
          onPress={handlePlayTrack}
        />
      );
    },
    [
      id,
      currentTrack?.id,
      batchActiveId,
      batchProgress,
      handlePlayTrack,
      recommended,
      recDownloadingAll,
      handleDownloadAllRecommended,
      playTrack,
      isTrackDownloaded,
      removeDownload,
    ],
  );

  const flashKeyExtractor = useCallback((item: PlaylistDetailListItem) => {
    if (item.type === 'house-ad') return item.id;
    if (item.type === 'discover-header') return 'discover-header';
    if (item.type === 'discover-fade') return 'discover-fade';
    if (item.type === 'discover-skeleton') return item.id;
    if (item.type === 'discover-track') return `discover-${item.track.id}`;
    return item.track.id;
  }, []);

  const listHeader = useMemo(() => {
    if (!playlist) return <View />;
    return (
      <PlaylistDetailListHeader
        playlist={playlist}
        tracks={tracks}
        durationStr={durationStr}
        insetsTop={insets.top}
        artworks={artworks}
        downloadingAll={downloadingAll}
        downloadAllProgress={downloadAllProgress}
        scrollY={scrollY}
        onBack={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}
        onDownloadAll={handleDownloadAll}
        onPlayAll={handlePlayAll}
        onShuffle={handleShuffle}
        onShare={handleShare}
        onOpenMore={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setMoreOpen(true);
        }}
      />
    );
  }, [
    playlist,
    tracks,
    durationStr,
    scrollY,
    insets.top,
    artworkSig,
    downloadingAll,
    downloadAllProgress,
    router,
    handleDownloadAll,
    handlePlayAll,
    handleShuffle,
    handleShare,
  ]);

  if (loading) {
    const is90sVault = id === DECADES_90S_PLAYLIST_ID;
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
        <Pressable
          onPress={() => router.back()}
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 16,
            zIndex: 2,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(0,0,0,0.6)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={is90sVault ? '#00E5FF' : '#FF0000'} size="large" />
          {routePlaylistName ? (
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, marginTop: 16, paddingHorizontal: 32 }} numberOfLines={2}>
              Loading {routePlaylistName}…
            </Text>
          ) : null}
          {is90sVault ? (
            <View style={{ marginTop: 24 }}>
              <HahaVendingSilhouette compact />
            </View>
          ) : null}
        </View>
      </View>
    );
  }

  if (!playlist) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>
          {!id ? 'Missing playlist link' : 'Playlist not found'}
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#FF0000', fontSize: 16 }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
      <AnimatedFlashList
        data={mergedFlashData}
        keyExtractor={flashKeyExtractor}
        renderItem={renderPlaylistRow}
        estimatedItemSize={72}
        drawDistance={500}
        ListHeaderComponent={listHeader}
        extraData={`${currentTrack?.id ?? ''}-${batchActiveId ?? ''}-${batchProgress.toFixed(3)}-${mergedFlashData.length}-${recommended.length}-${recommendedLoading ? 1 : 0}`}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={HOUSE_AD_VIEWABILITY}
        contentContainerStyle={{ paddingBottom: listPadBottom, paddingHorizontal: 8 }}
      />

      <HouseAdLinkSheet
        visible={mainstreetSheetOpen}
        onClose={() => setMainstreetSheetOpen(false)}
        title="Mainstreet Tees × Vybe"
        body="Streetwear drops and custom prints built for the vault. Tap below to open the shop."
        url={HOUSE_AD_URLS.mainstreetTees}
        ctaLabel="Open store"
      />

      {/* Only mount when open — pre-mounted sheet kept full-opacity children while "closed", so rows drew over the track list (zIndex -1 is unreliable). */}
      {moreOpen ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 300 }]} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoreOpen(false)}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
          </Pressable>
          <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
            <View
              style={{
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                overflow: 'hidden',
                paddingBottom: insets.bottom + 20,
                backgroundColor: '#121212',
              }}
            >
                <View style={{ width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 10 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 12 }}>
                  <Text
                    style={{ color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: 0.5, flex: 1, marginRight: 12 }}
                    numberOfLines={1}
                  >
                    {playlist.name}
                  </Text>
                  <Pressable onPress={() => setMoreOpen(false)} hitSlop={12}>
                    <X size={22} color="rgba(255,255,255,0.55)" />
                  </Pressable>
                </View>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16 }} />
                <Pressable
                  onPress={() => {
                    setMoreOpen(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    void handleDownloadAll();
                  }}
                  style={styles.shadowSheetRow}
                  disabled={downloadingAll || tracks.length === 0}
                >
                  {downloadingAll ? (
                    <GhostSweepRing size={22} />
                  ) : (
                    <MachinedCloudIcon
                      size={22}
                      strokeWidth={2}
                      disabled={tracks.length === 0}
                    />
                  )}
                  <Text style={[styles.shadowSheetLabel, (downloadingAll || tracks.length === 0) && { color: 'rgba(255,255,255,0.35)' }]}>
                    Sync All
                  </Text>
                </Pressable>
                <Pressable onPress={handleAddPlaylistToLibrary} style={styles.shadowSheetRow}>
                  <Library size={22} color="#fff" strokeWidth={2} />
                  <Text style={styles.shadowSheetLabel}>Add to Library</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMoreOpen(false);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setCreditsOpen(true);
                  }}
                  style={styles.shadowSheetRow}
                >
                  <FileText size={22} color="#fff" strokeWidth={2} />
                  <Text style={styles.shadowSheetLabel}>View Credits</Text>
                </Pressable>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16, marginVertical: 4 }} />
                <Pressable onPress={handleShuffle} style={styles.shadowSheetRow}>
                  <Shuffle size={22} color="#fff" strokeWidth={2} />
                  <Text style={styles.shadowSheetLabel}>Shuffle play</Text>
                </Pressable>
                <Pressable onPress={handleAddAllToQueue} style={styles.shadowSheetRow}>
                  <ListPlus size={22} color="#fff" strokeWidth={2} />
                  <Text style={styles.shadowSheetLabel}>Add all to queue</Text>
                </Pressable>
                <Pressable onPress={handleAddToVybeMix} style={styles.shadowSheetRow}>
                  <Sparkles size={22} color="#fff" strokeWidth={2} />
                  <Text style={styles.shadowSheetLabel}>Add to Vybe Mix</Text>
                </Pressable>
                <Pressable onPress={handleGoToArtist} style={styles.shadowSheetRow} disabled={tracks.length === 0}>
                  <User size={22} color={tracks.length === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} strokeWidth={2} />
                  <Text style={[styles.shadowSheetLabel, tracks.length === 0 && { color: 'rgba(255,255,255,0.35)' }]}>
                    Go to Artist
                  </Text>
                </Pressable>
                <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16, marginVertical: 4 }} />
                <Pressable
                  onPress={() => {
                    setMoreOpen(false);
                    handleShare();
                  }}
                  style={styles.shadowSheetRow}
                >
                  <Share2 size={22} color="#fff" strokeWidth={2} />
                  <Text style={styles.shadowSheetLabel}>Share playlist</Text>
                </Pressable>
              </View>
            </View>
          </View>
      ) : null}

      <Modal visible={creditsOpen} transparent animationType="fade" onRequestClose={() => setCreditsOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreditsOpen(false)}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]} />
          </Pressable>
          <View
            style={{
              maxHeight: '70%',
              backgroundColor: '#121212',
              borderRadius: 16,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: 'rgba(255,255,255,0.12)',
              overflow: 'hidden',
            }}
          >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 }}>Credits</Text>
            <Pressable onPress={() => setCreditsOpen(false)} hitSlop={12}>
              <X size={22} color="rgba(255,255,255,0.55)" />
            </Pressable>
          </View>
          <ScrollView style={{ paddingHorizontal: 16, paddingVertical: 12 }} showsVerticalScrollIndicator={false}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 12, lineHeight: 20 }}>
              Story-led playback — artists and channels behind this playlist.
            </Text>
            {playlist.tracks.map((t, i) => (
              <View
                key={`${t.videoId}-${i}`}
                style={{
                  paddingVertical: 10,
                  borderBottomWidth: i < playlist.tracks.length - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }} numberOfLines={2}>{t.title}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 }}>{t.channelName}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
        </View>
      </Modal>
    </View>
  );
}
