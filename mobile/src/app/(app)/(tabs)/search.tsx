import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Keyboard,
  ActivityIndicator,
  KeyboardAvoidingView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search as SearchIcon, X, Music, Radio } from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { VybeTextInput } from '@/components/VybeTextInput';
import { useCancelPrefetchOnBlur } from '@/hooks/usePrefetch';
import { cancelNativePrefetchQueue } from '@/stores/prefetchStore';
import { Image } from 'expo-image';
import { CategoryCard } from '@/components/CategoryCard';
import { TrackCard } from '@/components/TrackCard';
import { ArtistCard } from '@/components/ArtistCard';
import { GenreDiscoverContent } from '@/components/genre/GenreDiscoverContent';
import { categories, tracks, artists } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { api } from '@/lib/api/api';
import { Track } from '@/types/music';
import { createMMKVCache } from '@/lib/mmkv-cache';
import { lastSelectedGenre, setLastSelectedGenre } from '@/lib/genreSearchCache';
import { preResolveYoutubeVideoId } from '@/lib/youtubeResolvePreloadCache';
import { preResolveSoundcloudStreamUrl } from '@/lib/soundcloudStreamPreloadCache';
import { TAB_MAIN_SCROLL_PADDING_BOTTOM } from '@/constants/Layout';

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

interface TypedSearchDiskEntry {
  yt: Track[];
  sc: Track[];
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

const searchMMKV = createMMKVCache('vybe-search');

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

export default function SearchScreen() {
  useCancelPrefetchOnBlur();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<TextInput>(null);

  const [selectedGenre, setSelectedGenre] = useState<string | null>(() => lastSelectedGenre);

  // Live unified search (YouTube Music + SoundCloud) for the typed bar — stale-while-revalidate.
  const [liveSoundCloudTracks, setLiveSoundCloudTracks] = useState<Track[]>([]);
  const [liveYtMusicTracks, setLiveYtMusicTracks] = useState<Track[]>([]);
  const [liveSearchFetching, setLiveSearchFetching] = useState(false);

  const [spotifyResult, setSpotifyResult] = useState<SpotifyPlaylistResult | null>(null);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState<string | null>(null);

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

  // 50ms debounce; hydrate from MMKV; parallel YT Music + SoundCloud; keep prior rows until replace (SWR).
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setLiveSoundCloudTracks([]);
      setLiveYtMusicTracks([]);
      setLiveSearchFetching(false);
      return;
    }

    const disk = searchMMKV.get<TypedSearchDiskEntry>(`typed:${q.toLowerCase()}`, 10 * 60 * 1000);
    if (disk?.value && !disk.isStale) {
      setLiveYtMusicTracks(disk.value.yt);
      setLiveSoundCloudTracks(disk.value.sc);
    }

