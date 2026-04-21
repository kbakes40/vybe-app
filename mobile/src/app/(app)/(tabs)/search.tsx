import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  Keyboard,
  ActivityIndicator,
  KeyboardAvoidingView,
  TextInput,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search as SearchIcon, X } from 'lucide-react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
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
import {
  tabScreenContentContainerPaddingBottom,
  BOTTOM_DOCK_HEIGHT,
  SEARCH_BROWSE_GRID_PADDING_EXTRA,
} from '@/constants/Layout';
import { useLouisOledChrome } from '@/hooks/useLouisOledChrome';
import { filterDeadYoutubeQueueTracks } from '@/lib/queueSanitize';
import { NeonVybeSearchSectionHeader } from '@/components/SearchResults';
import { VIBRANT_BLUE, SHADOW_BLUE_SOFT } from '@/constants/machinedTheme';

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

interface GlobalSearchApiRow {
  soundcloudTop: SCTrack[];
  soundcloudRest: SCTrack[];
  vaultTracks: Array<
    PlaylistTrack & { vaultLabel?: string; recoveryHint?: string }
  >;
  vaultDeferred?: boolean;
}

/** Unwrapped `data` from GET /api/search/global/vault (see `api.get`). */
type VaultSearchPayload = { vaultTracks: GlobalSearchApiRow['vaultTracks'] };

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

