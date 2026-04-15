import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
  Share,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
} from 'lucide-react-native';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore, downloadYouTubeTrack } from '@/stores/downloadsStore';
import { usePlaylistHeroColors } from '@/lib/usePlaylistHeroColors';
import { api } from '@/lib/api/api';
import { createMMKVCache, TTL } from '@/lib/mmkv-cache';
import { Track } from '@/types/music';
import { MINI_PLAYER_HEIGHT } from './_layout';
import { DownloadButton } from '@/components/DownloadButton';

// Read from the same caches Home / Discover write to so we can resolve the
// playlist immediately even if the fresh API response drifts.
const homeMMKV = createMMKVCache('vybe-home');
const discoverMMKV = createMMKVCache('vybe-discover');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HALF = (SCREEN_WIDTH) / 2;

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
}

function toTrack(t: PlaylistTrack, playlist: CuratedPlaylist): Track {
  return {
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

export default function PlaylistDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [playlist, setPlaylist] = useState<CuratedPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Recommended SoundCloud tracks based on the playlist's name keywords.
  const [recommended, setRecommended] = useState<Track[]>([]);
  const [recommendedLoading, setRecommendedLoading] = useState(false);

  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);

  useEffect(() => {
    async function load() {
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
        const tracksData = await api.get<Array<{ videoId: string; title: string; channel: string; thumbnail: string; duration: number }>>(`/api/youtube/playlist-tracks?listId=${encodeURIComponent(id)}`);
        if (tracksData && tracksData.length > 0) {
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
    if (id) load();
  }, [id]);

  const tracks = playlist ? playlist.tracks.map(t => toTrack(t, playlist)) : [];

  // Lazy-fetch SoundCloud recommendations once playlist name is known.
  useEffect(() => {
    if (!playlist?.name) return;
    let cancelled = false;
    setRecommendedLoading(true);
    // Drop common filler words ("essentials", "playlist", "mix", etc.) so we
    // pass the actual genre/vibe terms to SoundCloud.
    const cleaned = playlist.name
      .toLowerCase()
      .replace(/essentials|playlist|mix|hits|classics|greatest|the best of/gi, '')
      .replace(/\s+/g, ' ')
      .trim() || playlist.name;

    const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
    fetch(`${backendBase}/api/soundcloud/search?q=${encodeURIComponent(cleaned)}&maxResults=20`)
      .then(r => (r.ok ? r.json() : null))
      .then(json => {
        if (cancelled) return;
        const items = (json?.data ?? []) as Array<{ trackId: string; title: string; artist: string; artwork: string; duration: number; soundcloudUrl: string }>;
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
        setRecommended(mapped);
      })
      .catch(() => { /* silent — non-essential */ })
      .finally(() => { if (!cancelled) setRecommendedLoading(false); });

    return () => { cancelled = true; };
  }, [playlist?.name]);

  // Pre-warm CDN URL cache for the first 8 tracks so playback is instant
  useEffect(() => {
    if (tracks.length === 0) return;
    const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
    tracks.slice(0, 8).forEach(track => {
      const videoId = track.youtubeId || track.youtubeMusicId;
      if (videoId) {
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
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  }, [tracks, playTrack]);

  const handleAddAllToQueue = useCallback(() => {
    if (tracks.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMoreOpen(false);
    tracks.forEach(t => addToQueue(t));
  }, [tracks, addToQueue]);

  const handleDownloadAll = useCallback(async () => {
    if (!playlist || downloadingAll) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDownloadingAll(true);
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL!;
    for (const track of tracks) {
      if (!isTrackDownloaded(track.id)) {
        await downloadYouTubeTrack(track, backendUrl);
      }
    }
    setDownloadingAll(false);
  }, [playlist, tracks, downloadingAll, isTrackDownloaded]);

  const showMiniPlayer = !!currentTrack;
  const bottomPadding = insets.bottom + (showMiniPlayer ? MINI_PLAYER_HEIGHT : 0) + 32;

  // Build 2x2 collage artwork from first 4 tracks
  const artworks = playlist?.tracks.slice(0, 4).map(t => t.thumbnailUrl) ?? [];
  // Dominant-color palette pulled from the first track's thumbnail so the
  // fade into the track list matches the artwork.
  const heroColors = usePlaylistHeroColors(artworks[0]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FF0000" size="large" />
      </View>
    );
  }

  if (!playlist) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>Playlist not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#FF0000', fontSize: 16 }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const totalMins = Math.round(tracks.length * 3.5);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const durationStr = hours > 0 ? `${hours} hr ${mins} min` : `${mins} min`;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
      >
        {/* Artwork Collage */}
        <View style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH, position: 'relative' }}>
          {artworks.length >= 4 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: SCREEN_WIDTH, height: SCREEN_WIDTH }}>
              {artworks.map((uri, i) => (
                <Image
                  key={i}
                  source={{ uri }}
                  style={{ width: HALF, height: HALF }}
                  contentFit="cover"
                />
              ))}
            </View>
          ) : artworks.length > 0 ? (
            <Image
              source={{ uri: artworks[0] }}
              style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH }}
              contentFit="cover"
            />
          ) : (
            <View style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH, backgroundColor: '#1C1C1C', alignItems: 'center', justifyContent: 'center' }}>
              <Music size={80} color="rgba(255,255,255,0.2)" />
            </View>
          )}

          {/* Gradient overlay at bottom — dominant-color fade blending the
              collage into the dark track list area. */}
          <LinearGradient
            colors={['transparent', `${heroColors.glow}55`, '#0A0A0A'] as unknown as readonly [string, string, ...string[]]}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 160 }}
          />

          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            style={{
              position: 'absolute',
              top: insets.top + 8,
              left: 16,
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
        </View>

        {/* Playlist Info */}
        <View style={{ paddingHorizontal: 20, marginTop: -8 }}>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 }} numberOfLines={2}>
            {playlist.name}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
            <VybeMusicBadge />
          </View>

          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 6 }}>
            {tracks.length} songs • {durationStr}
          </Text>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 20, gap: 12 }}>
            {/* Download all */}
            <Pressable
              onPress={handleDownloadAll}
              disabled={downloadingAll}
              style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {downloadingAll
                ? <ActivityIndicator size="small" color="#fff" />
                : <Download size={20} color="#fff" />
              }
            </Pressable>

            {/* Play all — big center button */}
            <Pressable
              onPress={handlePlayAll}
              style={{
                flex: 1, height: 50, borderRadius: 25,
                backgroundColor: '#fff',
                alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row',
              }}
            >
              <Play size={20} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 3 }} />
              <Text style={{ color: '#0A0A0A', fontWeight: '700', fontSize: 15, marginLeft: 6 }}>
                Play All
              </Text>
            </Pressable>

            {/* Share */}
            <Pressable
              onPress={handleShare}
              style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Share2 size={20} color="#fff" />
            </Pressable>

            {/* More */}
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMoreOpen(true); }}
              style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <MoreVertical size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* More-actions bottom sheet */}
        <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'transparent' }} onPress={() => setMoreOpen(false)}>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => {}} style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: insets.bottom + 16 }}>
              <View style={{ width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 8 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{playlist.name}</Text>
                <Pressable onPress={() => setMoreOpen(false)} hitSlop={10}><X size={22} color="rgba(255,255,255,0.6)" /></Pressable>
              </View>
              <Pressable onPress={handleShuffle} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18 }}>
                <Shuffle size={22} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500', marginLeft: 16 }}>Shuffle play</Text>
              </Pressable>
              <Pressable onPress={handleAddAllToQueue} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18 }}>
                <ListPlus size={22} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500', marginLeft: 16 }}>Add all to queue</Text>
              </Pressable>
              <Pressable onPress={() => { setMoreOpen(false); handleShare(); }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18 }}>
                <Share2 size={22} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500', marginLeft: 16 }}>Share playlist</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Track List */}
        <View style={{ marginTop: 24, paddingHorizontal: 16 }}>
          {tracks.map((track) => {
            const isActive = currentTrack?.id === track.id;
            return (
              <Pressable
                key={track.id}
                onPress={() => handlePlayTrack(track)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 4,
                  borderRadius: 8,
                  backgroundColor: isActive ? 'rgba(255,0,0,0.08)' : 'transparent',
                  marginBottom: 2,
                }}
              >
                {/* Artwork */}
                <Image
                  source={{ uri: track.artwork }}
                  style={{ width: 50, height: 50, borderRadius: 6 }}
                  contentFit="cover"
                />

                {/* Track info */}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text
                    style={{
                      color: isActive ? '#FF0000' : '#fff',
                      fontWeight: isActive ? '700' : '500',
                      fontSize: 14,
                    }}
                    numberOfLines={1}
                  >
                    {track.title}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                    {track.artist}
                  </Text>
                </View>

                {/* Download button */}
                <View style={{ padding: 4 }}>
                  <DownloadButton
                    track={track}
                    size={26}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Recommended — SoundCloud tracks similar to this playlist */}
        {recommended.length > 0 || recommendedLoading ? (
          <View style={{ marginTop: 32, paddingHorizontal: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
              <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: '#FF5500', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                <Music size={11} color="#fff" strokeWidth={2.5} />
              </View>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Recommended</Text>
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 12 }}>Similar tracks from Vybe Waves</Text>
            {recommendedLoading && recommended.length === 0 ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator color="#FF5500" />
              </View>
            ) : (
              recommended.map((track) => (
                <Pressable
                  key={track.id}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, recommended); }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 8 }}
                >
                  <Image source={{ uri: track.artwork }} style={{ width: 50, height: 50, borderRadius: 6 }} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: '#fff', fontWeight: '500', fontSize: 14 }} numberOfLines={1}>{track.title}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{track.artist}</Text>
                  </View>
                  <View style={{ padding: 4 }}>
                    <DownloadButton track={track} size={26} />
                  </View>
                </Pressable>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

    </View>
  );
}
