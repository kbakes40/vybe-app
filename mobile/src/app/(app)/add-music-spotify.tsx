import React, { useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { X, Link2, Play } from 'lucide-react-native';
import { DownloadButton } from '@/components/DownloadButton';
import { Track } from '@/types/music';
import { usePlaybackController } from '@/stores/playbackController';
import { enqueueDownload, downloadYouTubeTrack } from '@/stores/downloadsStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

interface SpotifyTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  durationMs: number;
}

interface SpotifyResult {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  tracks: SpotifyTrack[];
}

interface SpotifyTrackResult {
  trackId: string;
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationMs: number;
}

function extractSpotifyPlaylistId(url: string): string | null {
  const m = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

function extractSpotifyTrackId(url: string): string | null {
  const m = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

export default function AddMusicSpotifyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const playTrack = usePlaybackController(s => s.playTrack);

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SpotifyResult | null>(null);
  const [trackResult, setTrackResult] = useState<SpotifyTrackResult | null>(null);

  const playlistId = extractSpotifyPlaylistId(url);
  const trackId = extractSpotifyTrackId(url);
  const isValidUrl = !!(playlistId || trackId);

  const clearResults = () => { setResult(null); setTrackResult(null); setError(null); };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text?.includes('open.spotify.com')) {
        setUrl(text.trim());
        clearResults();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {}
  };

  const handleLoad = async () => {
    if (!isValidUrl) return;
    setLoading(true);
    clearResults();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (trackId) {
        const resp = await fetch(`${BACKEND_URL}/api/spotify/track/${trackId}`);
        if (!resp.ok) throw new Error('Failed to fetch track');
        const json = await resp.json();
        if (!json.data) throw new Error('Track not found');
        setTrackResult(json.data);
      } else if (playlistId) {
        const resp = await fetch(`${BACKEND_URL}/api/spotify/playlist/${playlistId}`);
        if (!resp.ok) throw new Error('Failed to fetch playlist');
        const json = await resp.json();
        if (!json.data || json.data.tracks.length === 0) throw new Error('No tracks found');
        setResult(json.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const playlistTracks: Track[] = (result?.tracks ?? []).map(t => ({
    id: `sp-yt-${t.videoId}`,
    title: t.title,
    artist: t.channelName,
    artistId: '',
    album: result?.name ?? '',
    albumId: `sp-${result?.playlistId}`,
    artwork: t.thumbnailUrl,
    duration: Math.round(t.durationMs / 1000),
    isLiked: false,
    source: 'youtube_music' as const,
    audioUrl: '',
    youtubeMusicId: t.videoId,
    youtubeMusicUrl: `https://music.youtube.com/watch?v=${t.videoId}`,
  }));

  const singleTrack: Track | null = trackResult ? {
    id: `sp-yt-${trackResult.videoId}`,
    title: trackResult.title,
    artist: trackResult.artist,
    artistId: '',
    album: '',
    albumId: '',
    artwork: trackResult.thumbnailUrl,
    duration: Math.round(trackResult.durationMs / 1000),
    isLiked: false,
    source: 'youtube_music' as const,
    audioUrl: '',
    youtubeMusicId: trackResult.videoId,
    youtubeMusicUrl: `https://music.youtube.com/watch?v=${trackResult.videoId}`,
  } : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <LinearGradient
        colors={['#0d2b1a', '#0A0A0A']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }}
      />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#000', fontSize: 18, fontWeight: '900' }}>♫</Text>
          </View>
          <View>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Spotify</Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>Plays via YouTube</Text>
          </View>
        </View>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={18} color="#fff" />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* URL input */}
          <View style={{ backgroundColor: 'rgba(29,185,84,0.08)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 12 }}>Paste Track or Playlist Link</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderWidth: 1, borderColor: isValidUrl ? '#1DB954' : 'rgba(255,255,255,0.1)', paddingHorizontal: 12, height: 44 }}>
                <Link2 size={14} color={isValidUrl ? '#1DB954' : 'rgba(255,255,255,0.3)'} />
                <TextInput
                  value={url}
                  onChangeText={t => { setUrl(t); clearResults(); }}
                  placeholder="open.spotify.com/track or /playlist/..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ flex: 1, color: '#fff', fontSize: 13, marginLeft: 8 }}
                />
                {url.length > 0 && (
                  <Pressable onPress={() => { setUrl(''); clearResults(); }} hitSlop={8}>
                    <X size={14} color="rgba(255,255,255,0.4)" />
                  </Pressable>
                )}
              </View>
              <Pressable
                onPress={handlePaste}
                style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, height: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Paste</Text>
              </Pressable>
            </View>

            {isValidUrl && !result && !trackResult && !loading && (
              <Pressable
                onPress={handleLoad}
                style={{ marginTop: 12, backgroundColor: '#1DB954', borderRadius: 12, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#000', fontWeight: '800', fontSize: 15 }}>{trackId ? 'Load Track' : 'Load Playlist'}</Text>
              </Pressable>
            )}

            {error && <Text style={{ color: '#EF4444', fontSize: 13, marginTop: 10 }}>{error}</Text>}
          </View>

          {/* Loading */}
          {loading && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size="large" color="#1DB954" />
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 14 }}>Finding tracks on YouTube…</Text>
            </View>
          )}

          {/* Results */}
          {result && (
            <View>
              {/* Playlist header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                {result.thumbnailUrl ? (
                  <Image source={{ uri: result.thumbnailUrl }} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
                ) : (
                  <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 28 }}>♫</Text>
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }} numberOfLines={1}>{result.name}</Text>
                  <Text style={{ color: '#1DB954', fontSize: 13, marginTop: 2 }}>via Spotify · {playlistTracks.length} tracks</Text>
                </View>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(playlistTracks[0], playlistTracks); }}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Play size={20} color="#000" fill="#000" style={{ marginLeft: 2 }} />
                </Pressable>
              </View>

              {/* Track list */}
              {playlistTracks.map((track, idx) => {
                const dlTrack: Track & { youtubeMusicId?: string } = { ...track, youtubeMusicId: track.youtubeMusicId };
                return (
                  <Pressable
                    key={track.id}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); playTrack(track, playlistTracks); }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
                  >
                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, width: 24 }}>{idx + 1}</Text>
                    <Image source={{ uri: track.artwork }} style={{ width: 48, height: 48, borderRadius: 6 }} contentFit="cover" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{track.title}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 1 }} numberOfLines={1}>{track.artist}</Text>
                    </View>
                    <DownloadButton track={dlTrack} size={28} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