function VaultMachinedSkeletonBlock() {
  return (
    <View style={{ paddingHorizontal: 20, gap: 12 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: VIBRANT_BLUE,
              backgroundColor: 'rgba(0,229,255,0.09)',
              ...Platform.select({
                ios: {
                  shadowColor: VIBRANT_BLUE,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.45,
                  shadowRadius: 8,
                },
                android: { elevation: 4 },
                default: {},
              }),
            }}
          />
          <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
            <View
              style={{
                height: 14,
                width: '68%',
                borderRadius: 4,
                borderWidth: 1,
                borderColor: 'rgba(0,229,255,0.35)',
                backgroundColor: 'rgba(0,229,255,0.06)',
              }}
            />
            <View
              style={{
                height: 12,
                width: '40%',
                borderRadius: 4,
                borderWidth: 1,
                borderColor: 'rgba(0,229,255,0.22)',
                backgroundColor: 'rgba(0,229,255,0.04)',
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const BROWSE_ROW_GAP = 8;
const BROWSE_HORIZONTAL_PAD = 16;

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

export default function SearchScreen() {
  useCancelPrefetchOnBlur();
  const insets = useSafeAreaInsets();
  const { louis, kickTranslateStyle, tabListTopPadding } = useLouisOledChrome(insets.top);
  const { width: windowWidth } = useWindowDimensions();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const [selectedGenre, setSelectedGenre] = useState<string | null>(() => lastSelectedGenre);

  // Live unified search (YouTube Music + SoundCloud) for the typed bar — stale-while-revalidate.
  const [liveSoundCloudTracks, setLiveSoundCloudTracks] = useState<Track[]>([]);
  const [liveYtMusicTracks, setLiveYtMusicTracks] = useState<Track[]>([]);
  const [liveSearchFetching, setLiveSearchFetching] = useState(false);
  const [vaultDeferredLatch, setVaultDeferredLatch] = useState(false);

  const scRevealOpacity = useSharedValue(1);
  const lastScRevealKey = useRef('');

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

  // De-dupe: tracks (mockData) and downloads share id space ('yt3', etc.),
  // and React would otherwise flag duplicate keys in the Songs rail.
  const dedupeById = <T extends { id: string }>(rows: T[]) => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out;
  };

  const filteredTracks = searchQuery
    ? dedupeById(
        allSearchableTracks.filter(t =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.artist.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : [];

  const filteredDownloads = searchQuery
    ? dedupeById(
        downloads.filter(t =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.artist.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : [];

  // 50ms debounce; hydrate from MMKV; parallel YT Music + SoundCloud; keep prior rows until replace (SWR).
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setLiveSoundCloudTracks([]);
      setLiveYtMusicTracks([]);
      setLiveSearchFetching(false);
      setVaultDeferredLatch(false);
      lastScRevealKey.current = '';
      scRevealOpacity.value = 1;
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
      const globalP = withTimeout(
        api.get<GlobalSearchApiRow>(`/api/search/global?q=${encodeURIComponent(q)}`),
        24000,
      ).catch(() => null);
      const vaultP = withTimeout(
        api.get<VaultSearchPayload>(`/api/search/global/vault?q=${encodeURIComponent(q)}`),
        24000,
      ).catch(() => null);

      void (async () => {
        const mapVault = (rows: GlobalSearchApiRow['vaultTracks']) =>
          filterDeadYoutubeQueueTracks(
            (rows ?? []).map((t) => ({
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
            })),
          );

        try {
          const payload = await globalP;
          if (cancelled) return;
          if (!payload) {
            // 502 / timeout — keep MMKV-hydrated rows; still try vault-only.
            setVaultDeferredLatch(false);
            const vaultOnly = await vaultP;
            if (!cancelled && vaultOnly?.vaultTracks?.length) {
              const ytMapped = mapVault(vaultOnly.vaultTracks);
              setLiveYtMusicTracks(ytMapped);
              ytMapped.slice(0, 3).forEach((tr) => {
                if (tr.youtubeMusicId) preResolveYoutubeVideoId(tr.youtubeMusicId);
              });
            }
            return;
          }
          if (payload.vaultDeferred) {
            setVaultDeferredLatch(true);
          } else {
            setVaultDeferredLatch(false);
          }
          const scRows = [...(payload.soundcloudTop ?? []), ...(payload.soundcloudRest ?? [])];
          const scMapped: Track[] = scRows.map((t) => ({
            id: `sc-${t.trackId}`,
            title: t.title,
            artist: t.artist,
            artwork: t.artwork,
            duration: t.duration,
            isLiked: false,
            source: 'soundcloud' as const,
            soundcloudUrl: t.soundcloudUrl,
            soundcloudId: t.trackId,
            audioUrl: '',
            artistId: '',
            album: '',
            albumId: '',
          }));
          setLiveSoundCloudTracks(scMapped);

          let ytMapped: Track[] = mapVault(payload.vaultTracks);
          if (ytMapped.length > 0) {
            setLiveYtMusicTracks(ytMapped);
          }

          const vaultPayload = await vaultP;
          if (!cancelled && vaultPayload?.vaultTracks?.length) {
            ytMapped = mapVault(vaultPayload.vaultTracks);
            setLiveYtMusicTracks(ytMapped);
          }
          if (!cancelled) setVaultDeferredLatch(false);

          searchMMKV.set(`typed:${q.toLowerCase()}`, { yt: ytMapped, sc: scMapped });

          ytMapped.slice(0, 3).forEach((tr) => {
            if (tr.youtubeMusicId) preResolveYoutubeVideoId(tr.youtubeMusicId);
          });
          scMapped.slice(0, 10).forEach((tr) => {
            if (tr.soundcloudUrl) preResolveSoundcloudStreamUrl(tr.soundcloudUrl);
          });
          scMapped.slice(0, 10).forEach((tr) => {
            if (tr.artwork) void Image.prefetch(tr.artwork);
          });
        } catch {
          if (!cancelled) setVaultDeferredLatch(false);
        } finally {
          if (!cancelled) setLiveSearchFetching(false);
        }
      })();
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    if (liveSoundCloudTracks.length === 0) return;
    const k = `${q}|${liveSoundCloudTracks[0]?.id ?? ''}|${liveSoundCloudTracks.length}`;
    if (lastScRevealKey.current === k) return;
    lastScRevealKey.current = k;
    scRevealOpacity.value = 0.8;
    scRevealOpacity.value = withTiming(1, { duration: 260 });
  }, [searchQuery, liveSoundCloudTracks]);

  const scListRevealStyle = useAnimatedStyle(() => ({
    opacity: scRevealOpacity.value,
  }));

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

  const browseGridHRef = useRef(0);
  const [browseGridVersion, setBrowseGridVersion] = useState(0);
  const gridEnterScale = useSharedValue(1);
  const gridEnterOpacity = useSharedValue(1);
  const gridEnterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: gridEnterScale.value }],
    opacity: gridEnterOpacity.value,
  }));

  useFocusEffect(
    // useFocusEffect callbacks MUST return a function (or nothing). Returning
    // `undefined` from one branch and nothing from another sometimes lands as
    // a non-function cleanup in Hermes-minified bundles and crashes with
    // "TypeError: _b.call is not a function (it is undefined)". A no-op
    // closing function is the bulletproof contract.
    useCallback(() => {
      if (selectedGenre || searchQuery.trim().length > 0 || spotifyPlaylistId) {
        return () => {};
      }
      gridEnterScale.value = 0.96;
      gridEnterOpacity.value = 0.75;
      gridEnterScale.value = withSpring(1, { damping: 16, stiffness: 260 });
      gridEnterOpacity.value = withTiming(1, { duration: 280 });
      return () => {};
    }, [selectedGenre, searchQuery, spotifyPlaylistId]),
  );

  const rows = Math.ceil(categories.length / 2);
  const browseDockPad = BOTTOM_DOCK_HEIGHT + Math.max(insets.bottom, 8) + 10;
  const colW = (windowWidth - BROWSE_HORIZONTAL_PAD * 2) / 2;
  const rawBrowseH = browseGridHRef.current;
  const tileH =
    rawBrowseH > 0
      ? Math.max(
          56,
          Math.floor(
            (rawBrowseH - BROWSE_ROW_GAP * Math.max(0, rows - 1)) / rows,
          ),
        )
      : Math.max(
          56,
          Math.floor((420 - BROWSE_ROW_GAP * Math.max(0, rows - 1)) / rows),
        );

  const onBrowseGridLayout = useCallback((h: number) => {
    if (h <= 0) return;
    if (Math.abs(h - browseGridHRef.current) < 2) return;
    browseGridHRef.current = h;
    setBrowseGridVersion((v) => v + 1);
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000000' }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <Animated.View style={[{ flex: 1 }, louis && kickTranslateStyle]}>
      <View style={{ paddingHorizontal: 20, paddingTop: tabListTopPadding, paddingBottom: 14 }}>
        {!selectedGenre ? (
          <Text
            style={{
              color: '#fff',
              fontSize: 26,
              fontWeight: '700',
              letterSpacing: -0.4,
              marginBottom: 14,
            }}
          >
            Search
          </Text>
        ) : null}
        <View
          style={[
            styles.searchBarOuter,
            searchFocused && styles.searchBarOuterFocused,
          ]}
        >
          <View
            style={[
              styles.searchBarInner,
              searchFocused && styles.searchBarInnerFocused,
            ]}
          >
            <SearchIcon size={20} color={searchFocused ? VIBRANT_BLUE : 'rgba(255,255,255,0.55)'} />
            <VybeTextInput
              ref={inputRef}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Artists, songs, or playlists"
              variant="search"
              returnKeyType="search"
              blurOnSubmit={false}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onSubmitEditing={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                flex: 1,
                marginLeft: 12,
                fontSize: 16,
                paddingVertical: 0,
                minHeight: 26,
                backgroundColor: 'transparent',
              }}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={false}
            />
            {searchQuery ? (
              <Pressable onPress={handleClear} hitSlop={8}>
                <X size={20} color="rgba(255,255,255,0.6)" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {showGenreDiscover ? (
        <View style={{ flex: 1 }}>
          <GenreDiscoverContent genre={selectedGenre!} onBack={handleBack} />
        </View>
      ) : !spotifyPlaylistId && searchQuery.trim() === '' ? (
        <View
          style={{
            flex: 1,
            minHeight: 0,
            paddingHorizontal: BROWSE_HORIZONTAL_PAD,
            paddingBottom: browseDockPad,
          }}
        >
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
          <View
            style={{ flex: 1, minHeight: 0 }}
            onLayout={(e) => onBrowseGridLayout(e.nativeEvent.layout.height)}
          >
            <Animated.View style={[{ flex: 1, minHeight: 0 }, gridEnterStyle]}>
              <FlatList
                data={categories}
                keyExtractor={(c) => c.id}
                numColumns={2}
                scrollEnabled={false}
                extraData={`${browseGridVersion}-${tileH}-${colW}`}
                renderItem={({ item, index }) => {
                  const row = Math.floor(index / 2);
                  const isLastRow = row === rows - 1;
                  return (
                    <View
                      style={{
                        width: colW,
                        height: tileH,
                        marginBottom: isLastRow ? 0 : BROWSE_ROW_GAP,
                      }}
                    >
                      <CategoryCard
                        category={item}
                        onPress={() => {
                          if (item.id === 'c11') {
                            router.push('/(app)/radio' as never);
                            return;
                          }
                          handleGenrePress(item.name);
                        }}
                        lockedTileHeight={tileH}
                      />
                    </View>
                  );
                }}
              />
            </Animated.View>
          </View>
        </View>
      ) : (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: tabScreenContentContainerPaddingBottom(insets.bottom) + SEARCH_BROWSE_GRID_PADDING_EXTRA,
        }}
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
                    <View style={{ width: 56, height: 56, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1C1C1C', marginRight: 14 }}>
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
                      <View style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1C1C1C', marginRight: 12 }}>
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
                      <TrackCard key={`dl-${track.id}`} track={track} queue={filteredDownloads} />
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
                      <TrackCard key={`song-${track.id}`} track={track} queue={filteredTracks} />
                    ))}
                  </View>
                ) : null}

                {liveSoundCloudTracks.length > 0 || (liveSearchFetching && liveSoundCloudTracks.length === 0 && liveYtMusicTracks.length === 0) ? (
                  <View style={{ marginTop: 8 }}>
                    <NeonVybeSearchSectionHeader
                      variant="waves"
                      subtitle="SoundCloud · instant streams (top picks first)"
                    />
                    {liveSoundCloudTracks.length === 0 && liveSearchFetching ? (
                      <View style={{ paddingHorizontal: 20, gap: 12 }}>
                        {[0, 1, 2].map((i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                            <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
                              <View style={{ height: 14, width: '68%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                              <View style={{ height: 12, width: '40%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)' }} />
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Animated.View style={scListRevealStyle}>
                        {liveSoundCloudTracks.map((track) => (
                          <TrackCard
                            key={`sc-${track.id}`}
                            track={track}
                            queue={liveSoundCloudTracks}
                            rowVariant="search"
                          />
                        ))}
                      </Animated.View>
                    )}
                  </View>
                ) : null}

                {liveYtMusicTracks.length > 0 || (liveSearchFetching && liveYtMusicTracks.length === 0 && liveSoundCloudTracks.length === 0) ? (
                  <View style={{ marginTop: 28 }}>
                    <NeonVybeSearchSectionHeader
                      variant="music"
                      subtitle="Vault Tracks · may need longer Machined Recovery (YouTube)"
                    />
                    {liveYtMusicTracks.length === 0 && (liveSearchFetching || vaultDeferredLatch) ? (
                      <VaultMachinedSkeletonBlock />
                    ) : (
                      liveYtMusicTracks.map((track) => (
                        <TrackCard
                          key={`vault-${track.id}`}
                          track={track}
                          queue={liveYtMusicTracks}
                          rowVariant="search"
                        />
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
        ) : null}
      </ScrollView>
      )}
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  searchBarOuter: {
    borderRadius: 16,
    padding: 1,
    backgroundColor: 'rgba(8,145,178,0.12)',
    borderWidth: 1,
    borderColor: VIBRANT_BLUE,
  },
  /** Focus: cyan bloom — keep 1px border stable so the pill does not shift. */
  searchBarOuterFocused: {
    backgroundColor: SHADOW_BLUE_SOFT,
    borderColor: VIBRANT_BLUE,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: VIBRANT_BLUE,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.65,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  searchBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#06090e',
    borderRadius: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(8,145,178,0.4)',
  },
  searchBarInnerFocused: {
    borderColor: VIBRANT_BLUE,
    ...Platform.select({
      ios: {
        shadowColor: VIBRANT_BLUE,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      default: {},
    }),
  },
});
