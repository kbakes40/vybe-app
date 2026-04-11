import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Play, Shuffle, Sparkles, Music2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useDiscoverFeedStore, DiscoverItem } from '@/stores/discoverFeedStore';
import { usePlaybackController } from '@/stores/playbackController';
import { DownloadButton } from '@/components/DownloadButton';
import { LoadingRing } from '@/components/LoadingRing';
import { TrackCard } from '@/components/TrackCard';
import { Track } from '@/types/music';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

// Shared cache so switching in/out of the screen reuses resolved tracks.
const ytmTrackCache = new Map<string, Track>();

function discoverItemToTrack(item: DiscoverItem): Track & { youtubeId?: string; soundcloudUrl?: string } {
  const isYt = item.sourcePlatform === 'YOUTUBE';
  const bareId = item.id.replace(/^yt-|^sc-/, '');
  return {
    id: item.id,
    title: item.title,
    artist: item.creatorName,
    artistId: '',
    album: '',
    albumId: '',
    isLiked: false,
    artwork: item.thumbnailUrl,
    duration: 0,
    source: isYt ? 'youtube' : 'soundcloud',
    audioUrl: isYt ? '' : item.externalUrl,
    youtubeId: isYt ? bareId : undefined,
    soundcloudUrl: isYt ? undefined : item.externalUrl,
  };
}

interface RecommendedItem {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
}

/**
 * RecommendedRow — renders a recommended track with tap-to-play and a download
 * button. Both actions share a single YT Music resolution so the first tap or
 * mount kicks off the search, and subsequent interactions use the cached track.
 *
 * onAdded fires after a successful download so the parent can splice the track
 * into the Vybe Beats playlist mix.
 */
