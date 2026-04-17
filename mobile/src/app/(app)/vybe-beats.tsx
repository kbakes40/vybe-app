import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions, Share, Modal } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Play, Shuffle, Sparkles, Music2, Download, Share2, MoreVertical, ListPlus, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useDiscoverFeedStore, DiscoverItem } from '@/stores/discoverFeedStore';
import { usePlaybackController } from '@/stores/playbackController';
import { DownloadButton } from '@/components/DownloadButton';
import { LoadingRing } from '@/components/LoadingRing';
import { TrackCard } from '@/components/TrackCard';
import { Track } from '@/types/music';
import { usePlaylistHeroColors } from '@/lib/usePlaylistHeroColors';

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

  const addToQueue = usePlaybackController((s) => s.addToQueue);
  const [moreOpen, setMoreOpen] = useState(false);

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(tracks[0], tracks);
  };

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMoreOpen(false);
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const lines = tracks.slice(0, 10).map(t => `• ${t.title} — ${t.artist}`).join('\n');
      const more = tracks.length > 10 ? `\n…and ${tracks.length - 10} more` : '';
      await Share.share({ message: `Vybe Beats — hand-picked SoundCloud finds:\n${lines}${more}` });
    } catch {}
  };

  const handleAddAllToQueue = () => {
    if (tracks.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMoreOpen(false);
    tracks.forEach(t => addToQueue(t));
  };

  const handlePlayTrack = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playTrack(tracks[index], tracks);
  };

  const ARTWORK_SIZE = SCREEN_WIDTH - 120;
  const heroColors = usePlaylistHeroColors(heroSlots[0] ?? null);

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#0A0A0A' }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header gradient — dominant color from the hero artwork → black,
            so the background always complements whatever the collage is. */}
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

          {/* Artwork — 2x2 collage with purple halo glow */}
          <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 24, paddingHorizontal: 60 }}>
            <View
              style={{
                // Soft halo in the artwork's dominant color, blending
                // into the surrounding gradient.
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
                {heroSlots.length === 4 ? (
                  <View
                    style={{
                      width: ARTWORK_SIZE,
                      height: ARTWORK_SIZE,
                      borderRadius: 10,
                      overflow: 'hidden',
                      backgroundColor: '#0D0722',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)',
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
                    style={{
                      width: ARTWORK_SIZE,
                      height: ARTWORK_SIZE,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    <Sparkles size={64} color="#8B5CF6" />
                  </LinearGradient>
                )}
              </View>
            </View>
          </View>

          {/* Info */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
            <Text
              style={{
                color: 'rgba(196,181,253,0.9)',
                fontSize: 10,
                fontWeight: '700',
                letterSpacing: 2,
                marginBottom: 10,
              }}
            >
              CURATED
            </Text>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>Vybe Beats</Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginTop: 6 }}>
              {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} · YouTube · SoundCloud
            </Text>
          </View>
        </LinearGradient>

        {/* Action bar — matches the YT Music playlist layout */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, gap: 12, backgroundColor: '#0A0A0A' }}>
          <View
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(139,92,246,0.15)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Download size={20} color="#8B5CF6" />
          </View>
          <AnimatedPressable
            onPress={handlePlayAll}
            onPressIn={() => { playScale.value = withSpring(0.96); }}
            onPressOut={() => { playScale.value = withSpring(1); }}
            disabled={tracks.length === 0}
            style={[playButtonStyle, { flex: 1, height: 50, borderRadius: 25, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', opacity: tracks.length === 0 ? 0.4 : 1 }]}
          >
            <Play size={20} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 3 }} />
            <Text style={{ color: '#0A0A0A', fontWeight: '700', fontSize: 15, marginLeft: 6 }}>Play All</Text>
          </AnimatedPressable>
          <Pressable
            onPress={handleShare}
            disabled={tracks.length === 0}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', opacity: tracks.length === 0 ? 0.4 : 1 }}
          >
            <Share2 size={20} color="#fff" />
          </Pressable>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMoreOpen(true); }}
            disabled={tracks.length === 0}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', opacity: tracks.length === 0 ? 0.4 : 1 }}
          >
            <MoreVertical size={20} color="#fff" />
          </Pressable>
        </View>

        {/* More-actions bottom sheet */}
        <Modal visible={moreOpen} transparent animationType="slide" onRequestClose={() => setMoreOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'transparent' }} onPress={() => setMoreOpen(false)}>
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => {}} style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: insets.bottom + 16 }}>
              <View style={{ width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 8 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Vybe Beats</Text>
                <Pressable onPress={() => setMoreOpen(false)} hitSlop={10}><X size={22} color="rgba(255,255,255,0.6)" /></Pressable>
              </View>
              <Pressable onPress={handleShuffle} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18 }}>
                <Shuffle size={22} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500', marginLeft: 16 }}>Shuffle play</Text>
              </Pressable>
              <Pressable onPress={handleAddAllToQueue} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18 }}>
                <ListPlus size={22} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500', marginLeft: 16 }}>Add all to queue</Text>
              </Pressable>
              <Pressable onPress={() => { setMoreOpen(false); handleShare(); }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18 }}>
                <Share2 size={22} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500', marginLeft: 16 }}>Share</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

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
