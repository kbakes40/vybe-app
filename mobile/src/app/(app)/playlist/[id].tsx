import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  Linking,
  Platform,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Svg, Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import {
  ChevronLeft,
  Play,
  Shuffle,
  Heart,
  MoreHorizontal,
  Clock,
  Music2,
  ChevronRight,
  Shirt,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { getPlaylistById, getTracksFromPlaylist, playlists } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import { TrackCard } from '@/components/TrackCard';
import { PLAYLIST_DOCKED_PADDING_BOTTOM } from '@/constants/Layout';
import { radialBackdropForPlaylistName } from '@/lib/vybePlaylistBackdrop';
import * as Haptics from 'expo-haptics';

const MAINSTREET_TEES_URL = 'https://mainstreettees.com/';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ART_HORIZONTAL_INSET = 24;
const ARTWORK_SIZE = SCREEN_WIDTH - ART_HORIZONTAL_INSET * 2;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const playTrack = usePlaybackController(s => s.playTrack);

  const playScale = useSharedValue(1);

  const playlist = getPlaylistById(id ?? '');
  const playlistTracks = getTracksFromPlaylist(id ?? '');
  const relatedPlaylists = playlists.filter(p => p.id !== (id ?? '')).slice(0, 6);

  const vibeRadial = useMemo(
    () => radialBackdropForPlaylistName(playlist?.title ?? ''),
    [playlist?.title],
  );

  const listBottomPad = PLAYLIST_DOCKED_PADDING_BOTTOM + insets.bottom;

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  if (!playlist) {
    return (
      <View className="flex-1 bg-[#0A0A0A] items-center justify-center">
        <Text className="text-white">Playlist not found</Text>
      </View>
    );
  }

  const totalDuration = playlistTracks.reduce((acc, t) => acc + t.duration, 0);

  const handlePlayAll = () => {
    if (playlistTracks.length > 0) {
      playTrack(playlistTracks[0], playlistTracks);
    }
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <Svg
        width={SCREEN_WIDTH}
        height={420}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient id="mockPlRadial" cx="50%" cy="16%" r="72%">
            <Stop offset="0%" stopColor={vibeRadial.center} stopOpacity={0.5} />
            <Stop offset="100%" stopColor={vibeRadial.fade} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={SCREEN_WIDTH} height={420} fill="url(#mockPlRadial)" />
      </Svg>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: listBottomPad }}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={playlist.gradientColors ?? ['#1a1a2e', '#0A0A0A']}
          style={{ paddingTop: insets.top }}
        >
          <Pressable
            onPress={() => router.back()}
            className="absolute top-0 left-4 w-10 h-10 rounded-full bg-black/30 items-center justify-center z-10"
            style={{ marginTop: insets.top }}
          >
            <ChevronLeft size={24} color="#fff" />
          </Pressable>

          <View className="items-center pt-12 pb-6" style={{ paddingHorizontal: ART_HORIZONTAL_INSET }}>
            <View
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 20 },
                shadowOpacity: 0.5,
                shadowRadius: 30,
                elevation: 20,
              }}
            >
              <Image
                source={{ uri: playlist.artwork }}
                style={{
                  width: ARTWORK_SIZE,
                  height: ARTWORK_SIZE,
                  borderRadius: 8,
                }}
                contentFit="cover"
              />
            </View>
          </View>

          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <View
              style={{
                borderRadius: 14,
                overflow: 'hidden',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(217, 70, 239, 0.2)',
              }}
            >
              <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFillObject} />
              <View style={{ padding: 16 }}>
                <Text className="text-white text-2xl font-bold">{playlist.title}</Text>
                <Text className="text-white/70 text-sm mt-1.5 leading-5">{playlist.description}</Text>

                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Linking.openURL(MAINSTREET_TEES_URL).catch(() => {});
                  }}
                  style={({ pressed }) => [
                    styles.mainstreetRow,
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Shirt size={20} color="#D946EF" strokeWidth={2.2} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mainstreetKicker}>MAINSTREET TEES</Text>
                    <Text style={styles.mainstreetSub}>Premium apparel · Vybe collab</Text>
                  </View>
                  <Text style={{ color: '#FBBF24', fontSize: 11, fontWeight: '800' }}>Shop</Text>
                </Pressable>

                <View className="flex-row items-center mt-3 flex-wrap gap-2">
                  <View
                    style={{
                      backgroundColor: '#8B5CF6',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 4,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>
                      {playlist.creator}
                    </Text>
                  </View>
                  <View className="flex-row items-center">
                    <Music2 size={12} color="rgba(255,255,255,0.4)" />
                    <Text className="text-white/40 text-sm ml-1">{playlist.trackCount} songs</Text>
                  </View>
                  <View className="w-1 h-1 bg-white/20 rounded-full" />
                  <Text className="text-white/40 text-sm">
                    {Math.floor(playlist.duration / 3600)}h {Math.floor((playlist.duration % 3600) / 60)}m
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View className="flex-row items-center px-5 py-4 bg-[#0A0A0A]">
          <Pressable className="p-2">
            <Heart size={24} color="#fff" />
          </Pressable>
          <Pressable className="ml-4 p-2">
            <MoreHorizontal size={24} color="#fff" />
          </Pressable>
          <View className="flex-1" />
          <Pressable className="p-2 mr-2">
            <Shuffle size={24} color="#8B5CF6" />
          </Pressable>
          <AnimatedPressable
            onPress={handlePlayAll}
            onPressIn={() => {
              playScale.value = withSpring(0.9);
            }}
            onPressOut={() => {
              playScale.value = withSpring(1);
            }}
            style={playButtonStyle}
            className="w-14 h-14 bg-[#8B5CF6] rounded-full items-center justify-center"
          >
            <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
          </AnimatedPressable>
        </View>

        <View>
          {playlistTracks.map((track, index) => (
            <TrackCard
              key={track.id}
              track={track}
              queue={playlistTracks}
              index={index}
            />
          ))}
        </View>

        <View className="px-5 py-3 flex-row items-center">
          <Clock size={14} color="rgba(255,255,255,0.3)" />
          <Text className="text-white/30 text-xs ml-1.5">
            {Math.floor(totalDuration / 3600) > 0
              ? `${Math.floor(totalDuration / 3600)} hr ${Math.floor((totalDuration % 3600) / 60)} min`
              : `${Math.floor(totalDuration / 60)} min`}
          </Text>
        </View>

        <View className="mt-4 mb-2">
          <Text className="text-white text-xl font-bold px-5 mb-1">Recommended Playlists</Text>
          <Text className="text-white/40 text-sm px-5 mb-4">Based on what you're listening to</Text>
          {relatedPlaylists.map(related => (
            <Pressable
              key={related.id}
              onPress={() => router.push(`/(app)/playlist/${related.id}` as never)}
              className="flex-row items-center px-5 py-3"
            >
              <View
                style={{
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 6,
                }}
              >
                <Image
                  source={{ uri: related.artwork }}
                  style={{ width: 60, height: 60, borderRadius: 6 }}
                  contentFit="cover"
                />
              </View>
              <View className="flex-1 ml-4">
                <Text className="text-white font-semibold text-[15px]" numberOfLines={1}>
                  {related.title}
                </Text>
                <View className="flex-row items-center mt-0.5">
                  <View
                    style={{
                      backgroundColor: '#8B5CF6',
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                      borderRadius: 3,
                      marginRight: 6,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
                      PLAYLIST
                    </Text>
                  </View>
                  <Text className="text-white/50 text-sm" numberOfLines={1}>
                    {related.trackCount} songs
                  </Text>
                </View>
              </View>
              <ChevronRight size={18} color="rgba(255,255,255,0.3)" />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  mainstreetRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#D946EF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  mainstreetKicker: {
    color: 'rgba(252, 231, 243, 0.95)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  mainstreetSub: {
    color: 'rgba(244, 244, 245, 0.72)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
