import React, { useState, useCallback, useRef } from 'react';
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
import { X, Link2, Search } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { DownloadButton } from '@/components/DownloadButton';
import { LoadingRing } from '@/components/LoadingRing';
import { usePlaybackController } from '@/stores/playbackController';
import { Track } from '@/types/music';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{6,32})/,
    /youtu\.be\/([a-zA-Z0-9_-]{6,32})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

function extractPlaylistId(url: string): string | null {
  const m = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function isPlaylistUrl(url: string): boolean {
  return url.includes('list=') && !extractYouTubeVideoId(url);
}

function isYouTubeUrl(url: string): boolean {
  return (url.includes('youtube.com/watch') || url.includes('youtu.be/') || url.includes('youtube.com/playlist')) &&
    !url.includes('music.youtube.com');
}

// ── Icon ──────────────────────────────────────────────────────────────────────

function YouTubeIcon({ size = 20 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, backgroundColor: '#FF0000', borderRadius: 4, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 0, height: 0, borderLeftWidth: size * 0.38, borderTopWidth: size * 0.22, borderBottomWidth: size * 0.22, borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 2 }} />
    </View>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlaylistTrack { videoId: string; title: string; channel: string; thumbnail: string; duration: number; }
interface YouTubeInfo { title: string; channel: string; thumbnail: string; duration: number; }
interface SearchResult { videoId: string; title: string; channelName: string; thumbnailUrl: string; }

// ── Track card ────────────────────────────────────────────────────────────────

function TrackRow({ videoId, title, channelName, thumbnailUrl, onPlay }: SearchResult & { onPlay: (track: Track) => void }) {
  const track: Track & { youtubeId?: string } = {
    id: `yt-${videoId}`,
    title,
    artist: channelName,
    artistId: '',
    album: '',
    albumId: '',
    isLiked: false,
    artwork: thumbnailUrl,
    duration: 0,
    source: 'youtube',
    audioUrl: '',
    youtubeId: videoId,
  };
  return (
    <Pressable
      onPress={() => onPlay(track)}
      style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 16 }}
    >
      <Image source={{ uri: thumbnailUrl }} style={{ width: 52, height: 52, borderRadius: 6 }} contentFit="cover" />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{title}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{channelName}</Text>
      </View>
      <View onStartShouldSetResponder={() => true}>
        <DownloadButton track={track} size={28} />
      </View>
    </Pressable>
  );
}

// ── Paste Section ─────────────────────────────────────────────────────────────

