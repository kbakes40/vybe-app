import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Svg, Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Play, Shuffle, Trash2, ListMusic, Music2 } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, SharedValue, interpolate, Extrapolation } from 'react-native-reanimated';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import * as Haptics from 'expo-haptics';
import { useUserPlaylistStore } from '@/stores/userPlaylistStore';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { TrackCard } from '@/components/TrackCard';
import { DownloadButton } from '@/components/DownloadButton';
import { useVybePopup } from '@/components/VybePopup';
import { Track } from '@/types/music';
import { usePlaylistHeroColors } from '@/lib/usePlaylistHeroColors';
import { stackScreenContentContainerPaddingBottom } from '@/constants/Layout';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

// ── Module-level cache for resolved YouTube Music tracks ─────────────────────
// Shared across playlist detail mounts so switching tabs and coming back reuses results.
const ytmTrackCache = new Map<string, Track>();

/**
 * LoadingRing — clean blue progress circle used while the YT Music search is
 * resolving a recommended track. Matches the blue `#3B82F6` ring style of the
 * active DownloadButton so the transition is visually seamless.
 *
 * Since we don't know the real request progress, we simulate a smooth fill
 * from 0 → 90% over ~2.5s (the typical search resolution time), then park at
 * 90% until the component swaps out for the real DownloadButton.
 */
function LoadingRing({ size = 26 }: { size?: number }) {
  const STROKE_WIDTH = 2.5;
  const RADIUS = (size - STROKE_WIDTH) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const DURATION_MS = 2500;
    const TARGET = 0.9;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const next = Math.min(TARGET, (elapsed / DURATION_MS) * TARGET);
      setProgress(next);
      if (next >= TARGET) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={RADIUS}
          stroke="rgba(255,255,255,0.15)" strokeWidth={STROKE_WIDTH} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={RADIUS}
          stroke="#3B82F6" strokeWidth={STROKE_WIDTH} fill="none"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round" rotation="-90"
          origin={`${size / 2}, ${size / 2}`} />
      </Svg>
    </View>
  );
}

/**
 * RecommendedRow — tap-to-play + download for an iTunes recommendation.
 * Resolves the recommendation into a YouTube Music track via the backend
 * search, streams it on tap, and exposes a DownloadButton on the right.
 * If the user taps before the resolver finishes, the play is queued and
 * fires as soon as the track arrives.
 */
