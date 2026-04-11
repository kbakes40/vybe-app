import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Play, Shuffle, Music2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { usePlaybackController } from '@/stores/playbackController';
import { DownloadButton } from '@/components/DownloadButton';
import { LoadingRing } from '@/components/LoadingRing';
import { api } from '@/lib/api/api';
import { Track } from '@/types/music';
import { usePlaylistHeroColors } from '@/lib/usePlaylistHeroColors';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;

// Shared cache so switching in/out of the screen reuses resolved tracks.
const ytmTrackCache = new Map<string, Track>();

interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
}

interface RecommendedItem {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
}

function searchResultToTrack(t: YouTubeSearchResult, albumName: string): Track {
  const track: Track & { youtubeId?: string; youtubeMusicId?: string } = {
    id: `ytm-${t.videoId}`,
    title: t.title,
    artist: t.channelName,
    artistId: '',
    album: albumName,
    albumId: '',
    artwork: t.thumbnailUrl,
    duration: 0,
    isLiked: false,
    source: 'youtube_music',
    audioUrl: '',
    youtubeId: t.videoId,
    youtubeMusicId: t.videoId,
  };
  return track;
}

/**
 * RecommendedRow — renders a recommended track with tap-to-play and a download
 * button. Same pattern as the Vybe Beats / Vybe Mix screens.
 */
function RecommendedRow({ rec, index }: { rec: RecommendedItem; index: number }) {
  const playTrack = usePlaybackController((s) => s.playTrack);
  const cacheKey = `${rec.artist}|||${rec.title}`.toLowerCase();
  const [foundTrack, setFoundTrack] = useState<Track | null>(ytmTrackCache.get(cacheKey) ?? null);
  const [pendingPlay, setPendingPlay] = useState(false);

  useEffect(() => {
    if (foundTrack) return;
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
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cacheKey, rec.artist, rec.title, rec.artwork, foundTrack]);

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
          <DownloadButton track={foundTrack} size={26} />
        ) : (
          <LoadingRing size={26} />
        )}
      </View>
    </Pressable>
  );
}

