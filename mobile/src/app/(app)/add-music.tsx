import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { X, Link2, Search, Download, Check } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { DownloadButton } from '@/components/DownloadButton';
import { Track } from '@/types/music';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

// ─── URL Parsing ──────────────────────────────────────────────────────────────

type UrlPlatform = 'youtube' | 'youtube_music' | 'soundcloud' | 'spotify' | 'apple_music' | null;

function detectPlatform(url: string): UrlPlatform {
  if (!url) return null;
  if (url.includes('music.youtube.com')) return 'youtube_music';
  if (url.includes('youtube.com/watch') || url.includes('youtu.be/')) return 'youtube';
  if (url.includes('soundcloud.com/')) return 'soundcloud';
  if (url.includes('open.spotify.com/')) return 'spotify';
  if (url.includes('music.apple.com/')) return 'apple_music';
  return null;
}

function extractSpotifyPlaylistId(url: string): string | null {
  const m = url.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{6,32})/,
    /youtu\.be\/([a-zA-Z0-9_-]{6,32})/,
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
  return url.includes('playlist?list=') || (url.includes('list=') && !extractYouTubeVideoId(url));
}

// ─── Platform Icons ───────────────────────────────────────────────────────────

function YouTubeIcon({ size = 20 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, backgroundColor: '#FF0000', borderRadius: 4, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 0, height: 0, borderLeftWidth: size * 0.38, borderTopWidth: size * 0.22, borderBottomWidth: size * 0.22, borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 2 }} />
    </View>
  );
}

function YouTubeMusicIcon({ size = 20 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, backgroundColor: '#FF0000', borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 0, height: 0, borderLeftWidth: size * 0.38, borderTopWidth: size * 0.22, borderBottomWidth: size * 0.22, borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 2 }} />
    </View>
  );
}

function SoundCloudIcon({ size = 20 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size * 0.6, alignItems: 'center', justifyContent: 'center', marginTop: size * 0.2 }}>
      <Text style={{ color: '#FF5500', fontSize: size * 0.7, fontWeight: '900', letterSpacing: -1 }}>))))</Text>
    </View>
  );
}

// ─── Track Card ───────────────────────────────────────────────────────────────

interface TrendingTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  viewCount?: string;
  source: 'youtube' | 'youtube_music';
}

function TrendingTrackCard({ item }: { item: TrendingTrack }) {
  const track: Track & { youtubeId?: string; youtubeMusicId?: string } = {
    id: item.source === 'youtube_music' ? `ytm-${item.videoId}` : `yt-${item.videoId}`,
    title: item.title,
    artist: item.channelName,
    artistId: '', album: '', albumId: '', isLiked: false,
    artwork: item.thumbnailUrl,
    duration: 0,
    source: item.source,
    audioUrl: '',
    youtubeId: item.source === 'youtube' ? item.videoId : undefined,
    youtubeMusicId: item.source === 'youtube_music' ? item.videoId : undefined,
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 16 }}>
      <Image
        source={{ uri: item.thumbnailUrl }}
        style={{ width: 52, height: 52, borderRadius: 6 }}
        contentFit="cover"
      />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{item.channelName}</Text>
        {item.viewCount ? (
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 1 }}>{item.viewCount}</Text>
        ) : null}
      </View>
      <DownloadButton track={track} size={28} />
    </View>
  );
}

// ─── Paste Link Preview ───────────────────────────────────────────────────────

interface YouTubeInfo {
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
}

interface SCImportResult {
  track: {
    id: string;
    title: string;
    artist: string;
    artwork: string;
    duration: number;
    soundcloudUrl?: string;
    audioUrl?: string;
    source: string;
  };
}

interface PlaylistTrack {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
}

interface StreamingResult {
  name: string;
  artist?: string;
  thumbnailUrl: string;
  tracks: { videoId: string; title: string; channelName: string; thumbnailUrl: string; durationMs?: number }[];
}

function SpotifyIcon({ size = 20 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#000', fontSize: size * 0.55, fontWeight: '900' }}>♫</Text>
    </View>
  );
}

