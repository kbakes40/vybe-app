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
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Svg, Circle } from 'react-native-svg';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft,
  Play,
  Download,
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
  CloudDownload,
} from 'lucide-react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { SharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
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
import { usePlaylistHeroColors } from '@/lib/usePlaylistHeroColors';
import { api } from '@/lib/api/api';
import { createMMKVCache, TTL } from '@/lib/mmkv-cache';
import { Track } from '@/types/music';
import { MINI_PLAYER_HEIGHT } from './_layout';
import { DownloadButton, GhostSweepRing } from '@/components/DownloadButton';
import { useUserPlaylistStore } from '@/stores/userPlaylistStore';
import { PlaylistDetailTrackRow } from '@/components/PlaylistDetailTrackRow';
import { preResolveSoundcloudStreamUrl } from '@/lib/soundcloudStreamPreloadCache';
import { preResolveYoutubeVideoId } from '@/lib/youtubeResolvePreloadCache';

// Read from the same caches Home / Discover write to so we can resolve the
// playlist immediately even if the fresh API response drifts.
const homeMMKV = createMMKVCache('vybe-home');
const discoverMMKV = createMMKVCache('vybe-discover');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HALF = (SCREEN_WIDTH) / 2;

const ACTION_SIZE = 48;

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

function VybeMusicBadge() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{
        width: 22, height: 22, backgroundColor: '#FF0000', borderRadius: 11,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <View style={{
          width: 0, height: 0,
          borderLeftWidth: 7, borderTopWidth: 4.5, borderBottomWidth: 4.5,
          borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent',
          marginLeft: 2,
        }} />
      </View>
      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15, marginLeft: 8 }}>
        Vybe Music
      </Text>
    </View>
  );
}

type PlaylistDetailListHeaderProps = {
  playlist: CuratedPlaylist;
  tracks: Track[];
  durationStr: string;
  heroGlow: string;
  insetsTop: number;
  artworks: string[];
  downloadingAll: boolean;
  downloadAllProgress: number;
  onBack: () => void;
  onDownloadAll: () => void;
  onPlayAll: () => void;
  onShare: () => void;
  onOpenMore: () => void;
};

