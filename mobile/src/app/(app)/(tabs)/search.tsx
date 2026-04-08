import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Keyboard, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search as SearchIcon, X, ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { CategoryCard } from '@/components/CategoryCard';
import { TrackCard } from '@/components/TrackCard';
import { ArtistCard } from '@/components/ArtistCard';
import { categories, tracks, artists } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { api } from '@/lib/api/api';
import { Track } from '@/types/music';

interface PlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
}

interface SCTrack {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
}

interface CacheEntry {
  ytMusic: Track[];
  youtube: Track[];
  soundcloud: Track[];
  timestamp: number;
}

interface SpotifyPlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  durationMs: number;
}

interface SpotifyPlaylistResult {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  tracks: SpotifyPlaylistTrack[];
}

function extractSpotifyPlaylistId(input: string): string | null {
  const m = input.match(/spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

// Module-level cache — survives navigation, cleared on app restart
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const genreCache = new Map<string, CacheEntry>();
let lastSelectedGenre: string | null = null;

function isFresh(entry: CacheEntry) {
  return Date.now() - entry.timestamp < CACHE_TTL;
}

function GenreTrackCard({ track, onPress }: { track: Track; onPress: () => void }) {
  const label = track.source === 'youtube_music' ? 'YouTube Music'
    : track.source === 'soundcloud' ? 'SoundCloud' : 'YouTube';
  return (
    <Pressable onPress={onPress} style={{ marginRight: 12, width: 120 }}>
      <View style={{ width: 120, height: 120, borderRadius: 8, overflow: 'hidden', backgroundColor: '#1A1A1A', marginBottom: 6 }}>
        {track.artwork ? (
          <Image source={{ uri: track.artwork }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : null}
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, marginBottom: 2 }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }} numberOfLines={2}>{track.title}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }} numberOfLines={1}>{track.artist}</Text>
    </Pressable>
  );
}

