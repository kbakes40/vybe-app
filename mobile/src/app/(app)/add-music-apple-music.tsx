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

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

interface AppleMusicTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  durationMs: number;
}

interface AppleMusicResult {
  id: string;
  name: string;
  artist: string;
  thumbnailUrl: string;
  tracks: AppleMusicTrack[];
  type: 'album' | 'playlist';
}

function isValidAppleMusicUrl(url: string): boolean {
  return url.includes('music.apple.com') && (
    url.includes('/album/') || url.includes('/playlist/')
  );
}

export default function AddMusicAppleMusicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const playTrack = usePlaybackController(s => s.playTrack);

  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AppleMusicResult | null>(null);

  const isValid = isValidAppleMusicUrl(url);

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text?.includes('music.apple.com')) {
        setUrl(text.trim());
        setResult(null);
        setError(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {}
  };

  const handleLoad = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    setResult(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const resp = await fetch(`${BACKEND_URL}/api/apple-music/resolve?url=${encodeURIComponent(url)}`);
      if (!resp.ok) throw new Error('Failed to fetch Apple Music content');
      const json = await resp.json();
      if (!json.data || json.data.tracks.length === 0) throw new Error('No tracks found');
      setResult(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const playlistTracks: Track[] = (result?.tracks ?? []).map(t => ({
    id: `am-yt-${t.videoId}`,
    title: t.title,
    artist: t.channelName,
    artistId: '',
    album: result?.name ?? '',
    albumId: `am-${result?.id}`,
    artwork: t.thumbnailUrl,
    duration: Math.round(t.durationMs / 1000),
    isLiked: false,
    source: 'youtube_music' as const,
    audioUrl: '',
    youtubeMusicId: t.videoId,
    youtubeMusicUrl: `https://music.youtube.com/watch?v=${t.videoId}`,
  }));

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <LinearGradient
        colors={['#2d0a10', '#0A0A0A']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }}
      />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FC3C44', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '900' }}>♪</Text>
          </View>
          <View>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Apple Music</Text>
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
          <View style={{ backgroundColor: 'rgba(252,60,68,0.08)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 12 }}>Paste Album or Playlist Link</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderWidth: 1, borderColor: isValid ? '#FC3C44' : 'rgba(255,255,255,0.1)', paddingHorizontal: 12, height: 44 }}>
                <Link2 size={14} color={isValid ? '#FC3C44' : 'rgba(255,255,255,0.3)'} />
                <TextInput
                  value={url}
                  onChangeText={t => { setUrl(t); setResult(null); setError(null); }}
                  placeholder="music.apple.com/album or /playlist/..."
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={{ flex: 1, color: '#fff', fontSize: 13, marginLeft: 8 }}
                />
                {url.length > 0 && (
                  <Pressable onPress={() => { setUrl(''); setResult(null); setError(null); }} hitSlop={8}>
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

            {isValid && !result && !loading && (
              <Pressable
                onPress={handleLoad}
                style={{ marginTop: 12, backgroundColor: '#FC3C44', borderRadius: 12, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>Load Content</Text>
              </Pressable>
            )}

            {error && <Text style={{ color: '#EF4444', fontSize: 13, marginTop: 10 }}>{error}</Text>}
          </View>

          {/* Hint */}
          {!result && !loading && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 20 }}>
                Supports Apple Music <Text style={{ color: '#FC3C44', fontWeight: '600' }}>albums</Text> and <Text style={{ color: '#FC3C44', fontWeight: '600' }}>playlists</Text>. Tracks are matched and played via YouTube.
              </Text>
            </View>
          )}

          {/* Loading */}
          {loading && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size="large" color="#FC3C44" />
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 14 }}>Finding tracks on YouTube…</Text>
            </View>
          )}

          {/* Results */}
          {result && (
            <View>
              {/* Content header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                {result.thumbnailUrl ? (
                  <Image source={{ uri: result.thumbnailUrl }} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
                ) : (
                  <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: '#FC3C44', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 28 }}>♪</Text>
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }} numberOfLines={1}>{result.name}</Text>
                  <Text style={{ color: '#FC3C44', fontSize: 13, marginTop: 2 }}>
                    {result.artist ? `${result.artist} · ` : ''}{result.type === 'album' ? 'Album' : 'Playlist'} · {playlistTracks.length} tracks
                  </Text>
                </View>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(playlistTracks[0], playlistTracks); }}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#FC3C44', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Play size={20} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
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
