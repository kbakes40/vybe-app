import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, Pressable, Animated,
  ActivityIndicator, Dimensions, StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Music2, Trash2, Sparkles } from 'lucide-react-native';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { DownloadButton } from '@/components/DownloadButton';
import { LoadingRing } from '@/components/LoadingRing';
import { Track } from '@/types/music';
import { usePlaylistHeroColors } from '@/lib/usePlaylistHeroColors';
import { HouseAdCard, HOUSE_ADS } from '@/components/HouseAdCard';
import { createMMKVCache } from '@/lib/mmkv-cache';

// MMKV-backed cache for resolved artist data (bio + photo + tracks).
// Lets the hero photo paint instantly on re-open instead of flickering
// from the param artwork → Wikipedia photo on every visit.
const artistMMKV = createMMKVCache('vybe-artist-profile');
const ARTIST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Only trust a stored photo if it's actually from Wikipedia or iTunes —
// an earlier version of this cache got poisoned with track artwork URLs,
// so anything outside the allow-list should trigger a re-fetch.
function isRealArtistPhoto(url: string | undefined): boolean {
  if (!url) return false;
  return /upload\.wikimedia\.org/.test(url) || /mzstatic\.com/.test(url);
}

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HEADER_HEIGHT = 300;

// ── Module-level caches ───────────────────────────────────────────────────────
interface ArtistData {
  bio: string;
  photo: string;
  genres: string[];
  topTracks: { trackName: string; artworkUrl: string }[];
}
const artistCache = new Map<string, ArtistData>();
const ytmTrackCache = new Map<string, Track>();

// ── Equalizer animation ───────────────────────────────────────────────────────
function EqualizerBars() {
  const bar0 = useRef(new Animated.Value(4)).current;
  const bar1 = useRef(new Animated.Value(9)).current;
  const bar2 = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    const animateBar = (bar: Animated.Value, delay: number) => {
      const loop = () => {
        Animated.sequence([
          Animated.timing(bar, { toValue: 4 + Math.random() * 10, duration: 200 + delay, useNativeDriver: false }),
          Animated.timing(bar, { toValue: 2 + Math.random() * 6, duration: 200 + delay, useNativeDriver: false }),
        ]).start(loop);
      };
      loop();
    };
    animateBar(bar0, 0);
    animateBar(bar1, 80);
    animateBar(bar2, 40);
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 14, gap: 2 }}>
      {[bar0, bar1, bar2].map((bar, i) => (
        <Animated.View key={i} style={{ width: 3, height: bar, backgroundColor: '#1DB954', borderRadius: 2 }} />
      ))}
    </View>
  );
}

// ── TopTrackDownload: pre-fetch on mount for one-tap download ─────────────────
function TopTrackDownload({ trackName, artistName, artwork }: { trackName: string; artistName: string; artwork: string }) {
  const cacheKey = `${artistName}|||${trackName}`.toLowerCase();
  const [foundTrack, setFoundTrack] = useState<Track | null>(ytmTrackCache.get(cacheKey) ?? null);
  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);

  useEffect(() => {
    if (ytmTrackCache.has(cacheKey) || foundTrack) return;
    fetch(`${BACKEND_URL}/api/youtube/search?q=${encodeURIComponent(`${artistName} ${trackName}`)}&maxResults=1`)
      .then(r => r.json())
      .then(json => {
        const first = (json.data ?? json ?? [])[0];
        if (first?.videoId) {
          const t: Track = {
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
            youtubeId: first.videoId,
            youtubeMusicId: first.videoId,
          };
          ytmTrackCache.set(cacheKey, t);
          setFoundTrack(t);
        }
      }).catch(() => {});
  }, [cacheKey]);

  if (!foundTrack) {
    return <LoadingRing size={26} />;
  }
  return <DownloadButton track={foundTrack} size={26} />;
}

