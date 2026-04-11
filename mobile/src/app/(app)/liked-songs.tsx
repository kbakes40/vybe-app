import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Play, Shuffle, Heart } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { tracks } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import { TrackCard } from '@/components/TrackCard';
import { usePlaylistHeroColors } from '@/lib/usePlaylistHeroColors';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function LikedSongsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const likedTracks = usePlaybackController(s => s.likedTracks);
  const playTrack = usePlaybackController(s => s.playTrack);

  const playScale = useSharedValue(1);
  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  // All liked tracks in order
  const likedSongs = tracks.filter(t => likedTracks.has(t.id) || t.isLiked);

  const handlePlayAll = () => {
    if (likedSongs.length > 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playTrack(likedSongs[0], likedSongs);
    }
  };

  const handleShuffle = () => {
    if (likedSongs.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shuffled = [...likedSongs].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  const totalMinutes = Math.floor(likedSongs.reduce((acc, t) => acc + t.duration, 0) / 60);

  // Pull the palette from the most-recently-liked song's artwork so the
  // Liked Songs hero feels tied to the user's actual library.
  const heroColors = usePlaylistHeroColors(likedSongs[0]?.artwork);

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header gradient — dominant color from the latest liked song's
            artwork → black. */}
        <LinearGradient
          colors={heroColors.gradient as unknown as readonly [string, string, ...string[]]}
          locations={heroColors.locations as unknown as readonly [number, number, ...number[]]}
          style={{ paddingTop: insets.top + 8, paddingBottom: 24 }}
        >
          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            style={{
              position: 'absolute',
              top: insets.top + 8,
              left: 16,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(0,0,0,0.3)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <ChevronLeft size={22} color="#fff" />
          </Pressable>

          {/* Heart icon */}
          <View style={{ alignItems: 'center', paddingTop: 48, paddingBottom: 20 }}>
            <View
              style={{
                width: 160,
                height: 160,
                borderRadius: 12,
                backgroundColor: 'rgba(139,92,246,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#8B5CF6',
                shadowOffset: { width: 0, height: 12 },
                shadowOpacity: 0.4,
                shadowRadius: 24,
              }}
            >
              <Heart size={72} color="#fff" fill="#fff" />
            </View>
          </View>

          {/* Title */}
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>Liked Songs</Text>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 4 }}>
              {likedSongs.length} {likedSongs.length === 1 ? 'song' : 'songs'} · {totalMinutes} min
            </Text>
          </View>
        </LinearGradient>

        {/* Action row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 20,
            paddingVertical: 16,
          }}
        >
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={handleShuffle}
            style={{ padding: 8, marginRight: 8 }}
          >
            <Shuffle size={26} color="#8B5CF6" />
          </Pressable>
          <AnimatedPressable
            onPress={handlePlayAll}
            onPressIn={() => { playScale.value = withSpring(0.88); }}
            onPressOut={() => { playScale.value = withSpring(1); }}
            style={[
              playButtonStyle,
              {
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: '#8B5CF6',
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            <Play size={26} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
          </AnimatedPressable>
        </View>

        {/* Track list */}
        {likedSongs.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 60 }}>
            <Heart size={48} color="rgba(255,255,255,0.2)" />
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, marginTop: 16, fontWeight: '500' }}>
              No liked songs yet
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, marginTop: 6 }}>
              Tap the heart on any track to save it here
            </Text>
          </View>
        ) : (
          likedSongs.map((track, index) => (
            <TrackCard
              key={track.id}
              track={track}
              queue={likedSongs}
              index={index}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
