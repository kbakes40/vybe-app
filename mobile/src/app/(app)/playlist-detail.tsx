import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
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
  Bookmark,
  Share2,
  MoreVertical,
  Music,
} from 'lucide-react-native';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore, downloadYouTubeTrack } from '@/stores/downloadsStore';
import { api } from '@/lib/api/api';
import { Track } from '@/types/music';
import { MINI_PLAYER_HEIGHT } from './_layout';
import { DownloadButton } from '@/components/DownloadButton';

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

function YouTubeMusicBadge() {
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
        YouTube Music
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

  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);

  useEffect(() => {
    async function load() {
      try {
        const all = await api.get<CuratedPlaylist[]>('/api/youtube/playlists');
        const found = all?.find(p => p.playlistId === id);
        if (found) setPlaylist(found);
      } catch (e) {
        console.error('[PlaylistDetail] load error:', e);
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  const tracks = playlist ? playlist.tracks.map(t => toTrack(t, playlist)) : [];

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

  const handlePlayAll = useCallback(() => {
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(tracks[0], tracks);
    router.push('/nowPlaying');
  }, [tracks, playTrack, router]);

  const handlePlayTrack = useCallback((track: Track) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playTrack(track, tracks);
    router.push('/nowPlaying');
  }, [tracks, playTrack, router]);

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

          {/* Gradient overlay at bottom */}
          <LinearGradient
            colors={['transparent', 'rgba(10,10,10,0.7)', '#0A0A0A']}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120 }}
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
            <YouTubeMusicBadge />
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

            {/* Save */}
            <Pressable
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
              style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: 'rgba(255,255,255,0.1)',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Bookmark size={20} color="#fff" />
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
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
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
              onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
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
      </ScrollView>

    </View>
  );
}