function SectionRow({ label, icon, loading, tracks: rowTracks, onPlay }: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  tracks: Track[];
  onPlay: (track: Track) => void;
}) {
  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        {icon}
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 8 }}>{label}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color="#8B5CF6" style={{ alignSelf: 'flex-start', marginLeft: 4 }} />
      ) : rowTracks.length === 0 ? (
        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, paddingLeft: 4 }}>No results</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          {rowTracks.map(track => (
            <GenreTrackCard key={track.id} track={track} onPress={() => onPlay(track)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  const [selectedGenre, setSelectedGenre] = useState<string | null>(lastSelectedGenre);
  const [ytMusicTracks, setYtMusicTracks] = useState<Track[]>(() => {
    if (lastSelectedGenre) {
      const cached = genreCache.get(lastSelectedGenre);
      return cached && isFresh(cached) ? cached.ytMusic : [];
    }
    return [];
  });
  const [youtubeTracks, setYoutubeTracks] = useState<Track[]>(() => {
    if (lastSelectedGenre) {
      const cached = genreCache.get(lastSelectedGenre);
      return cached && isFresh(cached) ? cached.youtube : [];
    }
    return [];
  });
  const [scTracks, setScTracks] = useState<Track[]>(() => {
    if (lastSelectedGenre) {
      const cached = genreCache.get(lastSelectedGenre);
      return cached && isFresh(cached) ? cached.soundcloud : [];
    }
    return [];
  });
  const [ytMusicLoading, setYtMusicLoading] = useState(false);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [scLoading, setScLoading] = useState(false);

  const [spotifyResult, setSpotifyResult] = useState<SpotifyPlaylistResult | null>(null);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);

  // Live search results (YouTube Music + SoundCloud) for typed queries
  const [liveYtmTracks, setLiveYtmTracks] = useState<Track[]>([]);
  const [liveScTracks, setLiveScTracks] = useState<Track[]>([]);
  const [liveSearchLoading, setLiveSearchLoading] = useState(false);
  const liveSearchRef = useRef<string>('');

  // Tracks which genre's requests are "current" — stale callbacks are ignored
  const activeGenreRef = useRef<string | null>(lastSelectedGenre);

  const playTrack = usePlaybackController(s => s.playTrack);
  const downloads = useDownloadsStore(s => s.downloads);

  const spotifyPlaylistId = extractSpotifyPlaylistId(searchQuery);

  const handleLoadSpotify = async () => {
    if (!spotifyPlaylistId) return;
    setSpotifyLoading(true);
    setSpotifyError(null);
    setSpotifyResult(null);
    try {
      const result = await withTimeout(
        api.get<SpotifyPlaylistResult>(`/api/spotify/playlist/${spotifyPlaylistId}`),
        60000
      );
      if (result) setSpotifyResult(result);
      else setSpotifyError('No tracks found.');
    } catch {
      setSpotifyError('Failed to load playlist. Try again.');
    } finally {
      setSpotifyLoading(false);
    }
  };

  // On mount: if we restored a cached genre that's now stale, re-fetch it
  useEffect(() => {
    if (lastSelectedGenre) {
      const cached = genreCache.get(lastSelectedGenre);
      if (!cached || !isFresh(cached)) {
        fetchGenre(lastSelectedGenre);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced live search — fires 600ms after user stops typing
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || extractSpotifyPlaylistId(q)) {
      setLiveYtmTracks([]);
      setLiveScTracks([]);
      setLiveSearchLoading(false);
      return;
    }

    setLiveSearchLoading(true);
    liveSearchRef.current = q;

    const timer = setTimeout(async () => {
      if (liveSearchRef.current !== q) return;
      try {
        const [ytmRes, scRes] = await Promise.allSettled([
          withTimeout(api.get<PlaylistTrack[]>(`/api/youtube/search?q=${encodeURIComponent(q)}&maxResults=8`), 20000),
          withTimeout(api.get<SCTrack[]>(`/api/soundcloud/search?q=${encodeURIComponent(q)}&maxResults=6`), 20000),
        ]);
        if (liveSearchRef.current !== q) return;

        if (ytmRes.status === 'fulfilled' && ytmRes.value) {
          setLiveYtmTracks((ytmRes.value).map(t => ({
            id: `ytm-${t.videoId}`, title: t.title, artist: t.channelName,
            artwork: t.thumbnailUrl, source: 'youtube_music' as const,
            youtubeMusicId: t.videoId, audioUrl: '', artistId: '', album: '', albumId: '', isLiked: false, duration: 0,
          })));
        }
        if (scRes.status === 'fulfilled' && scRes.value) {
          setLiveScTracks((scRes.value).map(t => ({
            id: `sc-${t.trackId}`, title: t.title, artist: t.artist,
            artwork: t.artwork, source: 'soundcloud' as const,
            soundcloudUrl: t.soundcloudUrl, audioUrl: '', artistId: '', album: '', albumId: '', isLiked: false, duration: t.duration,
          })));
        }
      } catch {}
      if (liveSearchRef.current === q) setLiveSearchLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const allSearchableTracks = [...tracks, ...downloads];

  const filteredTracks = searchQuery
    ? allSearchableTracks.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.artist.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const filteredDownloads = searchQuery
    ? downloads.filter(t =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.artist.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const filteredArtists = searchQuery
    ? artists.filter(a => a.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  const hasResults = filteredTracks.length > 0 || filteredArtists.length > 0;

  const handleClear = () => {
    setSearchQuery('');
    setSpotifyResult(null);
    setSpotifyError(null);
    setSpotifyLoading(false);
    inputRef.current?.clear();
  };

  const handleBack = () => {
    activeGenreRef.current = null;
    lastSelectedGenre = null;
    setSelectedGenre(null);
    setYtMusicTracks([]); setYoutubeTracks([]); setScTracks([]);
    setYtMusicLoading(false); setYoutubeLoading(false); setScLoading(false);
  };

  const fetchGenre = (genre: string) => {
    activeGenreRef.current = genre;
    setYtMusicTracks([]); setYoutubeTracks([]); setScTracks([]);
    setYtMusicLoading(true); setYoutubeLoading(true); setScLoading(true);

    const partial: Partial<CacheEntry> = {};

    const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
    const warmVideoIds = (ids: string[]) => {
      ids.slice(0, 4).forEach(id => {
        fetch(`${backendBase}/api/youtube/warm/${id}`).catch(() => {});
      });
    };

    withTimeout(api.get<PlaylistTrack[]>(`/api/youtube/search?q=${encodeURIComponent(genre + ' music')}&maxResults=10`), 25000)
      .then(res => {
        if (activeGenreRef.current !== genre) return;
        const mapped = (res ?? []).map(t => ({
          id: `ytm-${t.videoId}`, title: t.title, artist: t.channelName,
          artwork: t.thumbnailUrl, source: 'youtube_music' as const,
          youtubeMusicId: t.videoId, audioUrl: '', artistId: '', album: '', albumId: '', isLiked: false, duration: 0,
        }));
        partial.ytMusic = mapped;
        setYtMusicTracks(mapped);
        warmVideoIds(mapped.map(t => t.youtubeMusicId!));
      })
      .catch(() => { partial.ytMusic = []; })
      .finally(() => {
        if (activeGenreRef.current !== genre) return;
        setYtMusicLoading(false);
        tryCommitCache(genre, partial);
      });

    withTimeout(api.get<PlaylistTrack[]>(`/api/youtube/search?q=${encodeURIComponent(genre + ' music video')}&maxResults=8`), 25000)
      .then(res => {
        if (activeGenreRef.current !== genre) return;
        const mapped = (res ?? []).map(t => ({
          id: `yt-${t.videoId}`, title: t.title, artist: t.channelName,
          artwork: t.thumbnailUrl, source: 'youtube' as const,
          youtubeId: t.videoId, audioUrl: '', artistId: '', album: '', albumId: '', isLiked: false, duration: 0,
        }));
        partial.youtube = mapped;
        setYoutubeTracks(mapped);
      })
      .catch(() => { partial.youtube = []; })
      .finally(() => {
        if (activeGenreRef.current !== genre) return;
        setYoutubeLoading(false);
        tryCommitCache(genre, partial);
      });

    withTimeout(api.get<SCTrack[]>(`/api/soundcloud/search?q=${encodeURIComponent(genre)}&maxResults=8`), 25000)
      .then(res => {
        if (activeGenreRef.current !== genre) return;
        const mapped = (res ?? []).map(t => ({
          id: `sc-${t.trackId}`, title: t.title, artist: t.artist,
          artwork: t.artwork, source: 'soundcloud' as const,
          soundcloudUrl: t.soundcloudUrl, audioUrl: '', artistId: '', album: '', albumId: '', isLiked: false, duration: t.duration,
        }));
        partial.soundcloud = mapped;
        setScTracks(mapped);
      })
      .catch(() => { partial.soundcloud = []; })
      .finally(() => {
        if (activeGenreRef.current !== genre) return;
        setScLoading(false);
        tryCommitCache(genre, partial);
      });
  };

  // Write to cache once all 3 sections have resolved
  const tryCommitCache = (genre: string, partial: Partial<CacheEntry>) => {
    if (partial.ytMusic !== undefined && partial.youtube !== undefined && partial.soundcloud !== undefined) {
      genreCache.set(genre, {
        ytMusic: partial.ytMusic,
        youtube: partial.youtube,
        soundcloud: partial.soundcloud,
        timestamp: Date.now(),
      });
    }
  };

  const handleGenrePress = (genre: string) => {
    lastSelectedGenre = genre;
    setSelectedGenre(genre);

    const cached = genreCache.get(genre);
    if (cached && isFresh(cached)) {
      // Restore from cache — no spinners, instant results
      activeGenreRef.current = genre;
      setYtMusicTracks(cached.ytMusic);
      setYoutubeTracks(cached.youtube);
      setScTracks(cached.soundcloud);
      setYtMusicLoading(false);
      setYoutubeLoading(false);
      setScLoading(false);
      return;
    }

    fetchGenre(genre);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0A0A0A' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 16 }}>
        {selectedGenre ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <Pressable onPress={handleBack} style={{ marginRight: 12 }}>
              <ChevronLeft size={24} color="#fff" />
            </Pressable>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>{selectedGenre}</Text>
          </View>
        ) : (
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 16 }}>Search</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 }}>
          <SearchIcon size={20} color="rgba(255,255,255,0.6)" />
          <TextInput
            ref={inputRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Artists, songs, or playlists"
            placeholderTextColor="rgba(255,255,255,0.4)"
            keyboardAppearance="dark"
            returnKeyType="search"
            style={{ flex: 1, color: '#fff', marginLeft: 12, fontSize: 16 }}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery ? (
            <Pressable onPress={handleClear}>
              <X size={20} color="rgba(255,255,255,0.6)" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => Keyboard.dismiss()}
      >
        {spotifyPlaylistId ? (
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            {/* Spotify URL detected */}
            {!spotifyResult && !spotifyLoading && (
              <View style={{ alignItems: 'center', paddingTop: 40 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Text style={{ fontSize: 28 }}>♫</Text>
                </View>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 }}>Spotify Playlist Detected</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
                  Tracks will be found on YouTube and played in-app
                </Text>
                <Pressable
                  onPress={handleLoadSpotify}
                  style={{ backgroundColor: '#1DB954', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30 }}
                >
                  <Text style={{ color: '#000', fontWeight: '700', fontSize: 15 }}>Load Playlist</Text>
                </Pressable>
                {spotifyError ? (
                  <Text style={{ color: '#FF5555', fontSize: 13, marginTop: 16 }}>{spotifyError}</Text>
                ) : null}
              </View>
            )}

            {spotifyLoading && (
              <View style={{ alignItems: 'center', paddingTop: 60 }}>
                <ActivityIndicator size="large" color="#1DB954" />
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 16 }}>
                  Finding tracks on YouTube…
                </Text>
              </View>
            )}

            {spotifyResult && (() => {
              const playlistTracks: Track[] = spotifyResult.tracks.map(t => ({
                id: `sp-yt-${t.videoId}`,
                title: t.title,
                artist: t.channelName,
                artistId: '',
                album: spotifyResult.name,
                albumId: `sp-${spotifyResult.playlistId}`,
                artwork: t.thumbnailUrl,
                duration: Math.round(t.durationMs / 1000),
                isLiked: false,
                source: 'youtube_music' as const,
                youtubeId: t.videoId,
                youtubeMusicId: t.videoId,
                youtubeMusicUrl: `https://music.youtube.com/watch?v=${t.videoId}`,
              }));
              return (
                <View>
                  {/* Header */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1C1C1C', marginRight: 14 }}>
                      {spotifyResult.thumbnailUrl ? (
                        <Image source={{ uri: spotifyResult.thumbnailUrl }} style={{ width: 56, height: 56 }} contentFit="cover" />
                      ) : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }} numberOfLines={1}>{spotifyResult.name}</Text>
                      <Text style={{ color: '#1DB954', fontSize: 12, marginTop: 2 }}>via Spotify · {playlistTracks.length} tracks on YouTube</Text>
                    </View>
                    <Pressable
                      onPress={() => playTrack(playlistTracks[0], playlistTracks)}
                      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#000', fontSize: 16, marginLeft: 2 }}>▶</Text>
                    </Pressable>
                  </View>
                  {/* Track list */}
                  {playlistTracks.map((track, idx) => (
                    <Pressable
                      key={track.id}
                      onPress={() => playTrack(track, playlistTracks)}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
                    >
                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, width: 24 }}>{idx + 1}</Text>
                      <View style={{ width: 44, height: 44, borderRadius: 6, overflow: 'hidden', backgroundColor: '#1C1C1C', marginRight: 12 }}>
                        <Image source={{ uri: track.artwork }} style={{ width: 44, height: 44 }} contentFit="cover" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{track.title}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 1 }} numberOfLines={1}>{track.artist}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              );
            })()}
          </View>
        ) : searchQuery ? (
          <View>
            {/* Downloaded matches */}
            {filteredDownloads.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 }}>Downloaded</Text>
                {filteredDownloads.map(track => (
                  <TrackCard key={track.id} track={track} queue={filteredDownloads} />
                ))}
              </View>
            ) : null}

            {/* Artist matches */}
            {filteredArtists.length > 0 ? (
              <View style={{ marginBottom: 24 }}>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 }}>Artists</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }} style={{ flexGrow: 0 }}>
                  {filteredArtists.map(artist => (
                    <ArtistCard key={artist.id} artist={artist} onPress={() => router.push(`/(app)/artist/${artist.id}` as never)} size="small" />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Live YouTube Music results */}
            <SectionRow
              label="YouTube Music"
              icon={<View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10 }}>♪</Text></View>}
              loading={liveSearchLoading}
              tracks={liveYtmTracks}
              onPlay={track => playTrack(track, liveYtmTracks)}
            />

            {/* Live SoundCloud results */}
            <SectionRow
              label="SoundCloud"
              icon={<View style={{ width: 18, height: 14, borderRadius: 3, backgroundColor: '#FF5500', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: -0.5 }}>)))</Text></View>}
              loading={liveSearchLoading}
              tracks={liveScTracks}
              onPlay={track => playTrack(track, liveScTracks)}
            />

            {/* No results at all */}
            {!liveSearchLoading && liveYtmTracks.length === 0 && liveScTracks.length === 0 && filteredDownloads.length === 0 && filteredArtists.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 18 }}>No results for "{searchQuery}"</Text>
              </View>
            ) : null}
          </View>
        ) : selectedGenre ? (
          <View style={{ paddingHorizontal: 20 }}>
            {genreCache.has(selectedGenre) && isFresh(genreCache.get(selectedGenre)!) ? (
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginBottom: 16 }}>
                Results for "{selectedGenre}"
              </Text>
            ) : null}
            <SectionRow
              label="YouTube Music"
              icon={<View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 10 }}>♪</Text></View>}
              loading={ytMusicLoading}
              tracks={ytMusicTracks}
              onPlay={track => playTrack(track, ytMusicTracks)}
            />
            <SectionRow
              label="YouTube"
              icon={<View style={{ width: 18, height: 14, borderRadius: 3, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 0, height: 0, borderTopWidth: 4, borderBottomWidth: 4, borderLeftWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: '#fff', marginLeft: 1 }} /></View>}
              loading={youtubeLoading}
              tracks={youtubeTracks}
              onPlay={track => playTrack(track, youtubeTracks)}
            />
            <SectionRow
              label="SoundCloud"
              icon={<View style={{ width: 18, height: 14, borderRadius: 3, backgroundColor: '#FF5500', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: -0.5 }}>)))</Text></View>}
              loading={scLoading}
              tracks={scTracks}
              onPlay={track => playTrack(track, scTracks)}
            />
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', paddingHorizontal: 4, marginBottom: 12 }}>Browse All</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {categories.map(category => (
                <View key={category.id} style={{ width: '50%' }}>
                  <CategoryCard category={category} onPress={() => handleGenrePress(category.name)} />
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
