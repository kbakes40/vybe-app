import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Play, Shuffle, Sparkles, Music2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { usePlaybackController } from '@/stores/playbackController';
import { TrackCard } from '@/components/TrackCard';
import { DownloadButton } from '@/components/DownloadButton';
import { Track } from '@/types/music';
import { usePlaylistHeroColors } from '@/lib/usePlaylistHeroColors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

type RecommendedSource = 'soundcloud' | 'youtube_music' | 'youtube';

interface RecommendedSection {
  source: RecommendedSource;
  label: string;
  color: string;
  tracks: Track[];
}

/**
 * RecommendedTrackRow — simple tap-to-play row for a recommended track.
 * Plays as a single-song queue so tapping doesn't blow the user's current
 * queue away with 4+ related tracks. The user stays on Vybe Mix and the
 * recommended section is still fully browsable.
 */
function RecommendedTrackRow({ track, index, onAdded }: { track: Track; index: number; onAdded?: (track: Track) => void }) {
  const playTrack = usePlaybackController((s) => s.playTrack);
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        playTrack(track, [track]);
      }}
      className="flex-row items-center px-5 py-2"
    >
      <Text className="text-white/30 text-sm w-6 text-center mr-3">{index + 1}</Text>
      <Image source={{ uri: track.artwork }} style={{ width: 44, height: 44, borderRadius: 6 }} contentFit="cover" />
      <View className="flex-1 ml-3">
        <Text className="text-white text-sm font-semibold" numberOfLines={1}>{track.title}</Text>
        <Text className="text-white/50 text-xs mt-0.5" numberOfLines={1}>{track.artist}</Text>
      </View>
      <View onStartShouldSetResponder={() => true}>
        <DownloadButton track={track} size={26} onDownloadComplete={() => onAdded?.(track)} />
      </View>
    </Pressable>
  );
}

