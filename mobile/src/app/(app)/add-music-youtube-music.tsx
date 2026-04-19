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
import { X, Link2, Search, Music } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { DownloadButton } from '@/components/DownloadButton';
import { LoadingRing } from '@/components/LoadingRing';
import { usePlaybackController } from '@/stores/playbackController';
import { downloadYouTubeTrack, enqueueDownload, useDownloadsStore } from '@/stores/downloadsStore';
import { Track } from '@/types/music';
import { normalizeYoutubePlaylistTracksPayload } from '@/lib/youtubePlaylistTracksNormalize';
import { SHADOW_TEXT_INPUT_DEFAULTS } from '@/lib/shadowInput';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{6,32})/,
    /music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{6,32})/,
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

function isYouTubeMusicUrl(url: string): boolean {
  return url.includes('music.youtube.com');
}

// ── Icon ──────────────────────────────────────────────────────────────────────

function YouTubeMusicIcon({ size = 20 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, backgroundColor: '#FF0000', borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Music size={size * 0.55} color="#fff" strokeWidth={2.5} />
    </View>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlaylistTrack { videoId: string; title: string; channel: string; thumbnail: string; duration: number; }
interface YouTubeInfo { title: string; channel: string; thumbnail: string; duration: number; }
interface SearchResult { videoId: string; title: string; channelName: string; thumbnailUrl: string; }

// ── Track row ─────────────────────────────────────────────────────────────────

function TrackRow({ videoId, title, channelName, thumbnailUrl, onPlay }: SearchResult & { onPlay: (track: Track) => void }) {
  const track: Track & { youtubeMusicId?: string } = {
    id: `ytm-${videoId}`, title, artist: channelName,
    artwork: thumbnailUrl, duration: 0,
    artistId: '', album: '', albumId: '', isLiked: false,
    source: 'youtube_music', audioUrl: '', youtubeMusicId: videoId,
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
  const [relatedTracks, setRelatedTracks] = useState<SearchResult[]>([]);
  const [lookedUpVideoId, setLookedUpVideoId] = useState<string | null>(null);
  const [bulkStarted, setBulkStarted] = useState(false);
  const [bulkDone, setBulkDone] = useState(0);
  const [bulkActiveId, setBulkActiveId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState(0);

  const clear = () => { setYtInfo(null); setPlaylistTracks([]); setError(null); setRelatedTracks([]); setLookedUpVideoId(null); setBulkStarted(false); setBulkDone(0); };

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
        console.log('[YTMusic Paste] Fetching playlist:', endpoint);
        const resp = await fetch(endpoint);
        const bodyText = await resp.text();
        if (!resp.ok) {
          console.error('[YTMusic Paste] playlist HTTP', resp.status, bodyText);
          throw new Error(`Playlist fetch failed (${resp.status}): ${bodyText.slice(0, 120)}`);
        }
        let json: any;
        try { json = JSON.parse(bodyText); } catch { throw new Error('Invalid playlist response'); }
        const tracks = normalizeYoutubePlaylistTracksPayload(json.data);
        if (tracks.length === 0) throw new Error('Playlist is empty or unavailable');
        setPlaylistTracks(tracks);
      } else {
        const videoId = extractYouTubeVideoId(target);
        if (!videoId) throw new Error('Paste a Vybe Music video or playlist URL');
        const endpoint = `${BACKEND_URL}/api/youtube/info/${videoId}`;
        console.log('[YTMusic Paste] Fetching info:', endpoint);
        const infoResp = await fetch(endpoint);
        const bodyText = await infoResp.text();
        if (!infoResp.ok) {
          console.error('[YTMusic Paste] info HTTP', infoResp.status, bodyText);
          throw new Error(`Track lookup failed (${infoResp.status}): ${bodyText.slice(0, 120)}`);
        }
        let infoJson: any;
        try { infoJson = JSON.parse(bodyText); } catch { throw new Error('Invalid track response'); }
        if (!infoJson.data) throw new Error('Track info missing in response');
        const info: YouTubeInfo = infoJson.data;
        setYtInfo(info);
        setLookedUpVideoId(videoId);
        const relatedResp = await fetch(`${BACKEND_URL}/api/youtube/search?q=${encodeURIComponent(info.channel + ' music')}&maxResults=6`);
        if (relatedResp.ok) {
          const relatedJson = await relatedResp.json();
          const results: SearchResult[] = (relatedJson.data ?? []).filter((r: SearchResult) => r.videoId !== videoId);
          setRelatedTracks(results.slice(0, 5));
        }
      }
    } catch (e) {
      console.error('[YTMusic Paste] lookup error:', e);
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setLoading(false); }
  }, [url]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && isYouTubeMusicUrl(text)) {
        setUrl(text); clear();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Auto-trigger lookup with the pasted URL directly.
        handleLookup(text);
      }
    } catch {}
  }, [handleLookup]);

  const videoId = url ? extractYouTubeVideoId(url) : null;
  const ytTrack: (Track & { youtubeMusicId?: string }) | null = ytInfo && videoId ? {
    id: `ytm-${videoId}`, title: ytInfo.title, artist: ytInfo.channel,
    artistId: '', album: '', albumId: '', isLiked: false,
    artwork: ytInfo.thumbnail, duration: ytInfo.duration,
    source: 'youtube_music', audioUrl: '', youtubeMusicId: videoId,
  } : null;

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(99,102,241,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <Link2 size={16} color="#818CF8" />
        </View>
        <View>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Paste a Link</Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>Vybe Music video or playlist URL</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, height: 44 }}>
          <Link2 size={14} color="rgba(255,255,255,0.3)" />
          <TextInput
            {...SHADOW_TEXT_INPUT_DEFAULTS}
            value={url}
            onChangeText={(t) => { setUrl(t); clear(); }}
            placeholder="Paste URL here..."
            autoCapitalize="none"
            autoCorrect={false}
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

      {playlistTracks.length > 0 ? (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              {playlistTracks.length} tracks in playlist
            </Text>
            {!bulkStarted ? (
              <Pressable
                onPress={() => {
                  setBulkStarted(true);
                  setBulkDone(0);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  playlistTracks.forEach((pt) => {
                    const t: Track & { youtubeMusicId?: string } = {
                      id: `ytm-${pt.videoId}`, title: pt.title, artist: pt.channel,
                      artwork: pt.thumbnail, duration: pt.duration,
                      artistId: '', album: '', albumId: '', isLiked: false,
                      source: 'youtube_music', audioUrl: '', youtubeMusicId: pt.videoId,
                    };
                    enqueueDownload(t.id, async () => {
                      setBulkActiveId(t.id);
                      setBulkProgress(0);
                      await downloadYouTubeTrack(t, BACKEND_URL, (p) => setBulkProgress(p));
                      setBulkDone((n) => n + 1);
                      setBulkActiveId(null);
                      setBulkProgress(0);
                    });
                  });
                }}
                style={{ backgroundColor: '#6366F1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Download All</Text>
              </Pressable>
            ) : bulkDone < playlistTracks.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={{ color: '#6366F1', fontSize: 12, fontWeight: '600' }}>{bulkDone} / {playlistTracks.length}</Text>
              </View>
            ) : (
              <Text style={{ color: '#22C55E', fontSize: 12, fontWeight: '700' }}>All Downloaded ✓</Text>
            )}
          </View>
          {playlistTracks.map((pt) => {
            const t: Track & { youtubeMusicId?: string } = {
              id: `ytm-${pt.videoId}`, title: pt.title, artist: pt.channel,
              artwork: pt.thumbnail, duration: pt.duration,
              artistId: '', album: '', albumId: '', isLiked: false,
              source: 'youtube_music', audioUrl: '', youtubeMusicId: pt.videoId,
            };
            const isBatchTarget = bulkActiveId === t.id;
            const pct = Math.round(bulkProgress * 100);
            return (
              <View key={pt.videoId} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingVertical: 4, paddingHorizontal: 4, borderRadius: 8, backgroundColor: isBatchTarget ? 'rgba(139,92,246,0.12)' : 'transparent' }}>
                <Image source={{ uri: pt.thumbnail }} style={{ width: 48, height: 48, borderRadius: 6 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{pt.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }} numberOfLines={1}>{pt.channel}</Text>
                  {isBatchTarget ? (
                    <View style={{ marginTop: 6, height: 3, borderRadius: 2, backgroundColor: 'rgba(139,92,246,0.2)', overflow: 'hidden' }}>
                      <View style={{ height: 3, width: `${Math.max(2, pct)}%`, backgroundColor: '#8B5CF6' }} />
                    </View>
                  ) : null}
                </View>
                <View style={{ minWidth: 44, alignItems: 'center' }}>
                  {isBatchTarget ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.2)' }}>
                      <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
                    </View>
                  ) : (
                    <DownloadButton track={t} size={28} />
                  )}
                </View>
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

          {relatedTracks.length > 0 ? (
            <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', paddingTop: 8, paddingBottom: 4 }}>
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 12, marginBottom: 8 }}>
                More from {ytTrack.artist}
              </Text>
              {relatedTracks.map((r) => {
                const t: Track & { youtubeMusicId?: string } = {
                  id: `ytm-${r.videoId}`, title: r.title, artist: r.channelName,
                  artwork: r.thumbnailUrl, duration: 0,
                  artistId: '', album: '', albumId: '', isLiked: false,
                  source: 'youtube_music', audioUrl: '', youtubeMusicId: r.videoId,
                };
                return (
                  <View key={r.videoId} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7 }}>
                    <Image source={{ uri: r.thumbnailUrl }} style={{ width: 44, height: 44, borderRadius: 6 }} contentFit="cover" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{r.title}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }} numberOfLines={1}>{r.channelName}</Text>
                    </View>
                    <DownloadButton track={t} size={28} />
                  </View>
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
  const playTrack = usePlaybackController(s => s.playTrack);
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlTrack, setUrlTrack] = useState<(Track & { youtubeMusicId?: string }) | null>(null);
  const [urlPlaylistTracks, setUrlPlaylistTracks] = useState<PlaylistTrack[]>([]);
  const [bulkStarted, setBulkStarted] = useState(false);
  const [bulkDone, setBulkDone] = useState(0);
  const [bulkActiveId, setBulkActiveId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState(0);

  const queryIsUrl = query.includes('music.youtube.com') || query.includes('youtube.com') || query.includes('youtu.be');
  const clearUrlResults = () => { setUrlTrack(null); setUrlPlaylistTracks([]); setUrlError(null); setBulkStarted(false); setBulkDone(0); };

  const { data, isFetching, isError } = useQuery({
    queryKey: ['yt-search', 'youtube_music', activeQuery],
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
    Keyboard.dismiss();
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
          const pts = normalizeYoutubePlaylistTracksPayload(json.data);
          if (pts.length === 0) throw new Error('Playlist is empty');
          setUrlPlaylistTracks(pts);
        } else {
          const videoId = extractYouTubeVideoId(query);
          if (!videoId) throw new Error('Could not extract video ID');
          const resp = await fetch(`${BACKEND_URL}/api/youtube/info/${videoId}`);
          if (!resp.ok) throw new Error('Failed to get track info');
          const json = await resp.json();
          const info: YouTubeInfo = json.data;
          setUrlTrack({
            id: `ytm-${videoId}`, title: info.title, artist: info.channel,
            artwork: info.thumbnail, duration: info.duration,
            artistId: '', album: '', albumId: '', isLiked: false,
            source: 'youtube_music', audioUrl: '', youtubeMusicId: videoId,
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
            {...SHADOW_TEXT_INPUT_DEFAULTS}
            value={query}
            onChangeText={(t) => { setQuery(t); clearUrlResults(); }}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            placeholder="Search Vybe Music..."
            blurOnSubmit={false}
            autoCapitalize="none"
            autoCorrect={false}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              {urlPlaylistTracks.length} tracks in playlist
            </Text>
            {!bulkStarted ? (
              <Pressable
                onPress={() => {
                  setBulkStarted(true);
                  setBulkDone(0);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  urlPlaylistTracks.forEach((pt) => {
                    const t: Track & { youtubeMusicId?: string } = {
                      id: `ytm-${pt.videoId}`, title: pt.title, artist: pt.channel,
                      artwork: pt.thumbnail, duration: pt.duration,
                      artistId: '', album: '', albumId: '', isLiked: false,
                      source: 'youtube_music', audioUrl: '', youtubeMusicId: pt.videoId,
                    };
                    enqueueDownload(t.id, async () => {
                      setBulkActiveId(t.id);
                      setBulkProgress(0);
                      await downloadYouTubeTrack(t, BACKEND_URL, (p) => setBulkProgress(p));
                      setBulkDone((n) => n + 1);
                      setBulkActiveId(null);
                      setBulkProgress(0);
                    });
                  });
                }}
                style={{ backgroundColor: '#6366F1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Download All</Text>
              </Pressable>
            ) : bulkDone < urlPlaylistTracks.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={{ color: '#6366F1', fontSize: 12, fontWeight: '600' }}>{bulkDone} / {urlPlaylistTracks.length}</Text>
              </View>
            ) : (
              <Text style={{ color: '#22C55E', fontSize: 12, fontWeight: '700' }}>All Downloaded ✓</Text>
            )}
          </View>
          {urlPlaylistTracks.map((pt) => {
            const t: Track & { youtubeMusicId?: string } = {
              id: `ytm-${pt.videoId}`, title: pt.title, artist: pt.channel,
              artwork: pt.thumbnail, duration: pt.duration,
              artistId: '', album: '', albumId: '', isLiked: false,
              source: 'youtube_music', audioUrl: '', youtubeMusicId: pt.videoId,
            };
            const isBatchTarget = bulkActiveId === t.id;
            const pct = Math.round(bulkProgress * 100);
            return (
              <View key={pt.videoId} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingVertical: 4, paddingHorizontal: 4, borderRadius: 8, backgroundColor: isBatchTarget ? 'rgba(139,92,246,0.12)' : 'transparent' }}>
                <Image source={{ uri: pt.thumbnail }} style={{ width: 48, height: 48, borderRadius: 6 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{pt.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }} numberOfLines={1}>{pt.channel}</Text>
                  {isBatchTarget ? (
                    <View style={{ marginTop: 6, height: 3, borderRadius: 2, backgroundColor: 'rgba(139,92,246,0.2)', overflow: 'hidden' }}>
                      <View style={{ height: 3, width: `${Math.max(2, pct)}%`, backgroundColor: '#8B5CF6' }} />
                    </View>
                  ) : null}
                </View>
                <View style={{ minWidth: 44, alignItems: 'center' }}>
                  {isBatchTarget ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.2)' }}>
                      <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
                    </View>
                  ) : (
                    <DownloadButton track={t} size={28} />
                  )}
                </View>
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
                id: `ytm-${item.videoId}`,
                title: item.title,
                artist: item.channelName,
                artistId: '', album: '', albumId: '', isLiked: false,
                artwork: item.thumbnailUrl,
                duration: 0,
                source: 'youtube_music',
                audioUrl: '',
                youtubeMusicId: item.videoId,
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

export default function AddMusicYouTubeMusicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <LinearGradient colors={['#1a0a0a', '#0A0A0A']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <YouTubeMusicIcon size={28} />
          <View>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Vybe Music</Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 1 }}>Download music tracks</Text>
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