// ── Library track row ─────────────────────────────────────────────────────────
function LibraryTrackRow({ track, isPlaying, onPress }: { track: Track; isPlaying: boolean; onPress: () => void }) {
  const removeDownload = useDownloadsStore(s => s.removeDownload);

  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
      {track.artwork ? (
        <Image source={{ uri: track.artwork }} style={{ width: 48, height: 48, borderRadius: 6 }} contentFit="cover" />
      ) : (
        <View style={{ width: 48, height: 48, borderRadius: 6, backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
          <Music2 size={20} color="#8B5CF6" />
        </View>
      )}
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: isPlaying ? '#1DB954' : '#fff', fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{track.title}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 }} numberOfLines={1}>{track.artist}</Text>
      </View>
      {isPlaying ? <EqualizerBars /> : (
        <Pressable onPress={() => removeDownload(track.id)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Trash2 size={18} color="rgba(255,255,255,0.3)" />
        </Pressable>
      )}
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ArtistProfileScreen() {
  const { name, artworks } = useLocalSearchParams<{ name: string; artworks: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const artistName = name ?? '';
  const artworkList = (artworks ?? '').split('|||').filter(Boolean);
  const primaryArtwork = artworkList[0] ?? '';

  // Lazy-init from MMKV so the hero photo + bio paint on first render with
  // the cached values from the previous session — but only trust entries
  // whose photo is from Wikipedia/iTunes. Anything else (including old
  // poisoned entries holding track artwork) falls through to a re-fetch.
  const [data, setData] = useState<ArtistData | null>(() => {
    const key = artistName.toLowerCase();
    const memHit = artistCache.get(key);
    if (memHit && isRealArtistPhoto(memHit.photo)) return memHit;
    const diskHit = artistMMKV.get<ArtistData>(key, ARTIST_TTL_MS)?.value;
    if (diskHit && isRealArtistPhoto(diskHit.photo)) {
      artistCache.set(key, diskHit);
      return diskHit;
    }
    return null;
  });
  const [loading, setLoading] = useState(!data);

  const downloads = useDownloadsStore(s => s.downloads);
  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);

  // Tracks in library that belong to this artist
  const libraryTracks = downloads.filter(t => {
    const da = (t.artist ?? '').toLowerCase();
    const an = artistName.toLowerCase();
    return da === an || da.includes(an) || an.includes(da);
  });

  useEffect(() => {
    const key = artistName.toLowerCase();
    // Skip the refetch only if we already have a VALID cached entry. A
    // cached entry holding a non-real photo (from the old buggy cache)
    // needs to fall through to the Wikipedia/iTunes path below.
    const cached = artistCache.get(key);
    if (cached && isRealArtistPhoto(cached.photo)) {
      setData(cached); setLoading(false); return;
    }
    (async () => {
      try {
        // Wikipedia bio + photo
        const wikiRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artistName)}`);
        const wikiData = await wikiRes.json();
        const bio: string = wikiData.extract ?? '';
        const photo: string = wikiData.originalimage?.source ?? wikiData.thumbnail?.source ?? primaryArtwork;

        // iTunes top tracks
        const searchRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=1`);
        const searchData = await searchRes.json();
        const artistId = searchData.results?.[0]?.artistId;
        let topTracks: { trackName: string; artworkUrl: string }[] = [];
        let genres: string[] = [];
        if (artistId) {
          const lookupRes = await fetch(`https://itunes.apple.com/lookup?id=${artistId}&entity=song&limit=10`);
          const lookupData = await lookupRes.json();
          const songs = (lookupData.results ?? []).filter((r: any) => r.wrapperType === 'track');
          topTracks = songs.map((s: any) => ({
            trackName: s.trackName ?? '',
            artworkUrl: (s.artworkUrl100 ?? '').replace(/\d+x\d+bb\.jpg/, '300x300bb.jpg'),
          }));
          const genre = songs[0]?.primaryGenreName;
          if (genre) genres = [genre];
        }

        const result: ArtistData = { bio, photo, genres, topTracks };
        artistCache.set(key, result);
        artistMMKV.set(key, result);
        setData(result);
      } catch (e) {
        console.warn('[ArtistProfile] fetch failed', e);
        setData({ bio: '', photo: primaryArtwork, genres: [], topTracks: [] });
      } finally {
        setLoading(false);
      }
    })();
  }, [artistName]);

  // Hero photo — prefer the cached high-quality artist portrait so it doesn't
  // jump from param artwork → Wikipedia photo on every visit. Falls back to
  // the first param artwork only on a true cold miss.
  const heroPhoto = data?.photo || primaryArtwork;
  const heroColors = usePlaylistHeroColors(heroPhoto);

  const nameOpacity = scrollY.interpolate({ inputRange: [HEADER_HEIGHT * 0.5, HEADER_HEIGHT * 0.8], outputRange: [0, 1], extrapolate: 'clamp' });

  // Parallax stretch — image scales up and stays pinned when pulling down
  const heroScale = scrollY.interpolate({ inputRange: [-200, 0], outputRange: [1.5, 1], extrapolate: 'clamp' });
  const heroTranslateY = scrollY.interpolate({ inputRange: [-200, 0], outputRange: [-100, 0], extrapolate: 'clamp' });

  const ARTWORK_SIZE = SCREEN_WIDTH - 120;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      {/* Sticky nav bar */}
      <View style={[styles.navBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#fff" />
        </Pressable>
        <Animated.Text style={[styles.navTitle, { opacity: nameOpacity }]} numberOfLines={1}>{artistName}</Animated.Text>
        <View style={{ width: 40 }} />
      </View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1, backgroundColor: '#0A0A0A' }}
      >
        {/* Colored backdrop — only visible on top overscroll pull-down */}
        <View style={{ position: 'absolute', top: -1000, left: 0, right: 0, height: 1000, backgroundColor: heroColors.gradient[0] as string }} />

        {/* Hero gradient — dominant color from the artist photo → black,
            mirroring the Vybe Mix screen so the background always
            complements whatever artist is in view. */}
        <Animated.View style={{ transform: [{ scale: heroScale }, { translateY: heroTranslateY }] }}>
        <LinearGradient
          colors={heroColors.gradient as unknown as readonly [string, string, ...string[]]}
          locations={heroColors.locations as unknown as readonly [number, number, ...number[]]}
          style={{ paddingTop: insets.top + 56 }}
        >
          {/* Artist portrait with halo glow in dominant color */}
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 24, paddingHorizontal: 60 }}>
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
                <Image
                  source={{ uri: heroPhoto }}
                  style={{
                    width: ARTWORK_SIZE,
                    height: ARTWORK_SIZE,
                    borderRadius: 10,
                    backgroundColor: '#0D0722',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.08)',
                  }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </View>
            </View>
          </View>

          {/* Name + listeners + genres + action buttons */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
            <Text style={{ color: '#fff', fontSize: 40, fontWeight: '800', letterSpacing: -0.5 }}>{artistName}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 }}>1.2M Monthly Listeners</Text>
            {(data?.genres ?? []).length > 0 && (
              <View style={[styles.genreRow, { marginTop: 10 }]}>
                {data!.genres.map(g => (
                  <View key={g} style={styles.genreTag}>
                    <Text style={styles.genreText}>{g}</Text>
                  </View>
                ))}
              </View>
            )}
            {/* Action buttons — Follow + Vybe */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 12 }}>
              <Pressable style={{ borderWidth: 1, borderColor: '#fff', borderRadius: 24, paddingHorizontal: 28, paddingVertical: 10 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Follow</Text>
              </Pressable>
              <LinearGradient
                colors={['#F97316', '#8B5CF6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}
              >
                <Sparkles size={20} color="#fff" />
              </LinearGradient>
            </View>
          </View>
        </LinearGradient>
        </Animated.View>

        {/* Sections — glassmorphism cards on dark background */}
        <View style={{ backgroundColor: '#0A0A0A', paddingHorizontal: 20, paddingTop: 16 }}>
          {/* Bio — glassmorphism card */}
          {!!data?.bio && (
            <View style={{ marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 16 }}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.bioText} numberOfLines={5}>{data.bio}</Text>
            </View>
          )}

          {/* In Your Library — glassmorphism card */}
          {libraryTracks.length > 0 && (
            <View style={{ marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 16 }}>
              <Text style={styles.sectionTitle}>In Your Library</Text>
              {libraryTracks.map(track => (
                <LibraryTrackRow
                  key={track.id}
                  track={track}
                  isPlaying={currentTrack?.id === track.id}
                  onPress={() => playTrack(track, libraryTracks)}
                />
              ))}
            </View>
          )}

          {/* Popular via Apple Music */}
          {loading ? (
            <View style={{ alignItems: 'center', marginTop: 20 }}>
              <LoadingRing size={28} />
            </View>
          ) : (data?.topTracks ?? []).length > 0 ? (
            <View style={{ marginBottom: 20, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 16 }}>
              <Text style={styles.sectionTitle}>Popular Tracks</Text>
              {data!.topTracks.map((t, i) => (
                <View key={i} style={styles.topTrackRow}>
                  <Text style={styles.trackNum}>{i + 1}</Text>
                  {t.artworkUrl ? (
                    <Image source={{ uri: t.artworkUrl }} style={styles.trackArt} contentFit="cover" />
                  ) : (
                    <View style={[styles.trackArt, { backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center' }]}>
                      <Music2 size={16} color="#8B5CF6" />
                    </View>
                  )}
                  <Text style={styles.trackName} numberOfLines={1}>{t.trackName}</Text>
                  <TopTrackDownload trackName={t.trackName} artistName={artistName} artwork={t.artworkUrl || primaryArtwork} />
                </View>
              ))}
            </View>
          ) : null}

          {/* House Ad — contextual brand placement */}
          <HouseAdCard
            {...HOUSE_ADS[0]}
            collabArtist={artistName}
          />

          {/* Social Pulse */}
          <View style={{ marginBottom: 28, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 16 }}>
            <Text style={styles.sectionTitle}>Social Pulse</Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, lineHeight: 20 }}>
              See which friends are listening to {artistName} and discover shared playlists.
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              {[0, 1, 2].map(i => (
                <View key={i} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#282828', marginRight: -8, borderWidth: 2, borderColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700' }}>{String.fromCharCode(65 + i)}</Text>
                </View>
              ))}
              <View style={{ marginLeft: 16, justifyContent: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>3 friends listening</Text>
              </View>
            </View>
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  navTitle: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginHorizontal: 8 },
  header: { height: HEADER_HEIGHT, width: SCREEN_WIDTH, overflow: 'hidden' },
  mosaic: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  mosaicTile: { width: SCREEN_WIDTH / 2, height: HEADER_HEIGHT / 2 },
  headerContent: { position: 'absolute', bottom: 20, left: 20, right: 20 },
  artistName: { color: '#fff', fontSize: 32, fontWeight: '800', marginBottom: 8 },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  genreTag: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  genreText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  sectionTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  bioText: { color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 21 },
  topTrackRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
  trackNum: { color: 'rgba(255,255,255,0.4)', fontSize: 14, width: 20, textAlign: 'center' },
  trackArt: { width: 44, height: 44, borderRadius: 6 },
  trackName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '500' },
});
