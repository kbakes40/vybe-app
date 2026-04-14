import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Keyboard, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { LoadingRing } from '@/components/LoadingRing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search as SearchIcon, X, ChevronLeft, Music, Play, Radio } from 'lucide-react-native';
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
import { createMMKVCache, TTL } from '@/lib/mmkv-cache';

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

// MMKV disk-persisted tier — lets genreCache survive app restart.
// Additive: the in-memory Map above is still the primary cache.
const searchMMKV = createMMKVCache('vybe-search');
const SEARCH_KEY_PREFIX = 'genre:';

// On module load, hydrate in-memory Map from disk (fresh entries only).
// Silent on failure.
try {
  // We don't know which keys exist without enumerating; instead we lazy-hydrate
  // on access via hydrateGenreFromDisk() below.
} catch {
  /* no-op */
}

function hydrateGenreFromDisk(genre: string): CacheEntry | null {
  if (genreCache.has(genre)) return genreCache.get(genre) ?? null;
  const hit = searchMMKV.get<CacheEntry>(`${SEARCH_KEY_PREFIX}${genre}`, CACHE_TTL);
  if (!hit || hit.isStale) return null;
  // Seed the in-memory Map so the rest of the screen's logic sees it.
  genreCache.set(genre, hit.value);
  return hit.value;
}

function GenreTrackCard({ track, onPress }: { track: Track; onPress: () => void }) {
  const label = track.source === 'youtube_music' ? 'Vybe Music'
    : track.source === 'soundcloud' ? 'Vybe Waves' : 'Vybe Video';
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

function SectionRow({ label, icon, loading, tracks: rowTracks, onPlay, loadingColor }: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  tracks: Track[];
  onPlay: (track: Track) => void;
  loadingColor?: string;
}) {
  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        {icon}
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 8 }}>{label}</Text>
      </View>
      {loading ? (
        <View style={{ alignSelf: 'flex-start', marginLeft: 4 }}>
          <LoadingRing size={24} color={loadingColor ?? '#8B5CF6'} />
        </View>
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

  // Live SoundCloud results for the typed search bar (separate from genre cache)
  const [liveSoundCloudTracks, setLiveSoundCloudTracks] = useState<Track[]>([]);
  const [liveSoundCloudLoading, setLiveSoundCloudLoading] = useState(false);

  const [spotifyResult, setSpotifyResult] = useState<SpotifyPlaylistResult | null>(null);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);

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

  // Debounced live SoundCloud search for the typed bar.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setLiveSoundCloudTracks([]);
      setLiveSoundCloudLoading(false);
      return;
    }
    let cancelled = false;
    setLiveSoundCloudLoading(true);
    const handle = setTimeout(() => {
      withTimeout(
        api.get<SCTrack[]>(`/api/soundcloud/search?q=${encodeURIComponent(q)}&maxResults=20`),
        15000,
      )
        .then(res => {
          if (cancelled) return;
          const mapped: Track[] = (res ?? []).map(t => ({
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
          setLiveSoundCloudTracks(mapped);
        })
        .catch(() => { if (!cancelled) setLiveSoundCloudTracks([]); })
        .finally(() => { if (!cancelled) setLiveSoundCloudLoading(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [searchQuery]);

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
      const entry: CacheEntry = {
        ytMusic: partial.ytMusic,
        youtube: partial.youtube,
        soundcloud: partial.soundcloud,
        timestamp: Date.now(),
      };
      genreCache.set(genre, entry);
      // Additive: also persist to MMKV so cache survives app restart.
      searchMMKV.set(`${SEARCH_KEY_PREFIX}${genre}`, entry);
    }
  };

  const handleGenrePress = (genre: string) => {
    lastSelectedGenre = genre;
    setSelectedGenre(genre);

    // Try in-memory first; if miss, try disk (MMKV) before fetching.
    const cached = genreCache.get(genre) ?? hydrateGenreFromDisk(genre);
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
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6 }}>Stream Playlist Detected</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginBottom: 24 }}>
                  Tracks will be matched and played in-app
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
                  Finding tracks…
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
                      <Text style={{ color: '#1DB954', fontSize: 12, marginTop: 2 }}>Stream Library · {playlistTracks.length} tracks</Text>
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
            {filteredDownloads.length > 0 || filteredTracks.length > 0 || filteredArtists.length > 0 || liveSoundCloudTracks.length > 0 || liveSoundCloudLoading ? (
              <>
                {filteredDownloads.length > 0 ? (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 }}>Downloaded</Text>
                    {filteredDownloads.map(track => (
                      <TrackCard key={track.id} track={track} queue={filteredDownloads} />
                    ))}
                  </View>
                ) : null}
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
                {filteredTracks.length > 0 ? (
                  <View>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', paddingHorizontal: 20, marginBottom: 12 }}>Songs</Text>
                    {filteredTracks.slice(0, 10).map(track => (
                      <TrackCard key={track.id} track={track} queue={filteredTracks} />
                    ))}
                  </View>
                ) : null}

                {liveSoundCloudLoading || liveSoundCloudTracks.length > 0 ? (
                  <View style={{ marginTop: 24 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                      <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: '#FF5500', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                        <Radio size={11} color="#fff" strokeWidth={2.5} />
                      </View>
                      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>From Vybe Waves</Text>
                    </View>
                    {liveSoundCloudLoading && liveSoundCloudTracks.length === 0 ? (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <ActivityIndicator color="#FF5500" />
                      </View>
                    ) : (
                      liveSoundCloudTracks.map(track => (
                        <TrackCard key={track.id} track={track} queue={liveSoundCloudTracks} />
                      ))
                    )}
                  </View>
                ) : null}

              </>
            ) : (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
                <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 18 }}>No results for "{searchQuery}"</Text>
              </View>
            )}
          </View>
        ) : selectedGenre ? (
          <View style={{ paddingHorizontal: 20 }}>
            {genreCache.has(selectedGenre) && isFresh(genreCache.get(selectedGenre)!) ? (
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginBottom: 16 }}>
                Results for "{selectedGenre}"
              </Text>
            ) : null}
            <SectionRow
              label="Vybe Music"
              icon={<View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}><Music size={11} color="#fff" strokeWidth={2.5} /></View>}
              loading={ytMusicLoading}
              tracks={ytMusicTracks}
              onPlay={track => playTrack(track, ytMusicTracks)}
              loadingColor="#FF0000"
            />
            <SectionRow
              label="Vybe Video"
              icon={<View style={{ width: 18, height: 14, borderRadius: 3, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}><Play size={9} color="#fff" fill="#fff" /></View>}
              loading={youtubeLoading}
              tracks={youtubeTracks}
              onPlay={track => playTrack(track, youtubeTracks)}
              loadingColor="#FF0000"
            />
            <SectionRow
              label="Vybe Waves"
              icon={<View style={{ width: 18, height: 14, borderRadius: 3, backgroundColor: '#FF5500', alignItems: 'center', justifyContent: 'center' }}><Radio size={10} color="#fff" strokeWidth={2.5} /></View>}
              loading={scLoading}
              tracks={scTracks}
              onPlay={track => playTrack(track, scTracks)}
              loadingColor="#FF7700"
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