function RecommendedRow({
  index,
  trackName,
  artistName,
  artwork,
}: {
  index: number;
  trackName: string;
  artistName: string;
  artwork: string;
}) {
  const playTrack = usePlaybackController((s) => s.playTrack);
  const cacheKey = `${artistName}|||${trackName}`.toLowerCase();
  const [foundTrack, setFoundTrack] = useState<Track | null>(ytmTrackCache.get(cacheKey) ?? null);
  const [pendingPlay, setPendingPlay] = useState(false);

  useEffect(() => {
    if (foundTrack) return;
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/youtube/search?q=${encodeURIComponent(`${artistName} ${trackName}`)}&maxResults=1`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const first = (json.data ?? json ?? [])[0];
        if (first?.videoId) {
          const t: Track & { youtubeId?: string; youtubeMusicId?: string } = {
            id: `ytm-${first.videoId}`,
            title: trackName,
            artist: artistName,
            artistId: '',
            album: '',
            albumId: '',
            artwork,
            duration: 0,
            isLiked: false,
            source: 'youtube_music',
            audioUrl: '',
            youtubeId: first.videoId,
            youtubeMusicId: first.videoId,
          };
          ytmTrackCache.set(cacheKey, t);
          setFoundTrack(t);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cacheKey, trackName, artistName, artwork, foundTrack]);

  useEffect(() => {
    if (pendingPlay && foundTrack) {
      setPendingPlay(false);
      playTrack(foundTrack, [foundTrack]);
    }
  }, [pendingPlay, foundTrack, playTrack]);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (foundTrack) {
      playTrack(foundTrack, [foundTrack]);
    } else {
      setPendingPlay(true);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, width: 20, textAlign: 'center' }}>
        {index + 1}
      </Text>
      {artwork ? (
        <Image source={{ uri: artwork }} style={{ width: 44, height: 44, borderRadius: 6 }} contentFit="cover" />
      ) : (
        <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
          <Music2 size={16} color="#8B5CF6" />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }} numberOfLines={1}>
          {trackName}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
          {artistName}
        </Text>
      </View>
      <View onStartShouldSetResponder={() => true}>
        {foundTrack ? (
          <DownloadButton track={foundTrack} size={26} />
        ) : (
          <LoadingRing size={26} />
        )}
      </View>
    </Pressable>
  );
}

function TrackDeleteAction({ progress, onPress }: { progress: SharedValue<number>; onPress: () => void }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.8, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [16, 0], Extrapolation.CLAMP) }],
  }));
  return (
    <Animated.View style={[style, { width: 80, justifyContent: 'center', alignItems: 'center' }]}>
      <Pressable
        onPress={onPress}
        style={{ width: 68, height: '100%', backgroundColor: '#EF4444', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
      >
        <Trash2 size={20} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 3 }}>Remove</Text>
      </Pressable>
    </Animated.View>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function MyPlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showVybePopup } = useVybePopup();

  const playlist = useUserPlaylistStore(s => s.playlists.find(p => p.id === id));
  const deletePlaylist = useUserPlaylistStore(s => s.deletePlaylist);
  const removeTrackFromPlaylist = useUserPlaylistStore(s => s.removeTrackFromPlaylist);
  const playTrack = usePlaybackController(s => s.playTrack);

  // Hero palette comes from the playlist artwork — must be called before
  // any early return to respect the rules of hooks.
  const heroColors = usePlaylistHeroColors(playlist?.artwork);

  const playScale = useSharedValue(1);
  const playButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: playScale.value }] }));

  // Recommended songs via iTunes Apple Music — same pattern as the artist detail screen.
  // Uses the top artists in the playlist as seeds, fetches each artist's top tracks,
  // and dedupes by track name so the list reads as "More like this playlist".
  const [recommended, setRecommended] = useState<Array<{ trackName: string; artistName: string; artworkUrl: string }>>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  useEffect(() => {
    if (!playlist || playlist.tracks.length === 0) return;

    // Count artist occurrences and pick the top 3 seed artists
    const artistCounts = new Map<string, number>();
    for (const t of playlist.tracks) {
      const a = (t.artist ?? '').trim();
      if (!a) continue;
      artistCounts.set(a, (artistCounts.get(a) ?? 0) + 1);
    }
    const seedArtists = [...artistCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    if (seedArtists.length === 0) return;

    let cancelled = false;
    setLoadingRecs(true);

    (async () => {
      try {
        const trackNamesInPlaylist = new Set(
          playlist.tracks.map(t => (t.title ?? '').toLowerCase())
        );

        const perArtist = await Promise.all(
          seedArtists.map(async (artistName) => {
            try {
              const searchRes = await fetch(
                `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=1`
              );
              const searchData = await searchRes.json();
              const artistId = searchData.results?.[0]?.artistId;
              if (!artistId) return [];

              const lookupRes = await fetch(
                `https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=8`
              );
              const lookupData = await lookupRes.json();
              const songs = (lookupData.results ?? []).filter(
                (r: any) => r.wrapperType === 'track'
              );
              return songs.map((s: any) => ({
                trackName: (s.trackName as string) ?? '',
                artistName: (s.artistName as string) ?? artistName,
                artworkUrl: ((s.artworkUrl100 as string) ?? '').replace(
                  /\d+x\d+bb\.jpg/,
                  '300x300bb.jpg'
                ),
              }));
            } catch {
              return [];
            }
          })
        );

        if (cancelled) return;

        // Flatten, dedupe by track name, and filter out anything already in the playlist
        const merged: Array<{ trackName: string; artistName: string; artworkUrl: string }> = [];
        const seen = new Set<string>();
        for (const list of perArtist) {
          for (const song of list) {
            const key = song.trackName.toLowerCase();
            if (!key || seen.has(key)) continue;
            if (trackNamesInPlaylist.has(key)) continue;
            seen.add(key);
            merged.push(song);
          }
        }
        setRecommended(merged.slice(0, 15));
      } catch (e) {
        console.warn('[MyPlaylist] recommended fetch failed', e);
      } finally {
        if (!cancelled) setLoadingRecs(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [playlist?.id, playlist?.tracks.length]);

  if (!playlist) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff' }}>Playlist not found</Text>
      </View>
    );
  }

  const totalMinutes = Math.floor(playlist.tracks.reduce((acc, t) => acc + (t.duration ?? 0), 0) / 60);

  const handlePlayAll = () => {
    if (playlist.tracks.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playTrack(playlist.tracks[0], playlist.tracks);
    }
  };

  const handleShuffle = () => {
    if (playlist.tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shuffled = [...playlist.tracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  const handleDelete = () => {
    showVybePopup({
      title: 'Delete Playlist',
      message: `Are you sure you want to delete "${playlist.name}"? This can't be undone.`,
      type: 'confirm',
      actions: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deletePlaylist(id ?? '');
            router.back();
          },
        },
      ],
    });
  };

  const ARTWORK_SIZE = SCREEN_WIDTH - 120;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#0A0A0A' }}
        contentContainerStyle={{ paddingBottom: stackScreenContentContainerPaddingBottom(insets.bottom) }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header gradient — dominant color from the playlist artwork → black. */}
        <LinearGradient
          colors={heroColors.gradient as unknown as readonly [string, string, ...string[]]}
          locations={heroColors.locations as unknown as readonly [number, number, ...number[]]}
          style={{ paddingTop: insets.top }}
        >
          {/* Back button */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: insets.top > 0 ? 0 : 12 }}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={22} color="#fff" />
            </Pressable>
          </View>

          {/* Artwork with halo glow */}
          <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 24, paddingHorizontal: 60 }}>
            <View
              style={{
                shadowColor: heroColors.glow,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.55,
                shadowRadius: 40,
              }}
            >
              <View
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 24 },
                  shadowOpacity: 0.55,
                  shadowRadius: 28,
                }}
              >
                {playlist.artwork ? (
                  <Image
                    source={{ uri: playlist.artwork }}
                    style={{
                      width: ARTWORK_SIZE,
                      height: ARTWORK_SIZE,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)',
                    }}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: ARTWORK_SIZE,
                      height: ARTWORK_SIZE,
                      borderRadius: 10,
                      backgroundColor: '#282828',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <ListMusic size={64} color="rgba(255,255,255,0.3)" />
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Info */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>{playlist.name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginTop: 6 }}>
              {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}{totalMinutes > 0 ? ` · ${totalMinutes} min` : ''}
            </Text>
          </View>
        </LinearGradient>

        {/* Action bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#0A0A0A' }}>
          <View style={{ flex: 1 }} />
          <Pressable onPress={handleShuffle} style={{ padding: 8, marginRight: 8 }}>
            <Shuffle size={26} color="#8B5CF6" />
          </Pressable>
          <AnimatedPressable
            onPress={handlePlayAll}
            onPressIn={() => { playScale.value = withSpring(0.88); }}
            onPressOut={() => { playScale.value = withSpring(1); }}
            style={[playButtonStyle, { width: 56, height: 56, borderRadius: 28, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center' }]}
          >
            <Play size={26} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
          </AnimatedPressable>
        </View>

        {/* Tracks */}
        {playlist.tracks.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <ListMusic size={48} color="rgba(255,255,255,0.15)" />
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, marginTop: 16 }}>No tracks yet</Text>
          </View>
        ) : (
          playlist.tracks.map((track, index) => (
            <ReanimatedSwipeable
              key={track.id}
              friction={2}
              rightThreshold={40}
              renderRightActions={(progress) => (
                <TrackDeleteAction
                  progress={progress}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    removeTrackFromPlaylist(id ?? '', track.id);
                  }}
                />
              )}
            >
              <TrackCard track={track} queue={playlist.tracks} index={index} />
            </ReanimatedSwipeable>
          ))
        )}

        {/* Recommended Songs — iTunes Apple Music, seeded by the playlist's top artists. */}
        {playlist.tracks.length > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
              Recommended Songs
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 14 }}>
              Based on the artists in this playlist
            </Text>
            {loadingRecs ? (
              <ActivityIndicator color="rgba(255,255,255,0.3)" style={{ marginTop: 8 }} />
            ) : recommended.length === 0 ? (
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
                No recommendations right now
              </Text>
            ) : (
              recommended.map((song, i) => (
                <RecommendedRow
                  key={`${song.trackName}-${i}`}
                  index={i}
                  trackName={song.trackName}
                  artistName={song.artistName}
                  artwork={song.artworkUrl || playlist.artwork || ''}
                />
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