export default function EraPlaylistScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { name, query, image, color, decade } = useLocalSearchParams<{
    name: string;
    query: string;
    image: string;
    color: string;
    decade: string;
  }>();

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommended, setRecommended] = useState<RecommendedItem[]>([]);

  const playTrack = usePlaybackController((s) => s.playTrack);

  // Load the era tracks from YouTube search
  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<YouTubeSearchResult[]>(
          `/api/youtube/search?q=${encodeURIComponent(query)}&maxResults=20`
        );
        if (cancelled) return;
        const loaded = (res ?? []).map((t) => searchResultToTrack(t, name ?? ''));
        setTracks(loaded);

        // Pre-warm CDN URLs for instant playback
        const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
        loaded.slice(0, 6).forEach((t) => {
          const id = (t as Track & { youtubeMusicId?: string }).youtubeMusicId;
          if (id) fetch(`${backendBase}/api/youtube/warm/${id}`).catch(() => {});
        });
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [query, name]);

  // Recommended songs — seeded from the top 3 artists in the era list via iTunes
  useEffect(() => {
    if (tracks.length === 0) return;
    const seedArtists = [...new Set(tracks.map((t) => t.artist).filter(Boolean))].slice(0, 3);
    if (seedArtists.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          seedArtists.map(async (artist) => {
            const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&limit=8`);
            const j = await r.json();
            return (j.results ?? [])
              .filter((x: any) => x.kind === 'song')
              .map((x: any): RecommendedItem => ({
                trackId: String(x.trackId),
                title: x.trackName,
                artist: x.artistName,
                artwork: (x.artworkUrl100 ?? '').replace('100x100', '300x300'),
              }));
          })
        );
        if (cancelled) return;
        const merged = results.flat();
        const existingTitles = new Set(tracks.map((t) => t.title.toLowerCase()));
        const seen = new Set<string>();
        const unique = merged.filter((r: RecommendedItem) => {
          const key = `${r.artist}|||${r.title}`.toLowerCase();
          if (seen.has(key)) return false;
          if (existingTitles.has(r.title.toLowerCase())) return false;
          seen.add(key);
          return true;
        });
        setRecommended(unique.slice(0, 12));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [tracks]);

  const heroArtwork = image || tracks[0]?.artwork;
  // Derive the accent from the hero artwork so the screen always feels
  // cohesive with whatever the cover is. Falls back to the prop-passed
  // color (era theme) while the artwork palette is still loading.
  const heroColors = usePlaylistHeroColors(heroArtwork);
  const accentColor = heroColors.glow ?? color ?? '#8B5CF6';

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

  const topArtists = useMemo(
    () => [...new Set(tracks.slice(0, 3).map((t) => t.artist).filter(Boolean))].join(', '),
    [tracks]
  );

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      {/* Header with back button */}
      <View
        style={{ paddingTop: insets.top + 8 }}
        className="absolute top-0 left-0 right-0 z-10 px-4 pb-2 flex-row items-center justify-between"
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-black/40 items-center justify-center"
          hitSlop={12}
        >
          <ChevronLeft size={22} color="#fff" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: '#0A0A0A' }}
      >
        {/* Hero */}
        <View style={{ height: 320 }}>
          {heroArtwork ? (
            <Image
              source={{ uri: heroArtwork }}
              style={{ width: '100%', height: '100%', position: 'absolute' }}
              contentFit="cover"
              blurRadius={30}
            />
          ) : null}
          {/* Dominant-color → black gradient over the blurred artwork for
              a smooth blend into the track list below. */}
          <LinearGradient
            colors={heroColors.gradient as unknown as readonly [string, string, ...string[]]}
            locations={heroColors.locations as unknown as readonly [number, number, ...number[]]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.85 }}
          />
          <View className="flex-1 justify-end px-5 pb-5">
            <View className="flex-row items-end">
              <View
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: 12,
                  overflow: 'hidden',
                  shadowColor: '#000',
                  shadowOpacity: 0.5,
                  shadowOffset: { width: 0, height: 12 },
                  shadowRadius: 18,
                }}
              >
                {heroArtwork ? (
                  <Image source={{ uri: heroArtwork }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <LinearGradient
                    colors={[accentColor, '#0F0428']}
                    style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 42, fontWeight: '900' }}>{decade}</Text>
                  </LinearGradient>
                )}
              </View>
              <View className="flex-1 ml-4 mb-1">
                <View
                  style={{
                    backgroundColor: accentColor,
                    borderRadius: 10,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    alignSelf: 'flex-start',
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }}>
                    TIME TRAVELER
                  </Text>
                </View>
                <Text className="text-white text-3xl font-bold" numberOfLines={2}>
                  {name}
                </Text>
                <Text className="text-white/50 text-xs mt-1" numberOfLines={1}>
                  {tracks.length} songs{topArtists ? ` · ${topArtists}` : ''}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Action row */}
        <View className="flex-row items-center px-5 mb-6">
          <Pressable
            onPress={handlePlayAll}
            disabled={loading || tracks.length === 0}
            style={{
              backgroundColor: loading || tracks.length === 0 ? 'rgba(139,92,246,0.4)' : accentColor,
            }}
            className="flex-row items-center rounded-full px-6 py-3 mr-3"
          >
            <Play size={18} color="#fff" fill="#fff" />
            <Text className="text-white font-bold ml-2">Play</Text>
          </Pressable>
          <Pressable
            onPress={handleShuffle}
            disabled={loading || tracks.length === 0}
            className="flex-row items-center bg-white/10 rounded-full px-6 py-3"
          >
            <Shuffle size={18} color="#fff" />
            <Text className="text-white font-bold ml-2">Shuffle</Text>
          </Pressable>
        </View>

        {/* Tracks */}
        {loading ? (
          <View className="mx-5 py-12 items-center">
            <LoadingRing size={32} color={accentColor} />
            <Text className="text-white/40 text-sm mt-3">Loading the era…</Text>
          </View>
        ) : tracks.length === 0 ? (
          <View className="mx-5 py-12 items-center">
            <Music2 size={32} color="rgba(255,255,255,0.2)" />
            <Text className="text-white/40 text-sm mt-3">No songs found</Text>
          </View>
        ) : (
          tracks.map((track, index) => (
            <Pressable
              key={track.id}
              onPress={() => handlePlayTrack(index)}
              className="flex-row items-center px-5 py-2"
            >
              <Text className="text-white/30 text-sm w-6 text-center mr-3">{index + 1}</Text>
              <Image source={{ uri: track.artwork }} style={{ width: 48, height: 48, borderRadius: 6 }} contentFit="cover" />
              <View className="flex-1 ml-3">
                <Text className="text-white text-sm font-semibold" numberOfLines={1}>{track.title}</Text>
                <Text className="text-white/50 text-xs mt-0.5" numberOfLines={1}>{track.artist}</Text>
              </View>
              <View onStartShouldSetResponder={() => true}>
                <DownloadButton track={track} size={26} />
              </View>
            </Pressable>
          ))
        )}

        {/* Recommended Songs */}
        {recommended.length > 0 ? (
          <View className="mt-8">
            <View className="px-5 mb-3">
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 }}>
                Recommended Songs
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                Based on the artists in this playlist
              </Text>
            </View>
            {recommended.map((rec, i) => (
              <RecommendedRow key={rec.trackId} rec={rec} index={i} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