    let cancelled = false;
    setLiveSearchFetching(true);
    const handle = setTimeout(() => {
      const scP = withTimeout(
        api.get<SCTrack[]>(`/api/soundcloud/search?q=${encodeURIComponent(q)}&maxResults=35`),
        18000,
      ).catch(() => [] as SCTrack[]);
      const ytP = withTimeout(
        api.get<PlaylistTrack[]>(`/api/youtube/search?q=${encodeURIComponent(`${q} music`)}&maxResults=18`),
        18000,
      ).catch(() => [] as PlaylistTrack[]);
      Promise.all([scP, ytP])
        .then(([scRes, ytRes]) => {
          if (cancelled) return;
          const scMapped: Track[] = (scRes ?? []).map((t) => ({
            id: `sc-${t.trackId}`,
            title: t.title,
            artist: t.artist,
            artwork: t.artwork,
            duration: t.duration,
            isLiked: false,
            source: 'soundcloud' as const,
            soundcloudUrl: t.soundcloudUrl,
            audioUrl: '',
            artistId: '',
            album: '',
            albumId: '',
          }));
          const ytMapped: Track[] = (ytRes ?? []).map((t) => ({
            id: `ytm-${t.videoId}`,
            title: t.title,
            artist: t.channelName,
            artwork: t.thumbnailUrl,
            source: 'youtube_music' as const,
            youtubeMusicId: t.videoId,
            audioUrl: '',
            artistId: '',
            album: '',
            albumId: '',
            isLiked: false,
            duration: 0,
          }));
          setLiveSoundCloudTracks(scMapped);
          setLiveYtMusicTracks(ytMapped);
          searchMMKV.set(`typed:${q.toLowerCase()}`, { yt: ytMapped, sc: scMapped });

          ytMapped.slice(0, 3).forEach((tr) => {
            const id = tr.youtubeMusicId ?? tr.youtubeId;
            if (id) preResolveYoutubeVideoId(id);
          });
          scMapped.slice(0, 3).forEach((tr) => {
            if (tr.soundcloudUrl) preResolveSoundcloudStreamUrl(tr.soundcloudUrl);
          });
          [...ytMapped, ...scMapped].slice(0, 10).forEach((tr) => {
            if (tr.artwork) void Image.prefetch(tr.artwork);
          });
        })
        .catch(() => {
          /* keep stale rows */
        })
        .finally(() => {
          if (!cancelled) setLiveSearchFetching(false);
        });
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
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
    setLastSelectedGenre(null);
    setSelectedGenre(null);
  };

  const handleGenrePress = (genre: string) => {
    cancelNativePrefetchQueue();
    setSelectedGenre(genre);
  };

  const showGenreDiscover =
    !!selectedGenre && !spotifyPlaylistId && searchQuery.trim().length === 0;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const id = requestAnimationFrame(() => {
        if (!cancelled && !showGenreDiscover) {
          inputRef.current?.focus();
        }
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(id);
      };
    }, [showGenreDiscover]),
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0A0A0A' }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 16 }}>
        {!selectedGenre ? (
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 16 }}>Search</Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 }}>
          <SearchIcon size={20} color="rgba(255,255,255,0.6)" />
          <VybeTextInput
            ref={inputRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Artists, songs, or playlists"
            variant="search"
            returnKeyType="search"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            style={{
              flex: 1,
              marginLeft: 12,
              fontSize: 16,
              paddingVertical: 0,
              minHeight: 24,
              backgroundColor: 'transparent',
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={!showGenreDiscover}
          />
          {searchQuery ? (
            <Pressable onPress={handleClear}>
              <X size={20} color="rgba(255,255,255,0.6)" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {showGenreDiscover ? (
        <View style={{ flex: 1 }}>
          <GenreDiscoverContent genre={selectedGenre!} onBack={handleBack} />
        </View>
      ) : (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: TAB_MAIN_SCROLL_PADDING_BOTTOM }}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
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
            {filteredDownloads.length > 0 || filteredTracks.length > 0 || filteredArtists.length > 0 || liveSoundCloudTracks.length > 0 || liveYtMusicTracks.length > 0 || liveSearchFetching ? (
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

                {liveYtMusicTracks.length > 0 || (liveSearchFetching && liveYtMusicTracks.length === 0 && liveSoundCloudTracks.length === 0) ? (
                  <View style={{ marginTop: 24 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                        <Music size={11} color="#fff" strokeWidth={2.5} />
                      </View>
                      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Vybe Music</Text>
                    </View>
                    {liveYtMusicTracks.length === 0 && liveSearchFetching ? (
                      <View style={{ paddingHorizontal: 20, gap: 12 }}>
                        {[0, 1, 2].map((i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                            <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
                              <View style={{ height: 14, width: '70%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                              <View style={{ height: 12, width: '45%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)' }} />
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : (
                      liveYtMusicTracks.map((track) => (
                        <TrackCard key={track.id} track={track} queue={liveYtMusicTracks} />
                      ))
                    )}
                  </View>
                ) : null}

                {liveSoundCloudTracks.length > 0 || (liveSearchFetching && liveSoundCloudTracks.length === 0 && liveYtMusicTracks.length === 0) ? (
                  <View style={{ marginTop: 24 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                        <Radio size={14} color="rgba(255,255,255,0.9)" strokeWidth={2.5} />
                      </View>
                      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Vybe Waves</Text>
                    </View>
                    {liveSoundCloudTracks.length === 0 && liveSearchFetching ? (
                      <View style={{ paddingHorizontal: 20, gap: 12 }}>
                        {[0, 1, 2].map((i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                            <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
                              <View style={{ height: 14, width: '68%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                              <View style={{ height: 12, width: '40%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)' }} />
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : (
                      liveSoundCloudTracks.map((track) => (
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
        ) : (
          <View style={{ paddingHorizontal: 16, paddingBottom: 150 }}>
            <Text
              style={{
                color: '#fff',
                fontSize: 18,
                fontWeight: '800',
                letterSpacing: -0.35,
                paddingHorizontal: 4,
                marginBottom: 12,
              }}
            >
              Browse All
            </Text>
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
      )}
    </KeyboardAvoidingView>
  );
}
