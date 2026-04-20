import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Modal, Dimensions, TextInput, KeyboardAvoidingView, Platform, Keyboard, StyleSheet, type TextStyle } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { SharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  Heart,
  Plus,
  ChevronDown,
  Check,
  Music2,
  User,
  Disc,
  Download,
  Bookmark,
  Cloud,
  FileAudio,
  Sparkles,
  X,
  Trash2,
  Play,
} from 'lucide-react-native';
import { playlists, artists, getLikedTracks, tracks } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import { useRecentsStore } from '@/stores/recentsStore';
import { useDownloadsStore, formatFileSize } from '@/stores/downloadsStore';
import { useSoundCloudPreloadStore } from '@/stores/soundcloudPreloadStore';
import { useUserPlaylistStore } from '@/stores/userPlaylistStore';
import { Track } from '@/types/music';
import { createMMKVCache, TTL } from '@/lib/mmkv-cache';
import {
  getDiscover,
  getHome,
  normalizeYtmThumb,
  ytmTracksToQueueTracks,
  prewarmYtmFeed,
  type YtmPlaylistTrack,
} from '@/lib/api/ytMusic';
import { getTasteSeedTracks } from '@/lib/tasteSeed';
import { useRecommendationSignalStore } from '@/stores/recommendationSignalStore';
import { SourceCornerBadge } from '@/components/SourceCornerBadge';
import { MasonryFlashList } from '@shopify/flash-list';
import { SHADOW_TEXT_INPUT_DEFAULTS } from '@/lib/shadowInput';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { useFastVerticalScrollMotion } from '@/hooks/useFastScrollMotion';
import { MachinedGradientText } from '@/components/MachinedGradientText';
import { VaultImportCard } from '@/components/VaultImportCard';
import { VIBRANT_BLUE, GRAPHITE_GREY } from '@/constants/machinedTheme';
import { tabScreenContentContainerPaddingBottom } from '@/constants/Layout';
import { useLouisOledChrome } from '@/hooks/useLouisOledChrome';

const TRACK_TITLE_MACHINED: TextStyle = {
  color: VIBRANT_BLUE,
  fontWeight: '600',
  fontSize: 14,
  textShadowColor: 'rgba(0,229,255,0.5)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 8,
};

const TRACK_META_GREY: TextStyle = {
  color: GRAPHITE_GREY,
  fontSize: 12,
};

const SEE_ALL_LINK = {
  color: 'rgba(255,255,255,0.42)',
  fontSize: 10,
  fontWeight: '600' as const,
  letterSpacing: 1.5,
  textTransform: 'uppercase' as const,
};

/** Unified shadow card: machined border + vault radius */
const SHADOW_CARD_FRAME = {
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.12)',
  borderRadius: 16,
  backgroundColor: '#050505',
  overflow: 'hidden' as const,
};

const libraryFeedMMKV = createMMKVCache('vybe-library-feed');
const LIB_FEED_KEYS = { suggestedYtm: 'suggestedYtmV1' } as const;

type DeepCutTile = { id: string; track: YtmPlaylistTrack; layoutHeight: number };

const HEART_SHADOW_GLOW = Platform.select({
  ios: {
    shadowColor: '#D946EF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 12,
  },
  android: { elevation: 12 },
  default: {},
});

// Shared MMKV cache with the artist-profile screen — both screens read from
// and write to the same `vybe-artist-profile` bucket so the circle thumbnail
// in the library matches the hero portrait on the detail screen.
const artistProfileMMKV = createMMKVCache('vybe-artist-profile');
const ARTIST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
interface CachedArtist { bio: string; photo: string; genres: string[]; topTracks: { trackName: string; artworkUrl: string }[] }

// A "real" artist photo comes from Wikipedia (upload.wikimedia.org) or
// iTunes (mzstatic.com). An earlier buggy version of this cache poisoned
// entries with track artwork (ytimg/scdn/soundcloud URLs), so treat any
// stored photo that doesn't match the allow-list as missing and re-fetch.
function isRealArtistPhoto(url: string | undefined): boolean {
  if (!url) return false;
  return /upload\.wikimedia\.org/.test(url) || /mzstatic\.com/.test(url);
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_WIDTH = (SCREEN_WIDTH - 32 - 36) / 4;
const ARTIST_COL_WIDTH = (SCREEN_WIDTH - 48) / 2;

// Module-level cache so photos survive re-renders
const artistImgCache = new Map<string, string>();

/**
 * Fetch the high-quality artist portrait (Wikipedia → iTunes fallback) and
 * write it into the shared MMKV bucket so the artist-profile detail screen
 * paints the exact same image with no flicker. ONLY caches a "real" photo —
 * if both Wikipedia and iTunes fail we leave the cache empty so a later
 * attempt (or the detail screen) can retry, instead of poisoning MMKV with
 * the track-artwork fallback.
 */
function fetchArtistPhoto(artistName: string, fallback: string): Promise<string> {
  const key = artistName.toLowerCase();

  return fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(artistName)}`)
    .then(r => r.json())
    .then(async (wikiData) => {
      let photo: string = wikiData.originalimage?.source ?? wikiData.thumbnail?.source ?? '';
      const bio: string = wikiData.extract ?? '';
      if (!photo) {
        try {
          const itResp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=1`);
          const itData = await itResp.json();
          const art = itData.results?.[0]?.artworkUrl100 ?? '';
          if (art) photo = art.replace(/\d+x\d+bb\.jpg/, '600x600bb.jpg');
        } catch {}
      }

      if (!photo) {
        // Don't write the fallback to MMKV — leave the slot empty so the
        // detail screen can still try Wikipedia itself with different params.
        // Just return the fallback for this render.
        return fallback;
      }

      artistImgCache.set(key, photo);
      const existing = artistProfileMMKV.get<CachedArtist>(key, ARTIST_TTL_MS)?.value;
      artistProfileMMKV.set(key, {
        bio: existing?.bio || bio,
        photo,
        genres: existing?.genres ?? [],
        topTracks: existing?.topTracks ?? [],
      });
      return photo;
    })
    .catch(() => fallback);
}