function PasteSection() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ytInfo, setYtInfo] = useState<YouTubeInfo | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([]);

  const clear = () => { setYtInfo(null); setPlaylistTracks([]); setError(null); };

  const handleLookup = useCallback(async (overrideUrl?: string) => {
    const target = (overrideUrl ?? url).trim();
    if (!target) return;
    clear(); setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (isPlaylistUrl(target)) {
        const listId = extractPlaylistId(target);
        if (!listId) throw new Error('Could not extract playlist ID from URL');
        const endpoint = `${BACKEND_URL}/api/youtube/playlist-tracks?listId=${encodeURIComponent(listId)}`;
        console.log('[YouTube Paste] Fetching playlist:', endpoint);
        const resp = await fetch(endpoint);
        const bodyText = await resp.text();
        if (!resp.ok) {
          console.error('[YouTube Paste] playlist HTTP', resp.status, bodyText);
          throw new Error(`Playlist fetch failed (${resp.status}): ${bodyText.slice(0, 120)}`);
        }
        let json: any;
        try { json = JSON.parse(bodyText); } catch { throw new Error('Invalid playlist response'); }
        const tracks: PlaylistTrack[] = json.data ?? [];
        if (tracks.length === 0) throw new Error('Playlist is empty or unavailable');
        setPlaylistTracks(tracks);
      } else {
        const videoId = extractYouTubeVideoId(target);
        if (!videoId) throw new Error('Paste a YouTube video or playlist URL');
        const endpoint = `${BACKEND_URL}/api/youtube/info/${videoId}`;
        console.log('[YouTube Paste] Fetching info:', endpoint);
        const resp = await fetch(endpoint);
        const bodyText = await resp.text();
        if (!resp.ok) {
          console.error('[YouTube Paste] info HTTP', resp.status, bodyText);
          throw new Error(`Video lookup failed (${resp.status}): ${bodyText.slice(0, 120)}`);
        }
        let json: any;
        try { json = JSON.parse(bodyText); } catch { throw new Error('Invalid video response'); }
        if (!json.data) throw new Error('Video info missing in response');
        setYtInfo(json.data);
      }
    } catch (e) {
      console.error('[YouTube Paste] lookup error:', e);
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setLoading(false); }
  }, [url]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && isYouTubeUrl(text)) {
        setUrl(text); clear();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Auto-trigger the lookup with the pasted text directly — React
        // state updates are async so `url` is still stale at this point.
        handleLookup(text);
      }
    } catch {}
  }, [handleLookup]);

  const videoId = url ? extractYouTubeVideoId(url) : null;
  const ytTrack: (Track & { youtubeId?: string }) | null = ytInfo && videoId ? {
    id: `yt-${videoId}`, title: ytInfo.title, artist: ytInfo.channel,
    artistId: '', album: '', albumId: '', isLiked: false,
    artwork: ytInfo.thumbnail, duration: ytInfo.duration,
    source: 'youtube', audioUrl: '', youtubeId: videoId,
  } : null;

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(99,102,241,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <Link2 size={16} color="#818CF8" />
        </View>
        <View>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Paste a Link</Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>YouTube video or playlist URL</Text>
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
          onPress={url ? handleLookup : handlePaste}
          style={{ backgroundColor: '#6366F1', borderRadius: 12, height: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
        >
          {loading ? <ActivityIndicator size="small" color="#fff" /> :
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{url ? 'Look Up' : 'Paste'}</Text>}
        </Pressable>
      </View>
      {error ? <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 8, marginHorizontal: 16 }}>{error}</Text> : null}

      {playlistTracks.length > 0 ? (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
            {playlistTracks.length} tracks in playlist
          </Text>
          {playlistTracks.map((pt) => {
            const t: Track & { youtubeId?: string } = {
              id: `yt-${pt.videoId}`, title: pt.title, artist: pt.channel,
              artistId: '', album: '', albumId: '', isLiked: false,
              artwork: pt.thumbnail, duration: pt.duration,
              source: 'youtube', audioUrl: '', youtubeId: pt.videoId,
            };
            return (
              <View key={pt.videoId} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Image source={{ uri: pt.thumbnail }} style={{ width: 48, height: 48, borderRadius: 6 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{pt.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }} numberOfLines={1}>{pt.channel}</Text>
                </View>
                <DownloadButton track={t} size={28} />
              </View>
            );
          })}
        </View>
      ) : null}

      {ytTrack ? (
        <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
            <Image source={{ uri: ytTrack.artwork }} style={{ width: 56, height: 56, borderRadius: 8 }} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={2}>{ytTrack.title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>{ytTrack.artist}</Text>
            </View>
            <DownloadButton track={ytTrack} size={32} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ── Search Section ────────────────────────────────────────────────────────────

function SearchSection() {
  const playTrack = usePlaybackController(s => s.playTrack);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlTrack, setUrlTrack] = useState<(Track & { youtubeId?: string }) | null>(null);
  const [urlPlaylistTracks, setUrlPlaylistTracks] = useState<PlaylistTrack[]>([]);

  const queryIsUrl = query.includes('youtube.com') || query.includes('youtu.be');
  const clearUrlResults = () => { setUrlTrack(null); setUrlPlaylistTracks([]); setUrlError(null); };

  const { data, isFetching, isError } = useQuery({
    queryKey: ['yt-search', 'youtube', activeQuery],
    queryFn: async () => {
      const resp = await fetch(`${BACKEND_URL}/api/youtube/search?q=${encodeURIComponent(activeQuery)}&maxResults=8`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      return (json.data ?? []) as SearchResult[];
    },
    staleTime: 0, retry: 1, enabled: !queryIsUrl && !!activeQuery,
  });

  const handleSearch = async () => {
    if (!query.trim()) return;
    clearUrlResults();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (queryIsUrl) {
      setUrlLoading(true);
      try {
        if (isPlaylistUrl(query)) {
          const listId = extractPlaylistId(query);
          if (!listId) throw new Error('Could not extract playlist ID');
          const resp = await fetch(`${BACKEND_URL}/api/youtube/playlist-tracks?listId=${encodeURIComponent(listId)}`);
          if (!resp.ok) throw new Error('Failed to fetch playlist');
          const json = await resp.json();
          const pts: PlaylistTrack[] = json.data ?? [];
          if (pts.length === 0) throw new Error('Playlist is empty');
          setUrlPlaylistTracks(pts);
        } else {
          const videoId = extractYouTubeVideoId(query);
          if (!videoId) throw new Error('Could not extract video ID');
          const resp = await fetch(`${BACKEND_URL}/api/youtube/info/${videoId}`);
          if (!resp.ok) throw new Error('Failed to get video info');
          const json = await resp.json();
          const info: YouTubeInfo = json.data;
          setUrlTrack({
            id: `yt-${videoId}`, title: info.title, artist: info.channel,
            artistId: '', album: '', albumId: '', isLiked: false,
            artwork: info.thumbnail, duration: info.duration,
            source: 'youtube', audioUrl: '', youtubeId: videoId,
          });
        }
      } catch (e) { setUrlError(e instanceof Error ? e.message : 'Lookup failed'); }
      finally { setUrlLoading(false); }
    } else {
      setActiveQuery(query.trim());
    }
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, gap: 8, marginBottom: 14 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, height: 40 }}>
          <Search size={14} color="rgba(255,255,255,0.3)" />
          <TextInput
            value={query}
            onChangeText={(t) => { setQuery(t); clearUrlResults(); }}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            placeholder="Search YouTube..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="none" autoCorrect={false}
            style={{ flex: 1, color: '#fff', fontSize: 13, marginLeft: 8 }}
          />
        </View>
        <Pressable
          onPress={handleSearch}
          style={{ backgroundColor: '#FF0000', borderRadius: 12, height: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
        >
          {urlLoading ? <ActivityIndicator size="small" color="#fff" /> :
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{queryIsUrl ? 'Look Up' : 'Find'}</Text>}
        </Pressable>
      </View>

      {urlError ? <Text style={{ color: '#EF4444', fontSize: 12, marginTop: -8, marginBottom: 10, marginHorizontal: 16 }}>{urlError}</Text> : null}

      {urlTrack ? (
        <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
            <Image source={{ uri: urlTrack.artwork }} style={{ width: 52, height: 52, borderRadius: 6 }} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }} numberOfLines={2}>{urlTrack.title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>{urlTrack.artist}</Text>
            </View>
            <DownloadButton track={urlTrack} size={28} />
          </View>
        </View>
      ) : null}

      {urlPlaylistTracks.length > 0 ? (
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
            {urlPlaylistTracks.length} tracks in playlist
          </Text>
          {urlPlaylistTracks.map((pt) => {
            const t: Track & { youtubeId?: string } = {
              id: `yt-${pt.videoId}`, title: pt.title, artist: pt.channel,
              artistId: '', album: '', albumId: '', isLiked: false,
              artwork: pt.thumbnail, duration: pt.duration,
              source: 'youtube', audioUrl: '', youtubeId: pt.videoId,
            };
            return (
              <View key={pt.videoId} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Image source={{ uri: pt.thumbnail }} style={{ width: 48, height: 48, borderRadius: 6 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{pt.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }} numberOfLines={1}>{pt.channel}</Text>
                </View>
                <DownloadButton track={t} size={28} />
              </View>
            );
          })}
        </View>
      ) : null}

      {!queryIsUrl && activeQuery ? (
        <>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 10 }}>
            {`Results for "${activeQuery}"`}
          </Text>
          {isFetching ? (
            <View style={{ alignItems: 'center', marginVertical: 16 }}>
              <LoadingRing size={26} color="#FF0000" />
            </View>
          ) : isError ? (
            <Text style={{ color: '#EF4444', fontSize: 12, textAlign: 'center', marginVertical: 12 }}>Search failed — check your connection</Text>
          ) : (data ?? []).length > 0 ? (
            (() => {
              const items = data ?? [];
              const queue: Track[] = items.map(item => ({
                id: `yt-${item.videoId}`,
                title: item.title,
                artist: item.channelName,
                artistId: '', album: '', albumId: '', isLiked: false,
                artwork: item.thumbnailUrl,
                duration: 0,
                source: 'youtube',
                audioUrl: '',
                youtubeId: item.videoId,
              } as Track));
              return items.map(item => (
                <TrackRow
                  key={item.videoId}
                  {...item}
                  onPlay={track => playTrack(track, queue)}
                />
              ));
            })()
          ) : (
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginVertical: 16 }}>No results found</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AddMusicYouTubeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <LinearGradient colors={['#1a0a0a', '#0A0A0A']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <YouTubeIcon size={28} />
          <View>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>YouTube</Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 1 }}>Download videos as audio</Text>
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
          <View style={{ backgroundColor: 'rgba(255,0,0,0.05)', borderRadius: 16, marginHorizontal: 12, paddingTop: 16, paddingBottom: 12 }}>
            <SearchSection />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
