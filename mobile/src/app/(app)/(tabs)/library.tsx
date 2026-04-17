import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Modal, Dimensions, TextInput, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { SharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import {
  Heart,
  Plus,
  ChevronRight,
  ChevronDown,
  Check,
  Music2,
  User,
  Disc,
  Download,
  Bookmark,
  Cloud,
  Upload,
  FileAudio,
  Sparkles,
  X,
  ListMusic,
  Trash2,
  Play,
} from 'lucide-react-native';
import { playlists, artists, getLikedTracks, tracks } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore, formatFileSize } from '@/stores/downloadsStore';
import { useSoundCloudPreloadStore } from '@/stores/soundcloudPreloadStore';
import { useUserPlaylistStore } from '@/stores/userPlaylistStore';
import { Track } from '@/types/music';
import { createMMKVCache } from '@/lib/mmkv-cache';
import { tabScreenScrollBottomPad } from '@/constants/miniPlayer';

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
      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 8, textAlign: 'center' }} numberOfLines={1}>{artist.name}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 }}>Artist</Text>
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
  const router = useRouter();
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
                  <View style={{ width: 56, height: 56, borderRadius: 6, backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                    <Disc size={24} color="#8B5CF6" />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{album.name}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 }}>
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
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#8B5CF6', alignItems: 'center', justifyContent: 'center' }}>
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
                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, width: 22 }}>{i + 1}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }} numberOfLines={1}>{track.title}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 1 }} numberOfLines={1}>{track.artist}</Text>
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
        <View className="px-5">
          {/* Import Audio Button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(app)/import-audio' as never);
            }}
            className="mb-4"
          >
            <LinearGradient
              colors={['#8B5CF6', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                borderRadius: 10,
              }}
            >
              <Upload size={20} color="#fff" />
              <View className="flex-1 ml-3">
                <Text className="text-white font-semibold text-sm">Import Audio</Text>
                <Text className="text-white/70 text-xs">Add files from your device</Text>
              </View>
              <ChevronRight size={18} color="#fff" />
            </LinearGradient>
          </Pressable>

          {downloadedTracks.length === 0 ? (
            <View className="items-center justify-center py-16">
              <View className="w-16 h-16 bg-[#8B5CF6]/20 rounded-full items-center justify-center mb-4">
                <FileAudio size={32} color="#8B5CF6" />
              </View>
              <Text className="text-white font-semibold text-lg">No downloads yet</Text>
              <Text className="text-white/50 text-sm mt-2 text-center px-8">
                Import audio files to listen offline.
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-white/50 text-xs mb-3">
                {downloadedTracks.length} {downloadedTracks.length === 1 ? 'track' : 'tracks'} available offline
              </Text>
              {downloadedTracks.map(track => (
                <Pressable
                  key={track.id}
                  onPress={() => playTrack(track, downloadedTracks)}
                  className="flex-row items-center py-3"
                >
                  {track.artwork ? (
                    <Image
                      source={{ uri: track.artwork }}
                      style={{ width: 56, height: 56, borderRadius: 4 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="w-14 h-14 bg-[#8B5CF6]/20 rounded items-center justify-center">
                      <Music2 size={24} color="#8B5CF6" />
                    </View>
                  )}
                  <View className="flex-1 ml-4">
                    <Text className="text-white font-medium" numberOfLines={1}>{track.title}</Text>
                    <View className="flex-row items-center mt-0.5">
                      {track.isUserImported ? (
                        <FileAudio size={12} color="#8B5CF6" />
                      ) : (
                        <Download size={12} color="#8B5CF6" />
                      )}
                      <Text className="text-white/60 text-sm ml-1">{track.artist}</Text>
                      <Text className="text-white/30 mx-1">•</Text>
                      <Text className="text-white/40 text-xs">{formatFileSize(track.fileSize)}</Text>
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

    // Default: Playlists or no filter — horizontal scroll card layout
    const CARD_SIZE = 110;
    return (
      <View>
        {/* Liked Songs row */}
        <View style={{ paddingHorizontal: 16 }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(app)/liked-songs' as never);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
          >
            <LinearGradient
              colors={['#4B2AA3', '#2D1B69']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ width: 56, height: 56, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}
            >
              <Heart size={24} color="#fff" fill="#fff" />
            </LinearGradient>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Liked Songs</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 }}>
                Playlist · {likedTracks.size} {likedTracks.size === 1 ? 'song' : 'songs'}
              </Text>
            </View>
            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                if (likedSongs.length > 0) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(likedSongs[0], likedSongs); }
              }}
              hitSlop={8}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}
            >
              <Play size={16} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
            </Pressable>
          </Pressable>
        </View>

        {/* Your Playlists — horizontal scroll cards */}
        <View style={{ marginTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Your Playlists</Text>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>See all {'>'}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }} style={{ flexGrow: 0 }}>
            {userPlaylists.map(playlist => (
              <Pressable
                key={playlist.id}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/(app)/my-playlist/${playlist.id}` as never); }}
                style={{ width: CARD_SIZE, marginRight: 12 }}
              >
                <View style={{ width: CARD_SIZE, height: CARD_SIZE, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1C1C1C' }}>
                  {playlist.artwork ? (
                    <Image source={{ uri: playlist.artwork }} style={{ width: CARD_SIZE, height: CARD_SIZE }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <ListMusic size={32} color="#8B5CF6" />
                    </View>
                  )}
                  <View style={{ position: 'absolute', bottom: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={14} color="#000" fill="#000" style={{ marginLeft: 1 }} />
                  </View>
                </View>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 6 }} numberOfLines={1}>{playlist.name}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{playlist.tracks.length} songs</Text>
              </Pressable>
            ))}
            {/* Create playlist card */}
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowCreatePlaylist(true); }}
              style={{ width: CARD_SIZE }}
            >
              <View style={{ width: CARD_SIZE, height: CARD_SIZE, borderRadius: 10, backgroundColor: '#1C1C1C', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={28} color="rgba(255,255,255,0.3)" />
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '500', marginTop: 6 }}>Create playlist</Text>
            </Pressable>
          </ScrollView>
        </View>

        {/* Saved Albums — horizontal scroll */}
        {libraryAlbums.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Saved Albums</Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>See all {'>'}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }} style={{ flexGrow: 0 }}>
              {libraryAlbums.map(album => (
                <Pressable
                  key={album.key}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    playTrack(album.tracks[0], album.tracks);
                  }}
                  style={{ width: CARD_SIZE, marginRight: 12 }}
                >
                  <View style={{ width: CARD_SIZE, height: CARD_SIZE, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1C1C1C' }}>
                    {album.artwork ? (
                      <Image source={{ uri: album.artwork }} style={{ width: CARD_SIZE, height: CARD_SIZE }} contentFit="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Disc size={32} color="#8B5CF6" />
                      </View>
                    )}
                    <View style={{ position: 'absolute', bottom: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
                      <Play size={14} color="#000" fill="#000" style={{ marginLeft: 1 }} />
                    </View>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 6 }} numberOfLines={1}>{album.name}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{album.tracks.length} songs</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Liked Songs — horizontal scroll */}
        {likedSongs.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Liked Songs</Text>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>See all {'>'}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }} style={{ flexGrow: 0 }}>
              {likedSongs.slice(0, 10).map(track => (
                <Pressable
                  key={track.id}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(track, likedSongs); }}
                  style={{ width: CARD_SIZE, marginRight: 12 }}
                >
                  <View style={{ width: CARD_SIZE, height: CARD_SIZE, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1C1C1C' }}>
                    {track.artwork ? (
                      <Image source={{ uri: track.artwork }} style={{ width: CARD_SIZE, height: CARD_SIZE }} contentFit="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Heart size={32} color="#8B5CF6" />
                      </View>
                    )}
                    <View style={{ position: 'absolute', bottom: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' }}>
                      <Play size={14} color="#000" fill="#000" style={{ marginLeft: 1 }} />
                    </View>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 6 }} numberOfLines={1}>{track.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }} numberOfLines={1}>{track.artist}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="px-4 py-3" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between mb-4">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ProfileAvatar size={32} />
            <Text className="text-white text-[22px] font-bold ml-3">Your Library</Text>
          </View>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowCreatePlaylist(true); }}
            className="p-2"
          >
            <Plus size={26} color="#fff" />
          </Pressable>
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginLeft: -4 }}
          contentContainerStyle={{ paddingRight: 16 }}
        >
          {filters.map(filter => (
            <Pressable
              key={filter.key}
              onPress={() => setActiveFilter(activeFilter === filter.key ? null : filter.key)}

              style={{
                backgroundColor: activeFilter === filter.key ? '#22C55E' : '#232323',
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                marginLeft: 8,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: tabScreenScrollBottomPad(insets.bottom, !!currentTrack) }}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>


      {/* Create Playlist Modal — full screen */}
      <Modal
        visible={showCreatePlaylist}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShowCreatePlaylist(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: '#0A0A0A' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
              value={playlistName}
              onChangeText={setPlaylistName}
              placeholder="Playlist name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              style={{ backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 13, color: '#fff', fontSize: 16 }}
              returnKeyType="done"
            />
          </View>

          {/* Track search bar */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 }}>
              <Music2 size={16} color="rgba(255,255,255,0.4)" />
              <TextInput
                value={trackSearchQuery}
                onChangeText={setTrackSearchQuery}
                placeholder="Search tracks"
                placeholderTextColor="rgba(255,255,255,0.3)"
                style={{ flex: 1, color: '#fff', fontSize: 15, marginLeft: 10 }}
                returnKeyType="search"
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
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 2 }} numberOfLines={1}>{track.artist}</Text>
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
      </Modal>
    </View>
  );
}