function useArtistImage(artistName: string, fallback: string): string {
  const key = artistName.toLowerCase();
  // Lazy-init: only trust MMKV if it holds a REAL Wikipedia/iTunes photo.
  // Anything else (track artwork from the old buggy version, or nothing)
  // gets treated as empty and triggers a background re-fetch.
  const [img, setImg] = useState<string>(() => {
    const disk = artistProfileMMKV.get<CachedArtist>(key, ARTIST_TTL_MS)?.value;
    if (disk?.photo && isRealArtistPhoto(disk.photo)) {
      artistImgCache.set(key, disk.photo);
      return disk.photo;
    }
    if (artistImgCache.has(key) && isRealArtistPhoto(artistImgCache.get(key)!)) {
      return artistImgCache.get(key)!;
    }
    return fallback;
  });
  useEffect(() => {
    const disk = artistProfileMMKV.get<CachedArtist>(key, ARTIST_TTL_MS)?.value;
    if (disk?.photo && isRealArtistPhoto(disk.photo)) return;
    fetchArtistPhoto(artistName, fallback).then(setImg);
  }, [key]);
  return img;
}

const ARTIST_CARD_SIZE = Math.floor((SCREEN_WIDTH - 48) / 2);

function ArtistCard({ artist, onPress }: { artist: { id: string; name: string; image: string }; onPress: () => void }) {
  const photo = useArtistImage(artist.name, artist.image);
  return (
    <Pressable onPress={onPress} style={{ width: ARTIST_CARD_SIZE, alignItems: 'center' }}>
      <Image
        source={{ uri: photo }}
        style={{ width: ARTIST_CARD_SIZE, height: ARTIST_CARD_SIZE, borderRadius: ARTIST_CARD_SIZE / 2 }}
        contentFit="cover"
      />
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600', marginTop: 8, textAlign: 'center' }} numberOfLines={1}>{artist.name}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 }}>Artist</Text>
    </Pressable>
  );
}

type FilterType = 'playlists' | 'artists' | 'albums' | 'downloaded' | 'vybe_originals';

// YouTube icon component
function YouTubeIcon({ size = 14 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: '#FF0000',
        borderRadius: 3,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.35,
          borderTopWidth: size * 0.2,
          borderBottomWidth: size * 0.2,
          borderLeftColor: '#fff',
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          marginLeft: 1,
        }}
      />
    </View>
  );
}

// YouTube Music icon component
function YouTubeMusicIcon({ size = 14 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: '#FF0000',
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.3,
          borderTopWidth: size * 0.18,
          borderBottomWidth: size * 0.18,
          borderLeftColor: '#fff',
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          marginLeft: 1,
        }}
      />
    </View>
  );
}

// SoundCloud icon component
function SoundCloudIcon({ size = 14 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: '#FF5500',
        borderRadius: 3,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Cloud size={size * 0.7} color="#fff" strokeWidth={3} />
    </View>
  );
}

