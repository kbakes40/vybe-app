import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  Heart,
  Plus,
  ChevronRight,
  Music2,
  User,
  Disc,
  Download,
  Bookmark,
  Cloud,
  Upload,
  FileAudio,
  Sparkles,
} from 'lucide-react-native';
import { playlists, albums, artists, getLikedTracks, tracks } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore, formatFileSize } from '@/stores/downloadsStore';
import { useSoundCloudPreloadStore } from '@/stores/soundcloudPreloadStore';

type FilterType = 'playlists' | 'artists' | 'albums' | 'downloaded' | 'saved_external' | 'vybe_originals';

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

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterType | null>(null);
  const likedTracks = usePlaybackController(s => s.likedTracks);
  const playTrack = usePlaybackController(s => s.playTrack);
  const downloads = useDownloadsStore(s => s.downloads);
  const preloadBatch = useSoundCloudPreloadStore(s => s.preloadBatch);

  const filters: { key: FilterType; label: string }[] = [
    { key: 'playlists', label: 'Playlists' },
    { key: 'albums', label: 'Albums' },
    { key: 'artists', label: 'Artists' },
    { key: 'downloaded', label: 'Downloaded' },
    { key: 'saved_external', label: 'Saved External' },
    { key: 'vybe_originals', label: 'VYBE Originals' },
  ];

  const likedSongs = getLikedTracks();

  // Get external tracks that are liked (saved to library)
  const savedExternalTracks = tracks.filter(
    t => (t.source === 'youtube' || t.source === 'youtube_music' || t.source === 'soundcloud') && likedTracks.has(t.id)
  );

  // Preload SoundCloud tracks when saved_external filter is active
  useEffect(() => {
    if (activeFilter === 'saved_external') {
      const soundcloudTracks = savedExternalTracks
        .filter(t => t.source === 'soundcloud' && t.soundcloudUrl)
        .map(t => ({
          id: t.id,
          soundcloudUrl: t.soundcloudUrl!,
          artwork: t.artwork,
          title: t.title,
          artist: t.artist,
          duration: t.duration,
        }));

      if (soundcloudTracks.length > 0) {
        preloadBatch(soundcloudTracks);
      }
    }
  }, [activeFilter, savedExternalTracks, preloadBatch]);

  // Use actual downloads from store
  const downloadedTracks = downloads;

  const handlePlayLiked = () => {
    if (likedSongs.length > 0) {
      playTrack(likedSongs[0], likedSongs);
    }
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

  const renderContent = () => {
    if (activeFilter === 'artists') {
      return (
        <View>
          {artists.slice(0, 8).map(artist => (
            <Pressable
              key={artist.id}
              onPress={() => router.push(`/(app)/artist/${artist.id}` as never)}
              className="flex-row items-center px-5 py-3"
            >
              <Image
                source={{ uri: artist.image }}
                style={{ width: 56, height: 56, borderRadius: 28 }}
                contentFit="cover"
              />
              <View className="flex-1 ml-4">
                <Text className="text-white font-medium">{artist.name}</Text>
                <Text className="text-white/60 text-sm">Artist</Text>
              </View>
              <ChevronRight size={20} color="rgba(255,255,255,0.4)" />
            </Pressable>
          ))}
        </View>
      );
    }

    if (activeFilter === 'albums') {
      return (
        <View>
          {albums.map(album => (
            <Pressable
              key={album.id}
              onPress={() => router.push(`/(app)/album/${album.id}` as never)}
              className="flex-row items-center px-5 py-3"
            >
              <Image
                source={{ uri: album.artwork }}
                style={{ width: 56, height: 56, borderRadius: 4 }}
                contentFit="cover"
              />
              <View className="flex-1 ml-4">
                <Text className="text-white font-medium">{album.title}</Text>
                <Text className="text-white/60 text-sm">
                  {album.artist} · Album
                </Text>
              </View>
              <ChevronRight size={20} color="rgba(255,255,255,0.4)" />
            </Pressable>
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
                        <Download size={12} color="#1DB954" />
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

    if (activeFilter === 'saved_external') {
      return (
        <View className="px-5">
          {savedExternalTracks.length === 0 ? (
            <View className="items-center justify-center py-20">
              <View className="w-16 h-16 bg-[#8B5CF6]/20 rounded-full items-center justify-center mb-4">
                <Bookmark size={32} color="#8B5CF6" />
              </View>
              <Text className="text-white font-semibold text-lg">No saved external tracks</Text>
              <Text className="text-white/50 text-sm mt-2 text-center px-8">
                Save tracks from YouTube, YouTube Music, and SoundCloud to access them here.
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-white/50 text-xs mb-4">
                External tracks are bookmarks. Tap to open in their source app.
              </Text>
              {savedExternalTracks.map(track => (
                <Pressable
                  key={track.id}
                  onPress={() => playTrack(track, savedExternalTracks)}
                  className="flex-row items-center py-3"
                >
                  <Image
                    source={{ uri: track.artwork }}
                    style={{ width: 56, height: 56, borderRadius: 4 }}
                    contentFit="cover"
                  />
                  <View className="flex-1 ml-4">
                    <Text className="text-white font-medium" numberOfLines={1}>{track.title}</Text>
                    <View className="flex-row items-center mt-0.5">
                      {getSourceIcon(track.source || '')}
                      <Text className="text-white/50 text-sm ml-1.5">
                        {getSourceLabel(track.source || '')}
                      </Text>
                      <Text className="text-white/30 mx-1">·</Text>
                      <Text className="text-white/50 text-sm">{track.artist}</Text>
                    </View>
                  </View>
                  <ChevronRight size={20} color="rgba(255,255,255,0.4)" />
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

    // Default: Playlists or no filter
    return (
      <View>
        {/* VYBE Originals Card */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/(app)/vybe-originals' as never);
          }}
          className="mx-5 mb-4 overflow-hidden rounded-lg"
        >
          <LinearGradient
            colors={['#7C3AED', '#5B21B6', '#4C1D95']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 14,
            }}
          >
            <View className="w-14 h-14 bg-white/20 rounded-lg items-center justify-center">
              <Sparkles size={28} color="#fff" />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-white font-bold text-base">VYBE Originals</Text>
              <Text className="text-white/80 text-sm">AI-Generated Music</Text>
            </View>
            <ChevronRight size={22} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        </Pressable>

        {/* Liked Songs */}
        <Pressable
          onPress={handlePlayLiked}
          className="mx-5 mb-4 overflow-hidden rounded-lg"
        >
          <LinearGradient
            colors={['#4B2AA3', '#2D1B69']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              padding: 12,
            }}
          >
            <View className="w-14 h-14 items-center justify-center">
              <Heart size={28} color="#fff" fill="#fff" />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-white font-bold text-base">Liked Songs</Text>
              <Text className="text-white/70 text-sm">
                {likedTracks.size} songs
              </Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* Playlists */}
        {playlists.map(playlist => (
          <Pressable
            key={playlist.id}
            onPress={() => router.push(`/(app)/playlist/${playlist.id}` as never)}
            className="flex-row items-center px-5 py-3"
          >
            <Image
              source={{ uri: playlist.artwork }}
              style={{ width: 56, height: 56, borderRadius: 4 }}
              contentFit="cover"
            />
            <View className="flex-1 ml-4">
              <Text className="text-white font-medium">{playlist.title}</Text>
              <Text className="text-white/60 text-sm">
                Playlist · {playlist.creator}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#121212]">
      {/* Header */}
      <View className="px-4 py-3" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center">
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop' }}
              style={{ width: 32, height: 32, borderRadius: 16 }}
              contentFit="cover"
            />
            <Text className="text-white text-[22px] font-bold ml-3">
              Your Library
            </Text>
          </View>
          <Pressable className="p-2">
            <Plus size={26} color="#fff" />
          </Pressable>
        </View>

        {/* Filter chips - Spotify style */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginLeft: -4 }}
          contentContainerStyle={{ paddingRight: 16 }}
        >
          {filters.map(filter => (
            <Pressable
              key={filter.key}
              onPress={() =>
                setActiveFilter(activeFilter === filter.key ? null : filter.key)
              }
              style={{
                backgroundColor: activeFilter === filter.key ? '#1DB954' : '#232323',
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                marginLeft: 8,
              }}
            >
              <Text
                style={{
                  color: activeFilter === filter.key ? '#000' : '#fff',
                  fontSize: 13,
                  fontWeight: '500',
                }}
              >
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {renderContent()}
      </ScrollView>
    </View>
  );
}
