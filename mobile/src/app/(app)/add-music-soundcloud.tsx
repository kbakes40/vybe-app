import React, { useState, useCallback } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { X, Link2, Search, Play } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { DownloadButton } from '@/components/DownloadButton';
import { LoadingRing } from '@/components/LoadingRing';
import { Track } from '@/types/music';
import { usePlaybackController } from '@/stores/playbackController';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

// ── Icon ──────────────────────────────────────────────────────────────────────

function SoundCloudIcon({ size = 20 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size * 0.6, alignItems: 'center', justifyContent: 'center', marginTop: size * 0.2 }}>
      <Text style={{ color: '#FF5500', fontSize: size * 0.7, fontWeight: '900', letterSpacing: -1 }}>))))</Text>
    </View>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SCSearchResult {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
}

interface SCImportTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl?: string;
  audioUrl?: string;
}

// ── Paste Section ─────────────────────────────────────────────────────────────

function PasteSection() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scInfo, setScInfo] = useState<SCImportTrack | null>(null);
  const [relatedTracks, setRelatedTracks] = useState<SCSearchResult[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const playTrack = usePlaybackController(s => s.playTrack);
  const router = useRouter();

  const clear = () => { setScInfo(null); setError(null); setRelatedTracks([]); setPlayingId(null); };

  const handleLookup = useCallback(async (overrideUrl?: string) => {
    const target = (overrideUrl ?? url).trim();
    if (!target) return;
    clear(); setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (!target.includes('soundcloud.com/')) throw new Error('Paste a SoundCloud track URL');
      const resp = await fetch(`${BACKEND_URL}/api/soundcloud/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target, tags: [] }),
      });
      if (!resp.ok) throw new Error('Failed to import SoundCloud track');
      const json = await resp.json();
      const track: SCImportTrack = json.data?.track ?? json.track;
      setScInfo(track);
      if (track?.artist) {
        const relatedResp = await fetch(`${BACKEND_URL}/api/soundcloud/search?q=${encodeURIComponent(track.artist)}&maxResults=6`);
        if (relatedResp.ok) {
          const relatedJson = await relatedResp.json();
          const results: SCSearchResult[] = (relatedJson.data ?? []).filter(
            (r: SCSearchResult) => r.soundcloudUrl !== target
          );
          setRelatedTracks(results.slice(0, 5));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setLoading(false); }
  }, [url]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && text.includes('soundcloud.com/')) {
        setUrl(text); clear();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Auto-trigger lookup with the pasted URL directly — state is
        // still stale at this tick.
        handleLookup(text);
      }
    } catch {}
  }, [handleLookup]);

  const scTrack: (Track & { soundcloudUrl?: string }) | null = scInfo ? {
    artistId: '', album: '', albumId: '', isLiked: false,
    ...scInfo,
    source: 'soundcloud' as const,
    audioUrl: scInfo.audioUrl ?? '',
    soundcloudUrl: scInfo.soundcloudUrl ?? url,
  } : null;

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(99,102,241,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <Link2 size={16} color="#818CF8" />
        </View>
        <View>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Paste a Link</Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>SoundCloud track URL</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, height: 44 }}>
          <Link2 size={14} color="rgba(255,255,255,0.3)" />
          <TextInput
            value={url}
            onChangeText={(t) => { setUrl(t); clear(); }}
            placeholder="Paste URL here..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="none" autoCorrect={false}
            style={{ flex: 1, color: '#fff', fontSize: 13, marginLeft: 8 }}
          />
          {url.length > 0 && (
            <Pressable onPress={() => { setUrl(''); clear(); }} hitSlop={8}>
              <X size={14} color="rgba(255,255,255,0.4)" />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => { if (url) { handleLookup(); } else { handlePaste(); } }}
          style={{ backgroundColor: '#6366F1', borderRadius: 12, height: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
        >
          {loading ? <ActivityIndicator size="small" color="#fff" /> :
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{url ? 'Look Up' : 'Paste'}</Text>}
        </Pressable>
      </View>
      {error ? <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 8, marginHorizontal: 16 }}>{error}</Text> : null}

      {scTrack ? (
        <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setPlayingId(scTrack.id);
              playTrack(scTrack, [scTrack]);
              router.push('/(app)/nowPlaying' as never);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}
          >
            <View style={{ position: 'relative' }}>
              <Image source={{ uri: scTrack.artwork }} style={{ width: 56, height: 56, borderRadius: 8, opacity: playingId === scTrack.id ? 0.6 : 1 }} contentFit="cover" />
              {playingId === scTrack.id && (
                <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <Play size={20} color="#fff" fill="#fff" />
                </View>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: playingId === scTrack.id ? '#FF5500' : '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={2}>{scTrack.title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>{scTrack.artist}</Text>
            </View>
            <View onStartShouldSetResponder={() => true}>
              <DownloadButton track={scTrack} size={32} />
            </View>
          </Pressable>

          {relatedTracks.length > 0 ? (
            <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', paddingTop: 8, paddingBottom: 4 }}>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 12, marginBottom: 8 }}>
                More from {scTrack.artist}
              </Text>
              {relatedTracks.map((r) => {
                const t: Track & { soundcloudUrl?: string } = {
                  id: `sc-${r.trackId}`, title: r.title, artist: r.artist,
                  artwork: r.artwork, duration: r.duration,
                  artistId: '', album: '', albumId: '', isLiked: false,
                  source: 'soundcloud', audioUrl: r.soundcloudUrl, soundcloudUrl: r.soundcloudUrl,
                };
                return (
                  <Pressable
                    key={r.trackId}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setPlayingId(t.id);
                      playTrack(t, [t]);
                      router.push('/(app)/nowPlaying' as never);
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7 }}
                  >
                    <View style={{ position: 'relative' }}>
                      <Image source={{ uri: r.artwork }} style={{ width: 44, height: 44, borderRadius: 6, opacity: playingId === t.id ? 0.6 : 1 }} contentFit="cover" />
                      {playingId === t.id && (
                        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                          <Play size={16} color="#fff" fill="#fff" />
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: playingId === t.id ? '#FF5500' : '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{r.title}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }} numberOfLines={1}>{r.artist}</Text>
                    </View>
                    <View onStartShouldSetResponder={() => true}>
                      <DownloadButton track={t} size={28} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ── Search Section ────────────────────────────────────────────────────────────

function SearchSection() {
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const playTrack = usePlaybackController(s => s.playTrack);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['sc-search', activeQuery],
    queryFn: async () => {
      const resp = await fetch(`${BACKEND_URL}/api/soundcloud/search?q=${encodeURIComponent(activeQuery)}&maxResults=8`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      return (json.data ?? []) as SCSearchResult[];
    },
    staleTime: 0, retry: 1, enabled: !!activeQuery,
  });

  const results: SCSearchResult[] = data ?? [];

  const handleSearch = () => {
    if (!query.trim()) return;
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveQuery(query.trim());
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, gap: 8, marginBottom: 14 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, height: 40 }}>
          <Search size={14} color="rgba(255,255,255,0.3)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            placeholder="Search SoundCloud..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="none" autoCorrect={false}
            style={{ flex: 1, color: '#fff', fontSize: 13, marginLeft: 8 }}
          />
        </View>
        <Pressable
          onPress={handleSearch}
          style={{ backgroundColor: '#FF5500', borderRadius: 12, height: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Find</Text>
        </Pressable>
      </View>

      {activeQuery ? (
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 10 }}>
          {`Results for "${activeQuery}"`}
        </Text>
      ) : null}

      {isFetching ? (
        <View style={{ alignItems: 'center', marginVertical: 16 }}>
          <LoadingRing size={26} color="#FF7700" />
        </View>
      ) : isError ? (
        <Text style={{ color: '#EF4444', fontSize: 12, textAlign: 'center', marginVertical: 12, marginHorizontal: 16 }}>Search failed — check your connection</Text>
      ) : results.length > 0 ? (
        (() => {
          const queue: Track[] = results.map((r) => ({
            id: `sc-${r.trackId}`,
            title: r.title,
            artist: r.artist,
            artistId: '', album: '', albumId: '', isLiked: false,
            artwork: r.artwork,
            duration: r.duration,
            source: 'soundcloud',
            audioUrl: r.soundcloudUrl,
            soundcloudUrl: r.soundcloudUrl,
          } as Track));
          return results.map((item, i) => {
            const track = queue[i];
            return (
              <Pressable
                key={item.trackId}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  playTrack(track, queue);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 16 }}
              >
                <Image source={{ uri: item.artwork }} style={{ width: 52, height: 52, borderRadius: 6 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{item.artist}</Text>
                </View>
                <View onStartShouldSetResponder={() => true}>
                  <DownloadButton track={track} size={28} />
                </View>
              </Pressable>
            );
          });
        })()
      ) : activeQuery && !isFetching ? (
        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginVertical: 16 }}>No results found</Text>
      ) : null}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AddMusicSoundCloudScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <LinearGradient colors={['#1a0900', '#0A0A0A']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <SoundCloudIcon size={28} />
          <View>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>SoundCloud</Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 1 }}>Search and download tracks</Text>
          </View>
        </View>
        <Pressable onPress={() => router.back()} hitSlop={12}
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
          <X size={18} color="#fff" />
        </Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 16, marginHorizontal: 12, marginBottom: 20, paddingTop: 16, paddingBottom: 12 }}>
            <PasteSection />
          </View>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 16, marginBottom: 20 }} />
          <View style={{ backgroundColor: 'rgba(255,85,0,0.05)', borderRadius: 16, marginHorizontal: 12, paddingTop: 16, paddingBottom: 12 }}>
            <SearchSection />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