function PlaylistDeleteAction({ progress, onPress }: { progress: SharedValue<number>; onPress: () => void }) {
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
        <Trash2 size={22} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 3 }}>Delete</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { louis, kickTranslateStyle, tabListTopPadding } = useLouisOledChrome(insets.top);
  const router = useRouter();
  const [libraryHeaderHeight, setLibraryHeaderHeight] = useState(118);
  const listBottomPad = tabScreenContentContainerPaddingBottom(insets.bottom);
  const [activeFilter, setActiveFilter] = useState<FilterType | null>(null);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [trackSearchQuery, setTrackSearchQuery] = useState('');
  const likedTracks = usePlaybackController(s => s.likedTracks);
  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const downloads = useDownloadsStore(s => s.downloads);
  const preloadBatch = useSoundCloudPreloadStore(s => s.preloadBatch);
  const userPlaylists = useUserPlaylistStore(s => s.playlists);
  const createPlaylist = useUserPlaylistStore(s => s.createPlaylist);
  const deletePlaylist = useUserPlaylistStore(s => s.deletePlaylist);
  const recentTracks = useRecentsStore(s => s.recentTracks);

  const suggestedYtmCacheHitRef = useRef(false);
  const [suggestedYtm, setSuggestedYtm] = useState<YtmPlaylistTrack[]>(() => {
    const hit = libraryFeedMMKV.get<YtmPlaylistTrack[]>(LIB_FEED_KEYS.suggestedYtm, TTL.GENRE);
    if (hit?.value?.length) {
      suggestedYtmCacheHitRef.current = true;
      return hit.value;
    }
    return [];
  });
  const [tasteProfileOpen, setTasteProfileOpen] = useState(false);
  const [deepCuts, setDeepCuts] = useState<YtmPlaylistTrack[]>([]);
  const [deepCutsLoading, setDeepCutsLoading] = useState(false);
  const likeRefreshPulse = useRecommendationSignalStore((s) => s.likeRefreshPulse);
  const { scrollHandler, listMotionStyle } = useFastVerticalScrollMotion();

  const refreshSuggestedForYou = useCallback(() => {
    void getHome(30, getTasteSeedTracks())
      .then((rows) => {
        if (!rows?.length) return;
        const next = rows.map((r) => normalizeYtmThumb(r));
        setSuggestedYtm(next);
        libraryFeedMMKV.set(LIB_FEED_KEYS.suggestedYtm, next);
        void prewarmYtmFeed(next, 16);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (suggestedYtmCacheHitRef.current) return;
    refreshSuggestedForYou();
  }, [refreshSuggestedForYou]);

  useEffect(() => {
    if (likeRefreshPulse === 0) return;
    refreshSuggestedForYou();
  }, [likeRefreshPulse, refreshSuggestedForYou]);

  const openTasteProfile = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTasteProfileOpen(true);
    setDeepCutsLoading(true);
    getDiscover(48, getTasteSeedTracks())
      .then((rows) => {
        const next = rows.map((r) => normalizeYtmThumb(r));
        setDeepCuts(next);
        void prewarmYtmFeed(next, 12);
      })
      .catch(() => setDeepCuts([]))
      .finally(() => setDeepCutsLoading(false));
  }, []);

  const deepCutMasonryData = useMemo<DeepCutTile[]>(
    () =>
      deepCuts.map((t) => ({
        id: t.videoId,
        track: t,
        layoutHeight: 168 + (t.title.length % 8) * 10,
      })),
    [deepCuts],
  );

  const filters: { key: FilterType; label: string }[] = [
    { key: 'playlists', label: 'Playlists' },
    { key: 'albums', label: 'Albums' },
    { key: 'artists', label: 'Artists' },
    { key: 'downloaded', label: 'Downloaded' },
  ];

  // All liked tracks — union of static isLiked flag and dynamically liked tracks from playback controller
  const likedSongs = tracks.filter(t => likedTracks.has(t.id) || t.isLiked);

  // Use actual downloads from store
  const downloadedTracks = downloads;

  const handlePlayLiked = () => {
    if (likedSongs.length > 0) {
      playTrack(likedSongs[0], likedSongs);
    }
  };

  // All tracks available for playlist building
  const allAvailableTracks: Track[] = [
    ...downloads,
    ...tracks.filter(t => likedTracks.has(t.id) || t.isLiked),
  ].filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i);

  const toggleTrackSelection = (id: string) => {
    setSelectedTrackIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleCreatePlaylist = () => {
    Keyboard.dismiss();
    const name = playlistName.trim() || 'My Playlist';
    const selected = allAvailableTracks.filter(t => selectedTrackIds.has(t.id));

    // Close the modal and clear state FIRST so the UI is responsive even if
    // createPlaylist is slow or throws asynchronously.
    setShowCreatePlaylist(false);
    setPlaylistName('');
    setSelectedTrackIds(new Set());
    setTrackSearchQuery('');

    try {
      createPlaylist(name, selected);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      console.error('[Library] createPlaylist failed:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleCloseCreatePlaylist = () => {
    Keyboard.dismiss();
    setShowCreatePlaylist(false);
    setPlaylistName('');
    setSelectedTrackIds(new Set());
    setTrackSearchQuery('');
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'youtube':
        return <YouTubeIcon size={14} />;
      case 'youtube_music':
        return <YouTubeMusicIcon size={14} />;
      case 'soundcloud':
        return <SoundCloudIcon size={14} />;
      default:
        return null;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'youtube':
        return 'YouTube';
      case 'youtube_music':
        return 'YouTube Music';
      case 'soundcloud':
        return 'SoundCloud';
      default:
        return 'VYBE';
    }
  };

  // Handle VYBE Originals navigation in useEffect to avoid setState during render
  useEffect(() => {
    if (activeFilter === 'vybe_originals') {
      router.push('/(app)/vybe-originals' as never);
      setActiveFilter(null);
    }
  }, [activeFilter, router]);



  // Album expand state
  const [expandedAlbum, setExpandedAlbum] = useState<string | null>(null);

  // Build album groups from downloaded tracks
  const libraryAlbums = React.useMemo(() => {
    const map = new Map<string, { key: string; name: string; artist: string; artwork: string; tracks: typeof downloads }>();
    downloads.forEach(t => {
      const albumName = t.album || t.artist || 'Unknown';
      const key = albumName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { key, name: albumName, artist: t.artist || '', artwork: t.artwork || '', tracks: [] });
      }
      const entry = map.get(key)!;
      entry.tracks.push(t);
      if (t.artwork && !entry.artwork) entry.artwork = t.artwork;
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [downloads]);

  // Build unique artist list from downloaded tracks
  const libraryArtists = React.useMemo(() => {
    const map = new Map<string, { name: string; artworks: string[] }>();
    downloads.forEach(t => {
      if (!t.artist) return;
      const key = t.artist.toLowerCase();
      if (!map.has(key)) map.set(key, { name: t.artist, artworks: [] });
      if (t.artwork && !map.get(key)!.artworks.includes(t.artwork)) {
        map.get(key)!.artworks.push(t.artwork);
      }
    });
    // Fall back to mock artists if no downloads
    if (map.size === 0) {
      artists.forEach(a => map.set(a.name.toLowerCase(), { name: a.name, artworks: [a.image] }));
    }
    return Array.from(map.values());
  }, [downloads]);

  const LIBRARY_CARD_SIZE = 110;

  type LibraryHomeRow =
    | { kind: 'header'; key: string; title: string }
    | { kind: 'track'; key: string; track: Track; queue: Track[] };

  const libraryHomeRows = useMemo(() => {
    const out: LibraryHomeRow[] = [];
    if (likedSongs.length > 0) {
      likedSongs.forEach(t => out.push({ kind: 'track', key: `lk-${t.id}`, track: t, queue: likedSongs }));
    }
    if (recentTracks.length > 0) {
      out.push({ kind: 'header', key: 'hdr-recent', title: 'Recent Tracks' });
      recentTracks.forEach(t => out.push({ kind: 'track', key: `rc-${t.id}`, track: t, queue: recentTracks }));
    }
    return out;
  }, [likedSongs, recentTracks]);

  // Pre-warm artist photos in the background so the Artists tab + every
  // detail screen paints with the cached portrait instantly. Throttled to
  // 4 in-flight at a time so we don't slam Wikipedia on a big library.
  // Re-fetches any entry whose cached photo isn't a real Wikipedia/iTunes
  // URL — fixes the earlier bug where track artwork got written in here.
  useEffect(() => {
    if (libraryArtists.length === 0) return;
    let cancelled = false;
    const queue = libraryArtists
      .map(a => ({ name: a.name, fallback: a.artworks[0] ?? '' }))
      .filter(a => {
        const key = a.name.toLowerCase();
        const disk = artistProfileMMKV.get<CachedArtist>(key, ARTIST_TTL_MS)?.value;
        if (disk?.photo && isRealArtistPhoto(disk.photo)) return false;
        return true;
      });
    let index = 0;
    const CONCURRENCY = 4;
    const worker = async () => {
      while (!cancelled && index < queue.length) {
        const job = queue[index++];
        try { await fetchArtistPhoto(job.name, job.fallback); } catch {}
      }
    };
    Array.from({ length: CONCURRENCY }).forEach(() => { worker(); });
    return () => { cancelled = true; };
  }, [libraryArtists]);

  const renderContent = () => {
    if (activeFilter === 'artists') {
      if (libraryArtists.length === 0) {
        return (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
            <User size={48} color="rgba(255,255,255,0.2)" />
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, marginTop: 16, textAlign: 'center' }}>
              Download tracks to see{'\n'}artists here
            </Text>
          </View>
        );
      }
      const colWidth = Math.floor((SCREEN_WIDTH - 48) / 2);
      const leftArtists = libraryArtists.filter((_, i) => i % 2 === 0);
      const rightArtists = libraryArtists.filter((_, i) => i % 2 === 1);
      const renderArtistItem = (artist: typeof libraryArtists[0]) => (
        <Pressable
          key={artist.name}
          onPress={() => router.push({ pathname: '/(app)/artist-profile', params: { name: artist.name, artworks: artist.artworks.join('|||') } } as never)}
          style={{ width: colWidth, alignItems: 'center', marginBottom: 24 }}
        >
          <Image
            source={{ uri: artist.artworks[0] ?? '' }}
            style={{ width: colWidth, height: colWidth, borderRadius: colWidth / 2 }}
            contentFit="cover"
          />
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 8, textAlign: 'center' }} numberOfLines={1}>{artist.name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>Artist</Text>
        </Pressable>
      );
      return (
        <View style={{ flexDirection: 'row', paddingLeft: 16, paddingRight: 16 }}>
          <View style={{ width: colWidth }}>
            {leftArtists.map(renderArtistItem)}
          </View>
          <View style={{ width: colWidth, marginLeft: 16 }}>
            {rightArtists.map(renderArtistItem)}
          </View>
        </View>
      );
    }

    if (activeFilter === 'albums') {
      if (libraryAlbums.length === 0) {
        return (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
            <Disc size={48} color="rgba(255,255,255,0.2)" />
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, marginTop: 16, textAlign: 'center' }}>
              Download tracks to see{'\n'}albums here
            </Text>
          </View>
        );
      }
      return (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 16 }}>
            {libraryAlbums.length} {libraryAlbums.length === 1 ? 'album' : 'albums'}
          </Text>
          {libraryAlbums.map(album => (
            <View key={album.key}>
              {/* Album row */}
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setExpandedAlbum(expandedAlbum === album.key ? null : album.key);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
              >
                {album.artwork ? (
                  <Image source={{ uri: album.artwork }} style={{ width: 56, height: 56, borderRadius: 6 }} contentFit="cover" />
                ) : (
                  <View style={{ width: 56, height: 56, borderRadius: 6, backgroundColor: 'rgba(0,229,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                    <Disc size={24} color={VIBRANT_BLUE} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{album.name}</Text>
                  <Text style={{ color: GRAPHITE_GREY, fontSize: 13, marginTop: 2 }}>
                    {album.artist} · {album.tracks.length} {album.tracks.length === 1 ? 'song' : 'songs'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    playTrack(album.tracks[0], album.tracks);
                  }}
                  style={{ padding: 8 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: VIBRANT_BLUE, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#000', fontSize: 14, marginLeft: 2 }}>▶</Text>
                  </View>
                </Pressable>
                <ChevronDown
                  size={18}
                  color="rgba(255,255,255,0.4)"
                  style={{ marginLeft: 4, transform: [{ rotate: expandedAlbum === album.key ? '180deg' : '0deg' }] }}
                />
              </Pressable>

              {/* Expanded track list */}
              {expandedAlbum === album.key && (
                <View style={{ paddingLeft: 70, paddingBottom: 8 }}>
                  {album.tracks.map((track, i) => (
                    <Pressable
                      key={track.id}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        playTrack(track, album.tracks);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
                    >
                      <Text style={{ color: GRAPHITE_GREY, fontSize: 13, width: 22 }}>{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={TRACK_TITLE_MACHINED} numberOfLines={1}>{track.title}</Text>
                        <Text style={[TRACK_META_GREY, { fontSize: 12, marginTop: 1 }]} numberOfLines={1}>{track.artist}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
              {/* Divider */}
              <View style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 2 }} />
            </View>
          ))}
        </View>
      );
    }

    if (activeFilter === 'downloaded') {
      return (
        <View className="px-5" style={{ backgroundColor: '#000000' }}>
          <VaultImportCard
            onPress={() => {
              router.push('/(app)/import-audio' as never);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          />

          {downloadedTracks.length === 0 ? (
            <View className="items-center justify-center py-16">
              <View
                className="w-16 h-16 rounded-full items-center justify-center mb-4"
                style={{ backgroundColor: 'rgba(0,229,255,0.12)' }}
              >
                <FileAudio size={32} color={VIBRANT_BLUE} />
              </View>
              <Text className="text-white font-semibold text-lg">Vault empty</Text>
              <Text style={{ color: GRAPHITE_GREY, fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>
                Import to Vault — tracks stay on-device, OLED-ready.
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ color: GRAPHITE_GREY, fontSize: 12, marginBottom: 12 }}>
                {downloadedTracks.length} {downloadedTracks.length === 1 ? 'asset' : 'assets'} in Vault
              </Text>
              {downloadedTracks.map(track => (
                <Pressable
                  key={track.id}
                  onPress={() => playTrack(track, downloadedTracks)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, backgroundColor: '#000000' }}
                >
                  {track.artwork ? (
                    <ShadowArtworkImage
                      source={{ uri: track.artwork }}
                      style={{ width: 56, height: 56, borderRadius: 4 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 4,
                        backgroundColor: 'rgba(0,229,255,0.12)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Music2 size={24} color={VIBRANT_BLUE} />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 16 }}>
                    <Text style={TRACK_TITLE_MACHINED} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      {track.isUserImported ? (
                        <FileAudio size={12} color={GRAPHITE_GREY} />
                      ) : (
                        <Download size={12} color={GRAPHITE_GREY} />
                      )}
                      <Text style={[TRACK_META_GREY, { fontSize: 13, marginLeft: 4, flex: 1 }]} numberOfLines={1}>
                        {track.artist}
                      </Text>
                      <Text style={[TRACK_META_GREY, { marginHorizontal: 6 }]}>•</Text>
                      <Text style={[TRACK_META_GREY, { fontSize: 11 }]}>{formatFileSize(track.fileSize)}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </>
          )}
        </View>
      );
    }

    if (activeFilter === 'vybe_originals') {
      // Navigation handled in useEffect above
      return null;
    }

    // Default home is rendered by FlashList in the main return (playlists / no filter).
    return null;
  };

  const showLibraryHomeList = activeFilter === null || activeFilter === 'playlists';

  const openCreatePlaylistModal = useCallback(() => {
    setShowCreatePlaylist(true);
  }, []);

  const libraryHomeListHeader = (
    <View>
      {/* Full-width Liked Songs hero */}
      <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(app)/liked-songs' as never);
          }}
        >
          <LinearGradient
            colors={['rgba(255,0,255,0.125)', '#000000']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
              paddingVertical: 22,
              paddingHorizontal: 18,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View
              style={[
                {
                  width: 72,
                  height: 72,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(0,0,0,0.45)',
                },
                HEART_SHADOW_GLOW,
              ]}
            >
              <Heart size={36} color="#FFFFFF" fill="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 20, letterSpacing: -0.35 }}>Liked Songs</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 5 }}>
                Playlist · {likedTracks.size} {likedTracks.size === 1 ? 'song' : 'songs'}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                if (likedSongs.length > 0) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  playTrack(likedSongs[0], likedSongs);
                }
              }}
              hitSlop={10}
              style={{ marginLeft: 8 }}
            >
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.28)',
                  backgroundColor: '#000000',
                }}
              >
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(139,92,246,0.42)',
                  }}
                >
                  <Play size={22} color="#FFFFFF" fill="#FFFFFF" style={{ marginLeft: 3 }} />
                </View>
              </View>
            </Pressable>
          </LinearGradient>
        </Pressable>
      </View>

      {suggestedYtm.length > 0 ? (
        <View style={{ marginTop: 22 }}>
          <View
            style={{
              paddingHorizontal: 16,
              marginBottom: 12,
              flexDirection: 'row',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Suggested for You</Text>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 6 }}>
                From your liked songs — updates when you heart a track
              </Text>
            </View>
            <Pressable
              onPress={openTasteProfile}
              hitSlop={8}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: 'rgba(255,0,255,0.45)',
                backgroundColor: 'rgba(255,0,255,0.08)',
              }}
            >
              <Text style={{ color: '#F0ABFC', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>
                Taste Profile
              </Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
            style={{ flexGrow: 0 }}
          >
            {suggestedYtm.map((t) => {
              const queue = ytmTracksToQueueTracks(suggestedYtm);
              const self = queue.find((q) => q.id === `ytm-${t.videoId}`)!;
              const dim = 140;
              return (
                <Pressable
                  key={t.videoId}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    playTrack(self, queue);
                  }}
                  style={{ width: dim, marginRight: 12 }}
                >
                  <View style={[SHADOW_CARD_FRAME, { width: dim, height: dim }]}>
                    <Image
                      source={{ uri: t.thumbnailUrl }}
                      style={{ width: dim, height: dim }}
                      contentFit="cover"
                    />
                    <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                      <SourceCornerBadge source="youtube_music" compact />
                    </View>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 8 }} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {t.channelName}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ marginTop: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Your Playlists</Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            hitSlop={12}
          >
            <Text style={SEE_ALL_LINK}>See all {'>'}</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }} style={{ flexGrow: 0 }}>
          {userPlaylists.map(playlist => (
            <Pressable
              key={playlist.id}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/(app)/my-playlist/${playlist.id}` as never); }}
              style={{ width: LIBRARY_CARD_SIZE, marginRight: 12 }}
            >
              <View style={[SHADOW_CARD_FRAME, { width: LIBRARY_CARD_SIZE, height: LIBRARY_CARD_SIZE }]}>
                {playlist.artwork ? (
                  <Image source={{ uri: playlist.artwork }} style={{ width: LIBRARY_CARD_SIZE, height: LIBRARY_CARD_SIZE }} contentFit="cover" />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#000000',
                      paddingHorizontal: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: '#FFFFFF',
                        fontWeight: '900',
                        fontSize: 12,
                        textAlign: 'center',
                        letterSpacing: -0.3,
                      }}
                      numberOfLines={3}
                    >
                      {playlist.name}
                    </Text>
                  </View>
                )}
                <View
                  style={{
                    position: 'absolute',
                    bottom: 6,
                    right: 6,
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.2)',
                  }}
                >
                  <View style={{ flex: 1, backgroundColor: '#000000' }}>
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.5)' }}>
                      <Play size={13} color="#fff" fill="#fff" style={{ marginLeft: 1 }} />
                    </View>
                  </View>
                </View>
              </View>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 8 }} numberOfLines={1}>{playlist.name}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>{playlist.tracks.length} songs</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              openCreatePlaylistModal();
            }}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              openCreatePlaylistModal();
            }}
            delayLongPress={350}
            style={{ width: LIBRARY_CARD_SIZE }}
          >
            <View
              style={[
                SHADOW_CARD_FRAME,
                {
                  width: LIBRARY_CARD_SIZE,
                  height: LIBRARY_CARD_SIZE,
                  borderStyle: 'dashed',
                  borderColor: 'rgba(255,255,255,0.2)',
                  backgroundColor: 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <Plus size={26} color="rgba(255,255,255,0.35)" />
            </View>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '500', marginTop: 8 }}>Create playlist</Text>
          </Pressable>
        </ScrollView>
      </View>

      {libraryAlbums.length > 0 && (
        <View style={{ marginTop: 26 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Saved Albums</Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveFilter('albums');
              }}
              hitSlop={12}
            >
              <Text style={SEE_ALL_LINK}>See all {'>'}</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }} style={{ flexGrow: 0 }}>
            {libraryAlbums.map(album => (
              <Pressable
                key={album.key}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  playTrack(album.tracks[0], album.tracks);
                }}
                style={{ width: LIBRARY_CARD_SIZE, marginRight: 12 }}
              >
                <View style={[SHADOW_CARD_FRAME, { width: LIBRARY_CARD_SIZE, height: LIBRARY_CARD_SIZE }]}>
                  {album.artwork ? (
                    <Image source={{ uri: album.artwork }} style={{ width: LIBRARY_CARD_SIZE, height: LIBRARY_CARD_SIZE }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Disc size={32} color={VIBRANT_BLUE} />
                    </View>
                  )}
                  <View
                    style={{
                      position: 'absolute',
                      bottom: 6,
                      right: 6,
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      overflow: 'hidden',
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.2)',
                    }}
                  >
                    <View style={{ flex: 1, backgroundColor: '#000000' }}>
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,229,255,0.45)' }}>
                        <Play size={13} color="#000" fill="#000" style={{ marginLeft: 1 }} />
                      </View>
                    </View>
                  </View>
                </View>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 8 }} numberOfLines={1}>{album.name}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>{album.tracks.length} songs</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  return (
    <Animated.View style={[{ flex: 1, backgroundColor: '#000000' }, louis && kickTranslateStyle]}>
      {showLibraryHomeList ? (
        <Animated.View style={[{ flex: 1 }, listMotionStyle]}>
        <FlashList
          data={libraryHomeRows}
          keyExtractor={(item) => item.key}
          estimatedItemSize={68}
          getItemType={(item) => item.kind}
          ListHeaderComponent={libraryHomeListHeader}
          contentContainerStyle={{ paddingTop: libraryHeaderHeight, paddingBottom: listBottomPad }}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return (
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingTop: 22,
                    paddingBottom: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{item.title}</Text>
                  {item.title === 'Recent Tracks' ? (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push('/(app)/downloads' as never);
                      }}
                      hitSlop={12}
                    >
                      <Text style={SEE_ALL_LINK}>See all {'>'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            }
            return (
              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  playTrack(item.track, item.queue);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 }}
              >
                {item.track.artwork ? (
                  <View style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', backgroundColor: '#050505' }}>
                    <ShadowArtworkImage source={{ uri: item.track.artwork }} style={{ width: 48, height: 48 }} contentFit="cover" />
                  </View>
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,229,255,0.22)', backgroundColor: 'rgba(0,229,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                    <Heart size={20} color={VIBRANT_BLUE} />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={TRACK_TITLE_MACHINED} numberOfLines={1}>{item.track.title}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 }}>
                    {getSourceIcon(item.track.source ?? '')}
                    <Text style={[TRACK_META_GREY, { flex: 1 }]} numberOfLines={1}>{item.track.artist}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
        </Animated.View>
      ) : (
        <Animated.ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingTop: libraryHeaderHeight, paddingBottom: listBottomPad }}
          showsVerticalScrollIndicator={false}
          automaticallyAdjustContentInsets={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          <Animated.View style={listMotionStyle}>{renderContent()}</Animated.View>
        </Animated.ScrollView>
      )}

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
        }}
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 52 : 40}
          tint="dark"
          style={{
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <View
            onLayout={(e) => setLibraryHeaderHeight(e.nativeEvent.layout.height)}
            style={{ paddingTop: tabListTopPadding, paddingHorizontal: 16, paddingBottom: 12 }}
          >
            <View className="flex-row items-center justify-between mb-4">
              <MachinedGradientText
                neonGlow
                style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.3, paddingLeft: 4 }}
                numberOfLines={1}
              >
                Your Library
              </MachinedGradientText>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowCreatePlaylist(true); }}
                className="p-2"
              >
                <Plus size={26} color="#fff" />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, marginLeft: -4 }}
              contentContainerStyle={{ paddingRight: 16 }}
            >
              {filters.map(filter => {
                const isOn = activeFilter === filter.key;
                return (
                  <Pressable
                    key={filter.key}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveFilter(isOn ? null : filter.key);
                    }}
                    style={[
                      {
                        backgroundColor: 'transparent',
                        borderWidth: isOn ? 1 : 0,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 20,
                        marginLeft: 8,
                        borderColor: isOn ? VIBRANT_BLUE : 'transparent',
                      },
                      isOn
                        ? Platform.select({
                            ios: {
                              shadowColor: VIBRANT_BLUE,
                              shadowOffset: { width: 0, height: 0 },
                              shadowOpacity: 0.35,
                              shadowRadius: 10,
                            },
                            android: { elevation: 4 },
                            default: {},
                          })
                        : null,
                    ]}
                  >
                    <Text
                      style={{
                        color: isOn ? VIBRANT_BLUE : GRAPHITE_GREY,
                        fontSize: 13,
                        fontWeight: isOn ? '800' : '500',
                      }}
                    >
                      {filter.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </BlurView>
      </View>

      {/* Create Playlist Modal — sheet over blurred vault */}
      <Modal
        visible={showCreatePlaylist}
        transparent
        animationType="slide"
        onRequestClose={handleCloseCreatePlaylist}
        statusBarTranslucent
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.88)' }]} pointerEvents="none" />
          <Pressable style={StyleSheet.absoluteFill} onPress={handleCloseCreatePlaylist} accessibilityRole="button" />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{
              width: '100%',
              maxHeight: '92%',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              overflow: 'hidden',
              backgroundColor: 'rgba(6,6,6,0.94)',
              borderTopWidth: 1,
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
            }}
          >
          {/* Header */}
          <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
            <Pressable
              onPress={handleCloseCreatePlaylist}
              style={{ marginRight: 16 }}
              hitSlop={12}
            >
              <X size={24} color="rgba(255,255,255,0.7)" />
            </Pressable>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 }}>New Playlist</Text>
            <Pressable
              onPress={handleCreatePlaylist}
              hitSlop={8}
              style={{ backgroundColor: '#8B5CF6', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                Create{selectedTrackIds.size > 0 ? ` (${selectedTrackIds.size})` : ''}
              </Text>
            </Pressable>
          </View>

          {/* Name input */}
          <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
            <TextInput
              {...SHADOW_TEXT_INPUT_DEFAULTS}
              value={playlistName}
              onChangeText={setPlaylistName}
              placeholder="Playlist name"
              style={{ backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13, color: '#fff', fontSize: 16 }}
              returnKeyType="done"
            />
          </View>

          {/* Track search bar */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
              <Music2 size={16} color="rgba(255,255,255,0.4)" />
              <TextInput
                {...SHADOW_TEXT_INPUT_DEFAULTS}
                value={trackSearchQuery}
                onChangeText={setTrackSearchQuery}
                placeholder="Search tracks"
                style={{ flex: 1, color: '#fff', fontSize: 15, marginLeft: 10 }}
                returnKeyType="search"
                blurOnSubmit={false}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {trackSearchQuery.length > 0 && (
                <Pressable onPress={() => setTrackSearchQuery('')}>
                  <X size={16} color="rgba(255,255,255,0.4)" />
                </Pressable>
              )}
            </View>
          </View>

          {/* Section label */}
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '600', letterSpacing: 0.8 }}>
              {allAvailableTracks.length === 0 ? 'NO TRACKS AVAILABLE' : `ADD TRACKS · ${selectedTrackIds.size} SELECTED`}
            </Text>
          </View>

          {/* Track list */}
          {(() => {
            const q = trackSearchQuery.toLowerCase();
            const visibleTracks = q
              ? allAvailableTracks.filter(t =>
                  t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
                )
              : allAvailableTracks;
            return visibleTracks.length === 0 && trackSearchQuery ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15 }}>No results for "{trackSearchQuery}"</Text>
              </View>
            ) : null;
          })()}
          {allAvailableTracks.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Music2 size={48} color="rgba(255,255,255,0.15)" />
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, marginTop: 16, fontWeight: '500' }}>
                No tracks available yet
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 }}>
                Download songs or like tracks to add them to a playlist
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {allAvailableTracks.filter(t => {
                const q = trackSearchQuery.toLowerCase();
                return !q || t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q);
              }).map(track => {
                const selected = selectedTrackIds.has(track.id);
                return (
                  <Pressable
                    key={track.id}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleTrackSelection(track.id); }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: selected ? 'rgba(139,92,246,0.1)' : 'transparent' }}
                  >
                    <View style={{ width: 52, height: 52, borderRadius: 6, overflow: 'hidden', backgroundColor: '#1A1A1A', marginRight: 14 }}>
                      {track.artwork ? <Image source={{ uri: track.artwork }} style={{ width: 52, height: 52 }} contentFit="cover" /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{track.title}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 }} numberOfLines={1}>{track.artist}</Text>
                    </View>
                    <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: selected ? '#8B5CF6' : 'rgba(255,255,255,0.2)', backgroundColor: selected ? '#8B5CF6' : 'transparent', alignItems: 'center', justifyContent: 'center', marginLeft: 12 }}>
                      {selected ? <Check size={14} color="#fff" /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={tasteProfileOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setTasteProfileOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#000000', paddingTop: insets.top + 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Pressable
              onPress={() => setTasteProfileOpen(false)}
              hitSlop={12}
              style={{ marginRight: 14 }}
            >
              <X size={24} color="rgba(255,255,255,0.75)" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>Deep Cuts</Text>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>
                Non-obvious picks matched to your taste frequency
              </Text>
            </View>
          </View>
          {deepCutsLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontWeight: '600' }}>Tuning your profile…</Text>
            </View>
          ) : (
            <MasonryFlashList
              data={deepCutMasonryData}
              numColumns={2}
              keyExtractor={(it) => it.id}
              estimatedItemSize={190}
              optimizeItemArrangement
              contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: insets.bottom + 24 }}
              overrideItemLayout={(layout, item) => {
                layout.size = item.layoutHeight;
              }}
              renderItem={({ item }) => {
                const artH = item.layoutHeight - 52;
                const queue = ytmTracksToQueueTracks(deepCuts);
                const self = queue.find((q) => q.id === `ytm-${item.track.videoId}`)!;
                return (
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      playTrack(self, queue);
                    }}
                    style={{ marginHorizontal: 6, marginBottom: 14 }}
                  >
                    <View style={[SHADOW_CARD_FRAME, { borderColor: 'rgba(255,0,255,0.22)', height: artH }]}>
                      <Image
                        source={{ uri: item.track.thumbnailUrl }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                      <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
                        <SourceCornerBadge source="youtube_music" compact />
                      </View>
                    </View>
                    <Text
                      style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 8 }}
                      numberOfLines={2}
                    >
                      {item.track.title}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                      {item.track.channelName}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </Animated.View>
  );
}
