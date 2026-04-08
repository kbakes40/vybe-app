import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Settings, Share2, Crown, ListMusic, Music2 } from 'lucide-react-native';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { usePlaybackController } from '@/stores/playbackController';
import { useUserPlaylistStore } from '@/stores/userPlaylistStore';
import { useRecentsStore } from '@/stores/recentsStore';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { VybeIcon } from '@/components/VybeIcon';
import { MINI_PLAYER_HEIGHT } from './_layout';
import { Track } from '@/types/music';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function TrackCard({ track, onPress }: { track: Track; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ marginRight: 16 }}>
      {track.artwork ? (
        <Image
          source={{ uri: track.artwork }}
          style={{ width: 130, height: 130, borderRadius: 8 }}
          contentFit="cover"
        />
      ) : (
        <View style={{ width: 130, height: 130, borderRadius: 8, backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center' }}>
          <Music2 size={32} color="rgba(255,255,255,0.3)" />
        </View>
      )}
      <Text className="text-white font-medium text-sm mt-2" numberOfLines={1} style={{ width: 130 }}>
        {track.title}
      </Text>
      <Text className="text-white/50 text-xs" numberOfLines={1} style={{ width: 130 }}>
        {track.artist}
      </Text>
    </Pressable>
  );
}

function PlaylistCard({ name, artwork, trackCount, onPress }: { name: string; artwork?: string; trackCount: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ marginRight: 16 }}>
      {artwork ? (
        <Image
          source={{ uri: artwork }}
          style={{ width: 130, height: 130, borderRadius: 8 }}
          contentFit="cover"
        />
      ) : (
        <View style={{ width: 130, height: 130, borderRadius: 8, backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center' }}>
          <ListMusic size={36} color="rgba(255,255,255,0.3)" />
        </View>
      )}
      <Text className="text-white font-medium text-sm mt-2" numberOfLines={1} style={{ width: 130 }}>
        {name}
      </Text>
      <Text className="text-white/50 text-xs" style={{ width: 130 }}>
        {trackCount} {trackCount === 1 ? 'song' : 'songs'}
      </Text>
    </Pressable>
  );
}

function ArtistCircle({ name, image, onPress }: { name: string; image?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ marginRight: 16, alignItems: 'center' }}>
      {image ? (
        <Image
          source={{ uri: image }}
          style={{ width: 80, height: 80, borderRadius: 40 }}
          contentFit="cover"
        />
      ) : (
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center' }}>
          <Music2 size={28} color="rgba(255,255,255,0.3)" />
        </View>
      )}
      <Text className="text-white text-xs mt-2 text-center" numberOfLines={2} style={{ width: 80 }}>
        {name}
      </Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tier = useSubscriptionStore(s => s.tier);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const likedTrackIds = usePlaybackController(s => s.likedTracks);
  const userPlaylists = useUserPlaylistStore(s => s.playlists);
  const recentTracks = useRecentsStore(s => s.recentTracks);
  const downloads = useDownloadsStore(s => s.downloads);

  const showMiniPlayer = !!currentTrack;
  const bottomPadding = insets.bottom + (showMiniPlayer ? MINI_PLAYER_HEIGHT : 0) + 40;

  // Derive top artists from recents + downloads, ranked by play frequency
  const topArtists = useMemo(() => {
    const allTracks = [...recentTracks, ...downloads];
    const counts = new Map<string, { name: string; image?: string; count: number }>();
    for (const track of allTracks) {
      if (!track.artist) continue;
      const existing = counts.get(track.artist);
      if (existing) {
        existing.count++;
      } else {
        counts.set(track.artist, { name: track.artist, image: track.artwork, count: 1 });
      }
    }
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [recentTracks, downloads]);

  // Derive top genres from recents + downloads
  const topGenres = useMemo(() => {
    const allTracks = [...recentTracks, ...downloads];
    const counts = new Map<string, number>();
    for (const track of allTracks) {
      for (const genre of track.genreTags ?? []) {
        counts.set(genre, (counts.get(genre) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([genre]) => genre);
  }, [recentTracks, downloads]);

  const recentlyPlayedTracks = recentTracks.slice(0, 10);

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <LinearGradient
          colors={['#2D1B4E', '#1a1a2e', '#0A0A0A']}
          style={{ paddingTop: insets.top }}
        >
          <View className="flex-row items-center justify-between px-4 py-3">
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
              className="w-10 h-10 items-center justify-center -ml-2"
            >
              <ChevronLeft size={28} color="#fff" />
            </Pressable>
            <View className="flex-row">
              <Pressable
                onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                className="w-10 h-10 items-center justify-center"
              >
                <Share2 size={22} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(app)/settings' as never); }}
                className="w-10 h-10 items-center justify-center"
              >
                <Settings size={22} color="#fff" />
              </Pressable>
            </View>
          </View>

          {/* Profile avatar */}
          <View className="items-center px-4 pb-8">
            <View style={{ shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20 }}>
              <VybeIcon size={100} backgroundColor="#2D1B69" />
            </View>

            {tier === 'plus' && (
              <View className="flex-row items-center mt-4 bg-[#8B5CF6]/20 rounded-full px-4 py-1.5">
                <Crown size={16} color="#8B5CF6" />
                <Text className="text-[#8B5CF6] text-sm font-semibold ml-1.5">VYBE Plus</Text>
              </View>
            )}
          </View>
        </LinearGradient>

        {/* My Playlists */}
        {userPlaylists.length > 0 && (
          <View className="mt-6">
            <Text className="text-white/50 text-xs uppercase tracking-wider px-5 mb-4 font-medium">
              My Playlists
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {userPlaylists.map(playlist => (
                <PlaylistCard
                  key={playlist.id}
                  name={playlist.name}
                  artwork={playlist.artwork}
                  trackCount={playlist.tracks.length}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/(app)/my-playlist/${playlist.id}` as never); }}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recently Played */}
        {recentlyPlayedTracks.length > 0 && (
          <View className="mt-8">
            <Text className="text-white/50 text-xs uppercase tracking-wider px-5 mb-4 font-medium">
              Recently Played
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {recentlyPlayedTracks.map(track => (
                <TrackCard
                  key={track.id}
                  track={track}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Top Artists */}
        {topArtists.length > 0 && (
          <View className="mt-8">
            <Text className="text-white/50 text-xs uppercase tracking-wider px-5 mb-4 font-medium">
              Top Artists
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20 }}
              style={{ flexGrow: 0 }}
            >
              {topArtists.map(artist => (
                <ArtistCircle
                  key={artist.name}
                  name={artist.name}
                  image={artist.image}
                  onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Top Genres */}
        {topGenres.length > 0 && (
          <View className="mt-8 px-5">
            <Text className="text-white/50 text-xs uppercase tracking-wider mb-4 font-medium">
              Top Genres
            </Text>
            <View className="flex-row flex-wrap">
              {topGenres.map(genre => (
                <View key={genre} className="bg-white/10 rounded-full px-4 py-2 mr-2 mb-2">
                  <Text className="text-white text-sm">{genre}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Empty state */}
        {userPlaylists.length === 0 && recentlyPlayedTracks.length === 0 && topArtists.length === 0 && (
          <View className="items-center justify-center px-8 pt-16">
            <VybeIcon size={64} backgroundColor="#1A1A2E" />
            <Text className="text-white/40 text-center mt-6 text-base">
              Start listening to build your profile
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