function AppleMusicIcon({ size = 20 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#FC3C44', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: size * 0.55, fontWeight: '900' }}>♪</Text>
    </View>
  );
}

function PasteSection({ initialUrl }: { initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ytInfo, setYtInfo] = useState<YouTubeInfo | null>(null);
  const [scInfo, setScInfo] = useState<SCImportResult['track'] | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([]);
  const [streamingResult, setStreamingResult] = useState<StreamingResult | null>(null);
  const inputRef = useRef<TextInput>(null);
  const didAutoLookup = useRef(false);

  const platform = detectPlatform(url);
  const isPlaylist = !!url && isPlaylistUrl(url);

  const clearResults = () => {
    setYtInfo(null);
    setScInfo(null);
    setPlaylistTracks([]);
    setStreamingResult(null);
    setError(null);
  };

  const handlePaste = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && (detectPlatform(text) || text.includes('list='))) {
        setUrl(text);
        clearResults();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {}
  }, []);

  const handleLookup = useCallback(async () => {
    if (!url.trim()) return;
    clearResults();
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (platform === 'youtube' || platform === 'youtube_music') {
        if (isPlaylist) {
          // Playlist URL — fetch all tracks
          const listId = extractPlaylistId(url);
          if (!listId) throw new Error('Could not extract playlist ID from URL');
          const resp = await fetch(`${BACKEND_URL}/api/youtube/playlist-tracks?listId=${encodeURIComponent(listId)}`);
          if (!resp.ok) throw new Error('Failed to fetch playlist');
          const json = await resp.json();
          const tracks: PlaylistTrack[] = json.data ?? [];
          if (tracks.length === 0) throw new Error('Playlist is empty or unavailable');
          setPlaylistTracks(tracks);
        } else {
          // Single video URL
          const videoId = extractYouTubeVideoId(url);
          if (!videoId) throw new Error('Could not extract video ID from URL');
          const resp = await fetch(`${BACKEND_URL}/api/youtube/info/${videoId}`);
          if (!resp.ok) throw new Error('Failed to get video info');
          const json = await resp.json();
          setYtInfo(json.data);
        }
      } else if (platform === 'soundcloud') {
        const resp = await fetch(`${BACKEND_URL}/api/soundcloud/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim(), tags: [] }),
        });
        if (!resp.ok) throw new Error('Failed to import SoundCloud track');
        const json = await resp.json();
        setScInfo(json.data?.track ?? json.track);
      } else if (platform === 'spotify') {
        const playlistId = extractSpotifyPlaylistId(url);
        if (!playlistId) throw new Error('Could not extract Spotify playlist ID');
        const resp = await fetch(`${BACKEND_URL}/api/spotify/playlist/${playlistId}`);
        if (!resp.ok) throw new Error('Failed to fetch Spotify playlist');
        const json = await resp.json();
        setStreamingResult(json.data);
      } else if (platform === 'apple_music') {
        const resp = await fetch(`${BACKEND_URL}/api/apple-music/resolve?url=${encodeURIComponent(url.trim())}`);
        if (!resp.ok) throw new Error('Failed to fetch Apple Music content');
        const json = await resp.json();
        setStreamingResult(json.data);
      } else {
        throw new Error('Paste a YouTube, YouTube Music, SoundCloud, Spotify, or Apple Music URL');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [url, platform, isPlaylist]);

  // Auto-lookup when screen is opened with a pre-filled URL (from clipboard banner)
  useEffect(() => {
    if (initialUrl && !didAutoLookup.current && detectPlatform(initialUrl)) {
      didAutoLookup.current = true;
      handleLookup();
    }
  }, [handleLookup, initialUrl]);

  const ytVideoId = url ? extractYouTubeVideoId(url) : null;

  const ytTrack: (Track & { youtubeId?: string; youtubeMusicId?: string }) | null = ytInfo && ytVideoId ? {
    id: platform === 'youtube_music' ? `ytm-${ytVideoId}` : `yt-${ytVideoId}`,
    title: ytInfo.title,
    artist: ytInfo.channel,
    artistId: '', album: '', albumId: '', isLiked: false,
    artwork: ytInfo.thumbnail,
    duration: ytInfo.duration,
    source: platform === 'youtube_music' ? 'youtube_music' : 'youtube',
    audioUrl: '',
    youtubeId: platform === 'youtube' ? ytVideoId : undefined,
    youtubeMusicId: platform === 'youtube_music' ? ytVideoId : undefined,
  } : null;

  const scTrack: (Track & { soundcloudUrl?: string }) | null = scInfo ? {
    artistId: '', album: '', albumId: '', isLiked: false,
    ...scInfo,
    source: 'soundcloud' as const,
    audioUrl: scInfo.audioUrl ?? '',
    soundcloudUrl: scInfo.soundcloudUrl ?? url,
  } : null;

  return (
    <View style={{ marginBottom: 8 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(99,102,241,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <Link2 size={16} color="#818CF8" />
        </View>
        <View>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Paste a Link</Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>YouTube, SoundCloud, Spotify, or Apple Music</Text>
        </View>
      </View>

      {/* Input row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, height: 44 }}>
          {platform === 'youtube' ? <YouTubeIcon size={16} /> :
           platform === 'youtube_music' ? <YouTubeMusicIcon size={16} /> :
           platform === 'soundcloud' ? <View style={{ marginRight: -4 }}><SoundCloudIcon size={20} /></View> :
           platform === 'spotify' ? <SpotifyIcon size={16} /> :
           platform === 'apple_music' ? <AppleMusicIcon size={16} /> :
           <Link2 size={14} color="rgba(255,255,255,0.3)" />}
          <TextInput
            ref={inputRef}
            value={url}
            onChangeText={(t) => { setUrl(t); clearResults(); }}
            placeholder="Paste URL here..."
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
          onPress={url ? handleLookup : handlePaste}
          style={{ backgroundColor: '#6366F1', borderRadius: 12, height: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{url ? 'Look Up' : 'Paste'}</Text>
          )}
        </Pressable>
      </View>

      {/* Error */}
      {error ? (
        <Text style={{ color: '#EF4444', fontSize: 12, marginTop: 8, marginHorizontal: 16 }}>{error}</Text>
      ) : null}

      {/* Playlist results */}
      {playlistTracks.length > 0 ? (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
            {playlistTracks.length} tracks in playlist
          </Text>
          {playlistTracks.map((pt) => {
            const track: Track & { youtubeMusicId?: string } = {
              id: `ytm-${pt.videoId}`,
              title: pt.title,
              artistId: '', album: '', albumId: '', isLiked: false,
              artist: pt.channel,
              artwork: pt.thumbnail,
              duration: pt.duration,
              source: 'youtube_music',
              audioUrl: '',
              youtubeMusicId: pt.videoId,
            };
            return (
              <View key={pt.videoId} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Image source={{ uri: pt.thumbnail }} style={{ width: 48, height: 48, borderRadius: 6 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{pt.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }} numberOfLines={1}>{pt.channel}</Text>
                </View>
                <DownloadButton track={track} size={28} />
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Single YouTube preview */}
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

      {/* SoundCloud preview */}
      {scTrack ? (
        <View style={{ marginHorizontal: 16, marginTop: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
            <Image source={{ uri: scTrack.artwork }} style={{ width: 56, height: 56, borderRadius: 8 }} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={2}>{scTrack.title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>{scTrack.artist}</Text>
            </View>
            <DownloadButton track={scTrack} size={32} />
          </View>
        </View>
      ) : null}

      {/* Spotify / Apple Music results */}
      {streamingResult ? (
        <View style={{ marginHorizontal: 16, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            {platform === 'spotify' ? <SpotifyIcon size={28} /> : <AppleMusicIcon size={28} />}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{streamingResult.name}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
                {streamingResult.tracks.length} tracks · plays via YouTube
              </Text>
            </View>
          </View>
          {streamingResult.tracks.map((t, idx) => {
            const track: Track & { youtubeMusicId?: string } = {
              id: `sp-yt-${t.videoId}`,
              title: t.title,
              artist: t.channelName,
              artistId: '', album: streamingResult.name, albumId: '', isLiked: false,
              artwork: t.thumbnailUrl,
              duration: Math.round((t.durationMs ?? 0) / 1000),
              source: 'youtube_music',
              audioUrl: '',
              youtubeMusicId: t.videoId,
            };
            return (
              <View key={`${t.videoId}-${idx}`} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, width: 20 }}>{idx + 1}</Text>
                <Image source={{ uri: t.thumbnailUrl }} style={{ width: 44, height: 44, borderRadius: 6 }} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{t.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }} numberOfLines={1}>{t.channelName}</Text>
                </View>
                <DownloadButton track={track} size={28} />
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

// ─── Search Section ───────────────────────────────────────────────────────────

interface SearchSectionProps {
  platform: 'youtube' | 'youtube_music';
  label: string;
  placeholder: string;
  accentColor: string;
  Icon: React.ComponentType<{ size?: number }>;
  subtitle: string;
}

function SearchSection({ platform, label, placeholder, accentColor, Icon, subtitle }: SearchSectionProps) {
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlTrack, setUrlTrack] = useState<(Track & { youtubeMusicId?: string; youtubeId?: string }) | null>(null);
  const [urlPlaylistTracks, setUrlPlaylistTracks] = useState<PlaylistTrack[]>([]);

  // Whether the current query looks like a URL
  const queryIsUrl = query.includes('youtube.com') || query.includes('youtu.be');

  const clearUrlResults = () => {
    setUrlTrack(null);
    setUrlPlaylistTracks([]);
    setUrlError(null);
  };

  const { data, isFetching, isError } = useQuery({
    queryKey: ['yt-search', platform, activeQuery],
    queryFn: async () => {
      if (!activeQuery) {
        const resp = await fetch(`${BACKEND_URL}/api/youtube/new-releases?maxResults=3`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        return (json.data ?? []) as Array<{ videoId: string; title: string; channelName: string; thumbnailUrl: string }>;
      }
      const resp = await fetch(`${BACKEND_URL}/api/youtube/search?q=${encodeURIComponent(activeQuery)}&maxResults=5`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      return (json.data ?? []) as Array<{ videoId: string; title: string; channelName: string; thumbnailUrl: string }>;
    },
    staleTime: 0,        // always re-fetch; prevents stale empty-results cache
    retry: 1,
    enabled: !queryIsUrl,
  });

  const tracks: TrendingTrack[] = (data ?? []).map(item => ({
    videoId: item.videoId,
    title: item.title,
    channelName: item.channelName,
    thumbnailUrl: item.thumbnailUrl,
    source: platform,
  }));

  const handleSearch = async () => {
    if (!query.trim()) return;
    clearUrlResults();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (queryIsUrl) {
      // URL pasted into search box — do a lookup
      setUrlLoading(true);
      try {
        const urlDetected = detectPlatform(query);
        if (!urlDetected) throw new Error('Not a recognized YouTube URL');

        if (isPlaylistUrl(query)) {
          const listId = extractPlaylistId(query);
          if (!listId) throw new Error('Could not extract playlist ID');
          const resp = await fetch(`${BACKEND_URL}/api/youtube/playlist-tracks?listId=${encodeURIComponent(listId)}`);
          if (!resp.ok) throw new Error('Failed to fetch playlist');
          const json = await resp.json();
          const pts: PlaylistTrack[] = json.data ?? [];
          if (pts.length === 0) throw new Error('Playlist is empty or unavailable');
          setUrlPlaylistTracks(pts);
        } else {
          const videoId = extractYouTubeVideoId(query);
          if (!videoId) throw new Error('Could not extract video ID');
          const resp = await fetch(`${BACKEND_URL}/api/youtube/info/${videoId}`);
          if (!resp.ok) throw new Error('Failed to get video info');
          const json = await resp.json();
          const info: YouTubeInfo = json.data;
          const t: Track & { youtubeMusicId?: string; youtubeId?: string } = {
            id: platform === 'youtube_music' ? `ytm-${videoId}` : `yt-${videoId}`,
            title: info.title,
            artistId: '', album: '', albumId: '', isLiked: false,
            artist: info.channel,
            artwork: info.thumbnail,
            duration: info.duration,
            source: platform,
            audioUrl: '',
            youtubeMusicId: platform === 'youtube_music' ? videoId : undefined,
            youtubeId: platform === 'youtube' ? videoId : undefined,
          };
          setUrlTrack(t);
        }
      } catch (e) {
        setUrlError(e instanceof Error ? e.message : 'Lookup failed');
      } finally {
        setUrlLoading(false);
      }
    } else {
      setActiveQuery(query.trim());
    }
  };

  return (
    <View style={{ marginBottom: 8 }}>
      {/* Section header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: `${accentColor}22`, alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <Icon size={18} />
        </View>
        <View>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{label}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{subtitle}</Text>
        </View>
      </View>

      {/* Search row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, gap: 8, marginBottom: 14 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, height: 40 }}>
          <Search size={14} color="rgba(255,255,255,0.3)" />
          <TextInput
            value={query}
            onChangeText={(t) => { setQuery(t); clearUrlResults(); }}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, color: '#fff', fontSize: 13, marginLeft: 8 }}
          />
        </View>
        <Pressable
          onPress={handleSearch}
          style={{ backgroundColor: accentColor, borderRadius: 12, height: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' }}
        >
          {urlLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{queryIsUrl ? 'Look Up' : 'Find'}</Text>}
        </Pressable>
      </View>

      {/* URL error */}
      {urlError ? <Text style={{ color: '#EF4444', fontSize: 12, marginTop: -8, marginBottom: 10, marginHorizontal: 16 }}>{urlError}</Text> : null}

      {/* URL single track result */}
      {urlTrack ? (
        <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
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

      {/* URL playlist results */}
      {urlPlaylistTracks.length > 0 ? (
        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
            {urlPlaylistTracks.length} tracks in playlist
          </Text>
          {urlPlaylistTracks.map((pt) => {
            const t: Track & { youtubeMusicId?: string } = {
              id: `ytm-${pt.videoId}`,
              title: pt.title,
              artistId: '', album: '', albumId: '', isLiked: false,
              artist: pt.channel,
              artwork: pt.thumbnail,
              duration: pt.duration,
              source: 'youtube_music',
              audioUrl: '',
              youtubeMusicId: pt.videoId,
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

      {/* Text search results */}
      {!queryIsUrl ? (
        <>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 10 }}>
            {activeQuery ? `Results for "${activeQuery}"` : 'Trending Now'}
          </Text>
          {isFetching ? (
            <ActivityIndicator size="small" color={accentColor} style={{ marginVertical: 16 }} />
          ) : tracks.length > 0 ? (
            tracks.map(item => <TrendingTrackCard key={item.videoId} item={item} />)
          ) : (
            <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginVertical: 16 }}>No results found</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

// ─── SoundCloud Section ───────────────────────────────────────────────────────

interface SCSearchResult {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
}

function SoundCloudSection() {
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  const { data, isFetching, isError } = useQuery({
    queryKey: ['sc-search', activeQuery],
    queryFn: async () => {
      const resp = await fetch(`${BACKEND_URL}/api/soundcloud/search?q=${encodeURIComponent(activeQuery)}&maxResults=5`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      return (json.data ?? []) as SCSearchResult[];
    },
    staleTime: 0,
    retry: 1,
    enabled: !!activeQuery,
  });

  const results: SCSearchResult[] = data ?? [];

  const handleSearch = () => {
    if (!query.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveQuery(query.trim());
  };

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,85,0,0.15)', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
          <SoundCloudIcon size={22} />
        </View>
        <View>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>SoundCloud</Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>Search and download tracks</Text>
        </View>
      </View>

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
            autoCapitalize="none"
            autoCorrect={false}
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
        <ActivityIndicator size="small" color="#FF5500" style={{ marginVertical: 16 }} />
      ) : isError ? (
        <Text style={{ color: '#EF4444', fontSize: 12, textAlign: 'center', marginVertical: 12, marginHorizontal: 16 }}>Search failed — check your connection</Text>
      ) : results.length > 0 ? (
        results.map((item) => {
          const track: Track & { soundcloudUrl?: string } = {
            id: `sc-${item.trackId}`,
            title: item.title,
            artistId: '', album: '', albumId: '', isLiked: false,
            artist: item.artist,
            artwork: item.artwork,
            duration: item.duration,
            source: 'soundcloud',
            audioUrl: item.soundcloudUrl,
            soundcloudUrl: item.soundcloudUrl,
          };
          return (
            <View key={item.trackId} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 16 }}>
              <Image source={{ uri: item.artwork }} style={{ width: 52, height: 52, borderRadius: 6 }} contentFit="cover" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{item.artist}</Text>
              </View>
              <DownloadButton track={track} size={28} />
            </View>
          );
        })
      ) : activeQuery && !isFetching ? (
        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', marginVertical: 16 }}>No results found</Text>
      ) : null}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AddMusicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { prefillUrl } = useLocalSearchParams<{ prefillUrl?: string }>();

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <LinearGradient
        colors={['#1a1a2e', '#0A0A0A']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }}
      />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 8 }}>
        <View>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Add Music</Text>
          <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 2 }}>Download from your favorite platforms</Text>
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
        <ScrollView
          contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Paste a Link — always at top */}
          <View style={{ backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: 16, marginHorizontal: 12, marginBottom: 20, paddingTop: 16, paddingBottom: 12 }}>
            <PasteSection initialUrl={prefillUrl} />
          </View>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 16, marginBottom: 20 }} />

          {/* YouTube */}
          <View style={{ backgroundColor: 'rgba(255,0,0,0.05)', borderRadius: 16, marginHorizontal: 12, marginBottom: 16, paddingTop: 16, paddingBottom: 12 }}>
            <SearchSection
              platform="youtube"
              label="YouTube"
              subtitle="Download videos as audio"
              placeholder="Search YouTube..."
              accentColor="#FF0000"
              Icon={YouTubeIcon}
            />
          </View>

          {/* YouTube Music */}
          <View style={{ backgroundColor: 'rgba(255,0,0,0.05)', borderRadius: 16, marginHorizontal: 12, marginBottom: 16, paddingTop: 16, paddingBottom: 12 }}>
            <SearchSection
              platform="youtube_music"
              label="YouTube Music"
              subtitle="Download music tracks"
              placeholder="Search YouTube Music..."
              accentColor="#FF0000"
              Icon={YouTubeMusicIcon}
            />
          </View>

          {/* SoundCloud */}
          <View style={{ backgroundColor: 'rgba(255,85,0,0.05)', borderRadius: 16, marginHorizontal: 12, marginBottom: 16, paddingTop: 16, paddingBottom: 12 }}>
            <SoundCloudSection />
          </View>

          {/* Spotify */}
          <View style={{ backgroundColor: 'rgba(29,185,84,0.06)', borderRadius: 16, marginHorizontal: 12, marginBottom: 16, paddingTop: 16, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Text style={{ color: '#000', fontSize: 16, fontWeight: '900' }}>♫</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Spotify</Text>
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>Paste a playlist link above to import</Text>
              </View>
            </View>
            <View style={{ marginTop: 12, marginHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 18 }}>
                Copy any Spotify playlist URL and paste it in the{' '}
                <Text style={{ color: '#1DB954', fontWeight: '600' }}>Paste a Link</Text>
                {' '}section above. Tracks are found on YouTube and play in-app.
              </Text>
            </View>
          </View>

          {/* Apple Music */}
          <View style={{ backgroundColor: 'rgba(252,60,68,0.06)', borderRadius: 16, marginHorizontal: 12, marginBottom: 16, paddingTop: 16, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FC3C44', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>♪</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Apple Music</Text>
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>Paste an album or playlist link above</Text>
              </View>
            </View>
            <View style={{ marginTop: 12, marginHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 }}>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 18 }}>
                Copy any Apple Music album or playlist URL and paste it in the{' '}
                <Text style={{ color: '#FC3C44', fontWeight: '600' }}>Paste a Link</Text>
                {' '}section above. Tracks are matched on YouTube and play in-app.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