function PlaylistDetailListHeader({
  playlist,
  tracks,
  durationStr,
  heroGlow,
  insetsTop,
  artworks,
  downloadingAll,
  downloadAllProgress,
  onBack,
  onDownloadAll,
  onPlayAll,
  onShare,
  onOpenMore,
}: PlaylistDetailListHeaderProps) {
  return (
    <>
      <View style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH, position: 'relative' }}>
        {artworks.length >= 4 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: SCREEN_WIDTH, height: SCREEN_WIDTH }}>
            {artworks.map((uri, i) => (
              <Image
                key={i}
                source={{ uri }}
                style={{ width: HALF, height: HALF }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
              />
            ))}
          </View>
        ) : artworks.length > 0 ? (
          <Image
            source={{ uri: artworks[0] }}
            style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
        ) : (
          <View style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH, backgroundColor: '#1C1C1C', alignItems: 'center', justifyContent: 'center' }}>
            <Music size={80} color="rgba(255,255,255,0.2)" />
          </View>
        )}

        <LinearGradient
          colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.22)', 'transparent']}
          locations={[0, 0.42, 1]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 170, zIndex: 1 }}
          pointerEvents="none"
        />

        <LinearGradient
          colors={['transparent', `${heroGlow}55`, '#0A0A0A'] as unknown as readonly [string, string, ...string[]]}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 160 }}
          pointerEvents="none"
        />

        <Pressable
          onPress={onBack}
          style={{
            position: 'absolute',
            top: insetsTop + 8,
            left: 16,
            zIndex: 10,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeft size={24} color="#fff" />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: 20, marginTop: 12 }}>
        {/* Title + credits — 16px+ breathing room before the glass / sync controls */}
        <View style={{ marginBottom: 16, paddingBottom: 4 }}>
          <Text
            style={{
              color: '#fff',
              fontSize: 26,
              fontWeight: '800',
              letterSpacing: -0.5,
              marginBottom: 10,
            }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {playlist.name}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <VybeMusicBadge />
            <Text
              style={{
                color: 'rgba(255,255,255,0.45)',
                fontSize: 13,
                marginLeft: 10,
                flexShrink: 1,
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {`${tracks.length} songs · ${durationStr}`}
            </Text>
          </View>
        </View>

        {/* Action bar — fixed row height; Play expands, circular actions stay full size */}
        <View
          style={{
            height: 60,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 16,
            marginTop: 4,
          }}
        >
          <Pressable
            onPress={onPlayAll}
            style={{
              flex: 1,
              minWidth: 0,
              height: ACTION_SIZE,
              borderRadius: ACTION_SIZE / 2,
              backgroundColor: 'rgba(255,255,255,0.9)',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              ...Platform.select({
                ios: {
                  shadowColor: '#8B5CF6',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
                  shadowRadius: 14,
                },
                android: {
                  elevation: 10,
                },
                default: {},
              }),
            }}
          >
            <Play size={20} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 3 }} />
            <Text style={{ color: '#0A0A0A', fontWeight: '800', fontSize: 15, marginLeft: 8, letterSpacing: 0.35 }}>
              Play All
            </Text>
          </Pressable>

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
                <GhostSweepRing size={24} />
              ) : (
                <ShadowProgressRing size={24} progress={downloadAllProgress} />
              )
            ) : (
              <Download size={20} color="#FFFFFF" strokeWidth={2} />
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

      <View style={{ marginTop: 28, paddingHorizontal: 4 }}>
        <Text style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12, fontWeight: '600', letterSpacing: 0.6, marginLeft: 12, marginBottom: 6 }}>
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

  const tracks = playlist ? playlist.tracks.map(t => toTrack(t, playlist)) : [];

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

  // Warm first 5 recommended SoundCloud streams + artwork (instant tap).
  useEffect(() => {
    if (recommended.length === 0) return;
    for (const t of recommended.slice(0, 5)) {
      if (t.soundcloudUrl) preResolveSoundcloudStreamUrl(t.soundcloudUrl);
    }
    const arts = recommended.slice(0, 8).map(t => t.artwork).filter(Boolean);
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
  const handlePlayAll = useCallback(() => {
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(tracks[0], tracks);
  }, [tracks, playTrack]);

  const handlePlayTrack = useCallback((track: Track) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playTrack(track, tracks);
  }, [tracks, playTrack]);

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
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMoreOpen(false);
    // Cap the shuffle queue at 30 so we don't choke playback when a
    // 50+ track playlist tries to spin up crossfade prefetch + /info
    // round-trips in parallel. User still gets 30 varied tracks queued,
    // plenty for a listening session.
    const shuffled = [...tracks].sort(() => Math.random() - 0.5).slice(0, 30);
    // Defer the playTrack call a tick so the ripple/haptic animations
    // get a frame to render before the blocking audio-session setup.
    requestAnimationFrame(() => {
      playTrack(shuffled[0], shuffled);
    });
  }, [tracks, playTrack]);

  const handleAddAllToQueue = useCallback(() => {
    if (tracks.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMoreOpen(false);
    tracks.forEach(t => addToQueue(t));
  }, [tracks, addToQueue]);

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
    if (!playlist || tracks.length === 0) return;
    const { playlists, createPlaylist, addTracksToPlaylist } = useUserPlaylistStore.getState();
    const libName = `Library · ${playlist.name}`;
    const existing = playlists.find(p => p.name === libName);
    if (existing) {
      addTracksToPlaylist(existing.id, tracks);
    } else {
      createPlaylist(libName, tracks);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMoreOpen(false);
  }, [playlist, tracks]);

  const handleAddToVybeMix = useCallback(() => {
    setMoreOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(app)/vybe-mix' as never);
  }, [router]);

  const handleGoToArtist = useCallback(() => {
    const first = tracks[0];
    if (!first) return;
    setMoreOpen(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(app)/artist/${encodeURIComponent(first.artistId)}` as never);
  }, [tracks, router]);

  const showMiniPlayer = !!currentTrack;
  const bottomPadding = insets.bottom + (showMiniPlayer ? MINI_PLAYER_HEIGHT : 0) + 32;

  // Build 2x2 collage artwork from first 4 tracks
  const artworks = playlist?.tracks.slice(0, 4).map(t => t.thumbnailUrl) ?? [];
  // Dominant-color palette pulled from the first track's thumbnail so the
  // fade into the track list matches the artwork.
  const heroColors = usePlaylistHeroColors(artworks[0]);

  const durationStr = useMemo(() => {
    const totalMins = Math.round(tracks.length * 3.5);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return hours > 0 ? `${hours} hr ${mins} min` : `${mins} min`;
  }, [tracks.length]);

  const artworkSig = artworks.join('|');

  const renderPlaylistTrack = useCallback(
    ({ item }: ListRenderItemInfo<Track>) => (
      <PlaylistDetailTrackRow
        track={item}
        isActive={currentTrack?.id === item.id}
        isBatchTarget={batchActiveId === item.id}
        batchProgress={batchProgress}
        onPress={handlePlayTrack}
      />
    ),
    [currentTrack?.id, batchActiveId, batchProgress, handlePlayTrack],
  );

  const listHeader = useMemo(() => {
    if (!playlist) return <View />;
    return (
      <PlaylistDetailListHeader
        playlist={playlist}
        tracks={tracks}
        durationStr={durationStr}
        heroGlow={heroColors.glow}
        insetsTop={insets.top}
        artworks={artworks}
        downloadingAll={downloadingAll}
        downloadAllProgress={downloadAllProgress}
        onBack={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}
        onDownloadAll={handleDownloadAll}
        onPlayAll={handlePlayAll}
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
    heroColors.glow,
    insets.top,
    artworkSig,
    downloadingAll,
    downloadAllProgress,
    router,
    handleDownloadAll,
    handlePlayAll,
    handleShare,
  ]);

  const listFooter = useMemo(() => {
    if (!(recommended.length > 0 || recommendedLoading)) return null;
    return (
      <View
        style={{
          marginTop: 8,
          marginHorizontal: 4,
          paddingBottom: 24,
          paddingTop: 12,
          borderWidth: 0.5,
          borderColor: 'rgba(212, 175, 55, 0.4)',
          borderRadius: 14,
          backgroundColor: 'rgba(255,255,255,0.02)',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, paddingHorizontal: 12 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              backgroundColor: 'rgba(255,255,255,0.1)',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
            }}
          >
            <Music size={14} color="rgba(255,255,255,0.92)" strokeWidth={2} />
          </View>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Recommended</Text>
          <View style={{ flex: 1 }} />
          {recommended.length > 0 ? (
            <Pressable
              onPress={handleDownloadAllRecommended}
              disabled={recDownloadingAll}
              style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: recDownloadingAll ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.14)',
                alignItems: 'center', justifyContent: 'center',
                marginRight: 4,
              }}
            >
              {recDownloadingAll
                ? <ActivityIndicator size="small" color="#fff" />
                : <Download size={18} color="#fff" strokeWidth={2.5} />
              }
            </Pressable>
          ) : null}
        </View>
        <Text style={{ color: '#999999', fontSize: 13, marginBottom: 14, paddingHorizontal: 12 }}>Similar tracks from Vybe Waves</Text>
        {recommendedLoading && recommended.length === 0 ? (
          <View style={{ paddingVertical: 16, paddingHorizontal: 12, gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                <View style={{ flex: 1, marginLeft: 14, gap: 6 }}>
                  <View style={{ height: 14, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', width: '72%' }} />
                  <View style={{ height: 12, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.05)', width: '48%' }} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          recommended.map((track) => {
            const isBatchTarget = batchActiveId === track.id;
            const pct = Math.round(batchProgress * 100);
            const isDownloaded = isTrackDownloaded(track.id);
            const row = (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, recommended); }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 14,
                  paddingHorizontal: 6,
                  borderRadius: 10,
                  borderWidth: 0.5,
                  borderColor: 'rgba(212, 175, 55, 0.12)',
                  backgroundColor: isBatchTarget ? 'rgba(139,92,246,0.12)' : 'transparent',
                  marginBottom: 6,
                }}
              >
                <Image
                  source={{ uri: track.artwork }}
                  style={{ width: 52, height: 52, borderRadius: 8 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={track.id}
                  transition={120}
                />
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{track.title}</Text>
                  <Text style={{ color: '#999999', fontWeight: '400', fontSize: 13, marginTop: 3 }} numberOfLines={1}>{track.artist}</Text>
                  {isBatchTarget ? (
                    <View style={{ marginTop: 8, height: 3, borderRadius: 2, backgroundColor: 'rgba(139,92,246,0.2)', overflow: 'hidden' }}>
                      <View style={{ height: 3, width: `${Math.max(2, pct)}%`, backgroundColor: '#8B5CF6' }} />
                    </View>
                  ) : null}
                </View>
                <View style={{ padding: 4, minWidth: 44, alignItems: 'center' }}>
                  {isBatchTarget ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.2)' }}>
                      <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
                    </View>
                  ) : (
                    <DownloadButton track={track} size={26} idleColor="rgba(255,255,255,0.88)" />
                  )}
                </View>
              </Pressable>
            );

            if (!isDownloaded) return <View key={track.id}>{row}</View>;

            return (
              <ReanimatedSwipeable
                key={track.id}
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
          })
        )}
      </View>
    );
  }, [
    recommended,
    recommendedLoading,
    batchActiveId,
    batchProgress,
    playTrack,
    recDownloadingAll,
    handleDownloadAllRecommended,
    isTrackDownloaded,
    removeDownload,
  ]);

  if (loading) {
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
          <ActivityIndicator color="#FF0000" size="large" />
          {routePlaylistName ? (
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, marginTop: 16, paddingHorizontal: 32 }} numberOfLines={2}>
              Loading {routePlaylistName}…
            </Text>
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
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <FlashList
        data={tracks}
        keyExtractor={(item) => item.id}
        renderItem={renderPlaylistTrack}
        estimatedItemSize={84}
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        extraData={`${currentTrack?.id ?? ''}-${batchActiveId ?? ''}-${batchProgress.toFixed(3)}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPadding, paddingHorizontal: 8 }}
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
              <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
              <View style={{ backgroundColor: 'rgba(18,18,18,0.92)' }}>
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
                  <CloudDownload size={22} color={downloadingAll || tracks.length === 0 ? 'rgba(255,255,255,0.35)' : '#fff'} strokeWidth={2} />
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