function RecommendedRow({
  rec,
  index,
  onResolved,
  onAdded,
}: {
  rec: RecommendedItem;
  index: number;
  onResolved: (track: Track) => void;
  onAdded?: (track: Track & { youtubeId?: string; youtubeMusicId?: string }) => void;
}) {
  const playTrack = usePlaybackController((s) => s.playTrack);
  const cacheKey = `${rec.artist}|||${rec.title}`.toLowerCase();
  const [foundTrack, setFoundTrack] = useState<Track | null>(ytmTrackCache.get(cacheKey) ?? null);
  const [pendingPlay, setPendingPlay] = useState(false);

  useEffect(() => {
    if (foundTrack) {
      onResolved(foundTrack);
      return;
    }
    let cancelled = false;
    fetch(`${BACKEND_URL}/api/youtube/search?q=${encodeURIComponent(`${rec.artist} ${rec.title}`)}&maxResults=1`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const first = (json.data ?? [])[0];
        if (first?.videoId) {
          const t: Track & { youtubeId?: string; youtubeMusicId?: string } = {
            id: `ytm-${first.videoId}`,
            title: rec.title,
            artist: rec.artist,
            artistId: '', album: '', albumId: '', isLiked: false,
            artwork: rec.artwork || (first.thumbnailUrl ?? ''),
            duration: 0,
            source: 'youtube_music',
            audioUrl: '',
            youtubeId: first.videoId,
            youtubeMusicId: first.videoId,
          };
          ytmTrackCache.set(cacheKey, t);
          setFoundTrack(t);
          onResolved(t);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cacheKey, rec.artist, rec.title, rec.artwork, foundTrack, onResolved]);

  // If the user tapped before the resolver finished, fire the play as soon
  // as the track arrives.
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
    <Pressable onPress={handlePress} className="flex-row items-center px-5 py-2">
      <Text className="text-white/30 text-sm w-6 text-center mr-3">{index + 1}</Text>
      <Image source={{ uri: rec.artwork }} style={{ width: 44, height: 44, borderRadius: 6 }} contentFit="cover" />
      <View className="flex-1 ml-3">
        <Text className="text-white text-sm font-semibold" numberOfLines={1}>{rec.title}</Text>
        <Text className="text-white/50 text-xs mt-0.5" numberOfLines={1}>{rec.artist}</Text>
      </View>
      <View onStartShouldSetResponder={() => true}>
        {foundTrack ? (
          <DownloadButton
            track={foundTrack}
            size={26}
            onDownloadComplete={() => onAdded?.(foundTrack as Track & { youtubeId?: string; youtubeMusicId?: string })}
          />
        ) : (
          <LoadingRing size={26} />
        )}
      </View>
    </Pressable>
  );
}

export default function VybeBeatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const vybeBeats = useDiscoverFeedStore((s) => s.vybeBeats);
  const setVybeBeats = useDiscoverFeedStore((s) => s.setVybeBeats);
  const preferences = useDiscoverFeedStore((s) => s.preferences);
  const playTrack = usePlaybackController(s => s.playTrack);
  const playScale = useSharedValue(1);
  const playButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: playScale.value }] }));

  const tracks = useMemo(() => vybeBeats.map(discoverItemToTrack), [vybeBeats]);

  // Build a 2x2 collage of artworks from the playlist for the hero. Falling
  // back to the first artwork repeated keeps the layout filled when the
  // playlist has fewer than four tracks. SoundCloud generic placeholders
  // still look better in a grid than as a single oversized hero.
  const heroSlots = useMemo(() => {
    const arts = vybeBeats
      .map((i) => i.thumbnailUrl)
      .filter((u): u is string => !!u && u.length > 0);
    if (arts.length === 0) return [] as string[];
    const slots = arts.slice(0, 4);
    while (slots.length < 4) slots.push(slots[slots.length - 1]);
    return slots;
  }, [vybeBeats]);

  // Add a recommended track to the Vybe Beats mix. Called when the user
  // downloads a recommended song so the playlist actually grows. Skipped if
  // we already have it (matched on title+artist, case-insensitive).
  const handleRecommendedAdded = useCallback(
    (track: Track & { youtubeId?: string }) => {
      const key = `${track.title}|||${track.artist}`.toLowerCase();
      const existing = useDiscoverFeedStore.getState().vybeBeats;
      const dupe = existing.some(
        (i) => `${i.title}|||${i.creatorName}`.toLowerCase() === key,
      );
      if (dupe) return;
      const videoId = track.youtubeId ?? track.id.replace(/^ytm-|^yt-/, '');
      const newItem: DiscoverItem = {
        id: `yt-${videoId}`,
        sourcePlatform: 'YOUTUBE',
        title: track.title,
        creatorName: track.artist,
        thumbnailUrl: track.artwork ?? '',
        externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
        deepLinkUrl: `youtube://watch?v=${videoId}`,
        searchQuery: `${track.artist} ${track.title}`,
        publishedAt: null,
        createdAt: new Date().toISOString(),
      };
      setVybeBeats([...existing, newItem]);
    },
    [setVybeBeats],
  );

  // Recommended tracks — pull additional results from iTunes based on the
  // user's genres + favorite artists so the playlist has a "more like this"
  // section just like the my-playlist detail screen.
  const [recommended, setRecommended] = useState<RecommendedItem[]>([]);

  useEffect(() => {
    const seedArtist = preferences?.favoriteArtists?.[0] ?? tracks[0]?.artist;
    if (!seedArtist) return;
    let cancelled = false;
    fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(seedArtist)}&entity=song&limit=12`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const items = (json.results ?? [])
          .filter((r: any) => r.kind === 'song')
          .map((r: any): RecommendedItem => ({
            trackId: String(r.trackId),
            title: r.trackName,
            artist: r.artistName,
            artwork: (r.artworkUrl100 ?? '').replace('100x100', '300x300'),
          }));
        // De-duplicate against the tracks already in the playlist
        const existingTitles = new Set(tracks.map(t => t.title.toLowerCase()));
        setRecommended(items.filter((i: RecommendedItem) => !existingTitles.has(i.title.toLowerCase())).slice(0, 8));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [preferences?.favoriteArtists, tracks]);

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(tracks[0], tracks);
  };

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  const handlePlayTrack = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playTrack(tracks[index], tracks);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#3B1F6E' }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header gradient */}
        <LinearGradient
          colors={['#3B1F6E', '#1A0D38', '#0A0A0A']}
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

          {/* Artwork — 2x2 collage of playlist art */}
          <View style={{ alignItems: 'center', paddingTop: 24, paddingBottom: 20, paddingHorizontal: 60 }}>
            <View style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.6, shadowRadius: 30 }}>
              {heroSlots.length === 4 ? (
                <View
                  style={{
                    width: SCREEN_WIDTH - 120,
                    height: SCREEN_WIDTH - 120,
                    borderRadius: 8,
                    overflow: 'hidden',
                    backgroundColor: '#0D0722',
                  }}
                >
                  <View style={{ flex: 1, flexDirection: 'row' }}>
                    <Image source={{ uri: heroSlots[0] }} style={{ flex: 1, height: '100%' }} contentFit="cover" />
                    <View style={{ width: 2, backgroundColor: '#0D0722' }} />
                    <Image source={{ uri: heroSlots[1] }} style={{ flex: 1, height: '100%' }} contentFit="cover" />
                  </View>
                  <View style={{ height: 2, backgroundColor: '#0D0722' }} />
                  <View style={{ flex: 1, flexDirection: 'row' }}>
                    <Image source={{ uri: heroSlots[2] }} style={{ flex: 1, height: '100%' }} contentFit="cover" />
                    <View style={{ width: 2, backgroundColor: '#0D0722' }} />
                    <Image source={{ uri: heroSlots[3] }} style={{ flex: 1, height: '100%' }} contentFit="cover" />
                  </View>
                </View>
              ) : (
                <LinearGradient
                  colors={['#1A0836', '#0F0428']}
                  style={{ width: SCREEN_WIDTH - 120, height: SCREEN_WIDTH - 120, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Sparkles size={64} color="#8B5CF6" />
                </LinearGradient>
              )}
            </View>
          </View>

          {/* Info */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
            <View style={{ backgroundColor: '#7C3AED', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 8 }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }}>CURATED</Text>
            </View>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>Vybe Beats</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 }}>
              {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} · YouTube · SoundCloud
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
        {tracks.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Music2 size={48} color="rgba(255,255,255,0.15)" />
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, marginTop: 16 }}>Building your beats…</Text>
          </View>
        ) : (
          tracks.map((track, index) => (
            <TrackCard key={track.id} track={track} queue={tracks} index={index} />
          ))
        )}

        {/* Recommended Songs */}
        {recommended.length > 0 ? (
          <View style={{ paddingHorizontal: 20, marginTop: 32 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
              Recommended Songs
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 14 }}>
              Based on the artists in this playlist
            </Text>
            {recommended.map((rec, i) => (
              <RecommendedRow
                key={rec.trackId}
                rec={rec}
                index={i}
                onResolved={() => {}}
                onAdded={handleRecommendedAdded}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
