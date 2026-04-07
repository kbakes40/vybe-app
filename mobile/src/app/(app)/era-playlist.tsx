import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Play, Download } from 'lucide-react-native';
import { usePlaybackController } from '@/stores/playbackController';
import { DownloadButton } from '@/components/DownloadButton';
import { api } from '@/lib/api/api';
import { Track } from '@/types/music';
import { MINI_PLAYER_HEIGHT } from './_layout';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface PlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
}

function toTrack(t: PlaylistTrack, playlistName: string): Track {
  return {
    id: `ytm-${t.videoId}`,
    title: t.title,
    artist: t.channelName,
    artistId: '',
    album: playlistName,
    albumId: '',
    artwork: t.thumbnailUrl,
    duration: 0,
    isLiked: false,
    source: 'youtube_music' as const,
    youtubeId: t.videoId,
    youtubeMusicId: t.videoId,
  };
}

export default function EraPlaylistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { name, query, image, color } = useLocalSearchParams<{
    name: string;
    query: string;
    image: string;
    color: string;
  }>();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);

  useEffect(() => {
    async function load() {
      if (!query) return;
      setLoading(true);
      try {
        const res = await api.get<PlaylistTrack[]>(
          `/api/youtube/search?q=${encodeURIComponent(query)}&maxResults=20`
        );
        const loaded = (res ?? []).map(t => toTrack(t, name ?? ''));
        setTracks(loaded);

        // Pre-warm CDN URLs for instant playback
        const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
        loaded.slice(0, 6).forEach(t => {
          const id = t.youtubeMusicId;
          if (id) fetch(`${backendBase}/api/youtube/warm/${id}`).catch(() => {});
        });
      } catch {}
      setLoading(false);
    }
    load();
  }, [query, name]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(tracks[0], tracks);
    router.push('/nowPlaying' as never);
  }, [tracks, playTrack, router]);

  const handlePlayTrack = useCallback((track: Track) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playTrack(track, tracks);
    router.push('/nowPlaying' as never);
  }, [tracks, playTrack, router]);

  const accentColor = color ?? '#8B5CF6';
  const showMiniPlayer = !!currentTrack;
  const bottomPadding = insets.bottom + (showMiniPlayer ? MINI_PLAYER_HEIGHT : 0) + 32;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
      >
        {/* Hero */}
        <View style={{ width: SCREEN_WIDTH, height: 280, position: 'relative' }}>
          {image ? (
            <Image
              source={{ uri: image }}
              style={{ width: SCREEN_WIDTH, height: 280 }}
              contentFit="cover"
            />
          ) : (
            <View style={{ width: SCREEN_WIDTH, height: 280, backgroundColor: accentColor }} />
          )}
          <LinearGradient
            colors={['transparent', 'rgba(10,10,10,0.6)', '#0A0A0A']}
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
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Info */}
        <View style={{ paddingHorizontal: 20, marginTop: -16 }}>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 }}>
            {name}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 4 }}>
            Time Traveler Radio · YouTube Music
          </Text>
          {!loading && (
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 2 }}>
              {tracks.length} songs
            </Text>
          )}

          {/* Play All button */}
          <Pressable
            onPress={handlePlayAll}
            disabled={loading || tracks.length === 0}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 20,
              height: 50,
              borderRadius: 25,
              backgroundColor: loading || tracks.length === 0 ? 'rgba(255,255,255,0.2)' : '#fff',
            }}
          >
            <Play size={20} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 3 }} />
            <Text style={{ color: '#0A0A0A', fontWeight: '700', fontSize: 15, marginLeft: 6 }}>
              Play All
            </Text>
          </Pressable>
        </View>

        {/* Track list */}
        <View style={{ marginTop: 24, paddingHorizontal: 16 }}>
          {loading ? (
            <ActivityIndicator color="#8B5CF6" size="large" style={{ marginTop: 40 }} />
          ) : tracks.length === 0 ? (
            <Text style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 40 }}>
              No songs found
            </Text>
          ) : (
            tracks.map((track) => {
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
                    backgroundColor: isActive ? 'rgba(139,92,246,0.1)' : 'transparent',
                    marginBottom: 2,
                  }}
                >
                  <Image
                    source={{ uri: track.artwork }}
                    style={{ width: 50, height: 50, borderRadius: 6 }}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text
                      style={{
                        color: isActive ? accentColor : '#fff',
                        fontWeight: isActive ? '700' : '500',
                        fontSize: 14,
                      }}
                      numberOfLines={1}
                    >
                      {track.title}
                    </Text>
                    <Text
                      style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}
                      numberOfLines={1}
                    >
                      {track.artist}
                    </Text>
                  </View>
                  <View style={{ padding: 4 }}>
                    <DownloadButton track={track} size={26} />
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