export default function VybeMixScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const allDownloads = useDownloadsStore((s) => s.downloads);
  const playTrack = usePlaybackController((s) => s.playTrack);
  const playScale = useSharedValue(1);
  const playButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: playScale.value }] }));

  // Same definition as the home screen's Vybe Mix card: up to 20 most
  // recently downloaded tracks from any source.
  const tracks = useMemo(
    () => [...allDownloads]
      .reverse()
      .slice(0, 20) as Track[],
    [allDownloads]
  );

  const heroArtwork = tracks[0]?.artwork;

  // Recommended songs — fetch directly from SoundCloud, YouTube Music, and
  // YouTube for the playlist's top artists. Results are already playable
  // tracks (no resolve step needed), grouped by source.
  const [recSections, setRecSections] = useState<RecommendedSection[]>([]);

  useEffect(() => {
    if (tracks.length === 0) return;
    const seedArtists = [...new Set(tracks.map(t => t.artist).filter(Boolean))].slice(0, 3);
    if (seedArtists.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const existingTitles = new Set(tracks.map(t => t.title.toLowerCase()));
        const dedupeAcrossSources = new Set<string>();

        const query = seedArtists.join(' ');

        // Fire all three searches in parallel.
        const [scJson, ytmJson, ytJson] = await Promise.all([
          fetch(`${BACKEND_URL}/api/soundcloud/search?q=${encodeURIComponent(query)}&maxResults=8`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
          fetch(`${BACKEND_URL}/api/youtube/search?q=${encodeURIComponent(query + ' music')}&maxResults=8`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
          fetch(`${BACKEND_URL}/api/youtube/search?q=${encodeURIComponent(query)}&maxResults=8`)
            .then(r => r.ok ? r.json() : null)
            .catch(() => null),
        ]);

        if (cancelled) return;

        const mapAndFilter = (
          rawItems: any[],
          toTrack: (item: any) => Track,
        ): Track[] => {
          const out: Track[] = [];
          for (const item of rawItems) {
            const track = toTrack(item);
            const key = `${track.artist}|||${track.title}`.toLowerCase();
            if (existingTitles.has(track.title.toLowerCase())) continue;
            if (dedupeAcrossSources.has(key)) continue;
            dedupeAcrossSources.add(key);
            out.push(track);
            if (out.length >= 4) break;
          }
          return out;
        };

        const scTracks = mapAndFilter((scJson?.data ?? []) as any[], (item: any): Track => ({
          id: `sc-${item.trackId ?? item.soundcloudUrl}`,
          title: item.title,
          artist: item.artist,
          artistId: '', album: '', albumId: '', isLiked: false,
          artwork: item.artwork,
          duration: item.duration ?? 0,
          source: 'soundcloud',
          audioUrl: item.soundcloudUrl,
          soundcloudUrl: item.soundcloudUrl,
        } as Track));

        const ytmTracks = mapAndFilter((ytmJson?.data ?? []) as any[], (item: any): Track => ({
          id: `ytm-${item.videoId}`,
          title: item.title,
          artist: item.channelName,
          artistId: '', album: '', albumId: '', isLiked: false,
          artwork: item.thumbnailUrl,
          duration: 0,
          source: 'youtube_music',
          audioUrl: '',
          youtubeId: item.videoId,
          youtubeMusicId: item.videoId,
        } as Track));

        const ytTracks = mapAndFilter((ytJson?.data ?? []) as any[], (item: any): Track => ({
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

        const sections: RecommendedSection[] = [];
        if (scTracks.length > 0) sections.push({ source: 'soundcloud', label: 'SoundCloud', color: '#FF7700', tracks: scTracks });
        if (ytmTracks.length > 0) sections.push({ source: 'youtube_music', label: 'YouTube Music', color: '#FF0000', tracks: ytmTracks });
        if (ytTracks.length > 0) sections.push({ source: 'youtube', label: 'YouTube', color: '#FF0000', tracks: ytTracks });

        setRecSections(sections);
      } catch (e) {
        console.warn('[VybeMix] recommended fetch failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [tracks]);

  const handlePlayAll = useCallback(() => {
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(tracks[0], tracks);
  }, [tracks, playTrack]);

  const handleShuffle = useCallback(() => {
    if (tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  }, [tracks, playTrack]);

  const handlePlayTrack = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playTrack(tracks[index], tracks);
  };

  const heroArtists = useMemo(
    () => [...new Set(tracks.slice(0, 3).map(t => t.artist).filter(Boolean))].join(', '),
    [tracks]
  );

  const ARTWORK_SIZE = SCREEN_WIDTH - 120;
  const heroColors = usePlaylistHeroColors(heroArtwork);

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#0A0A0A' }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Colored backdrop — only visible on top overscroll pull-down */}
        <View style={{ position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: heroColors.gradient[0] as string }} />

        {/* Header gradient — dominant color from the hero artwork → black,
            so the background always complements whatever the artwork is. */}
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

          {/* Artwork with purple halo glow */}
          <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 24, paddingHorizontal: 60 }}>
            <View
              style={{
                // iOS-only shadow: soft halo in the artwork's dominant
                // color, blending into the surrounding gradient for a
                // luminous feel.
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
                {heroArtwork ? (
                  <Image
                    source={{ uri: heroArtwork }}
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
              MADE FOR YOU
            </Text>
            <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>Vybe Mix</Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginTop: 6 }}>
              {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}{heroArtists ? ` · ${heroArtists}` : ''}
            </Text>
          </View>
        </LinearGradient>

        {/* Everything below the gradient sits on a dark background so
            the ScrollView's gradient-colored bg only shows on overscroll. */}
        <View style={{ backgroundColor: '#0A0A0A', flex: 1, paddingBottom: insets.bottom + 120 }}>

        {/* Action bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}>
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
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, marginTop: 16 }}>Save songs to build your mix</Text>
          </View>
        ) : (
          tracks.map((track, index) => (
            <TrackCard key={track.id} track={track} queue={tracks} index={index} />
          ))
        )}

        {/* Recommended Songs — grouped by provider */}
        {recSections.length > 0 ? (
          <View style={{ marginTop: 32 }}>
            <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
                Recommended Songs
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                Based on the artists in this playlist
              </Text>
            </View>
            {recSections.map((section) => (
              <View key={section.source} style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: section.color, marginRight: 8 }} />
                  <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    {section.label}
                  </Text>
                </View>
                {section.tracks.map((track, i) => (
                  <RecommendedTrackRow key={track.id} track={track} index={i} onAdded={() => {}} />
                ))}
              </View>
            ))}
          </View>
        ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
