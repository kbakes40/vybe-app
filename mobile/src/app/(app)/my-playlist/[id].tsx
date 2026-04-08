import React, { useCallback } from 'react';
import { View, Text, FlatList, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Play, Shuffle, Trash2, ListMusic } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, SharedValue, interpolate, Extrapolation } from 'react-native-reanimated';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import * as Haptics from 'expo-haptics';
import { useUserPlaylistStore } from '@/stores/userPlaylistStore';
import { usePlaybackController } from '@/stores/playbackController';
import { TrackCard } from '@/components/TrackCard';
import { useVybePopup } from '@/components/VybePopup';
import { Track } from '@/types/music';

function TrackDeleteAction({ progress, onPress }: { progress: SharedValue<number>; onPress: () => void }) {
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
        <Trash2 size={20} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 3 }}>Remove</Text>
      </Pressable>
    </Animated.View>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function MyPlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showVybePopup } = useVybePopup();

  const playlist = useUserPlaylistStore(s => s.playlists.find(p => p.id === id));
  const deletePlaylist = useUserPlaylistStore(s => s.deletePlaylist);
  const removeTrackFromPlaylist = useUserPlaylistStore(s => s.removeTrackFromPlaylist);
  const playTrack = usePlaybackController(s => s.playTrack);

  const playScale = useSharedValue(1);
  const playButtonStyle = useAnimatedStyle(() => ({ transform: [{ scale: playScale.value }] }));

  const handlePlayAll = useCallback(() => {
    if (!playlist || playlist.tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(playlist.tracks[0], playlist.tracks);
  }, [playlist, playTrack]);

  const handleShuffle = useCallback(() => {
    if (!playlist || playlist.tracks.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const shuffled = [...playlist.tracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  }, [playlist, playTrack]);

  const handleDelete = useCallback(() => {
    if (!playlist) return;
    showVybePopup({
      title: 'Delete Playlist',
      message: `Are you sure you want to delete "${playlist.name}"? This can't be undone.`,
      type: 'confirm',
      actions: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            deletePlaylist(id ?? '');
            router.back();
          },
        },
      ],
    });
  }, [playlist, id, deletePlaylist, router, showVybePopup]);

  const renderTrack = useCallback(({ item, index }: { item: Track; index: number }) => {
    if (!playlist) return null;
    return (
      <ReanimatedSwipeable
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        containerStyle={{ width: '100%' }}
        renderRightActions={(progress) => (
          <TrackDeleteAction
            progress={progress}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              removeTrackFromPlaylist(id ?? '', item.id);
            }}
          />
        )}
      >
        <View style={{ width: '100%' }}>
          <TrackCard track={item} queue={playlist.tracks} index={index} />
        </View>
      </ReanimatedSwipeable>
    );
  }, [playlist, id, removeTrackFromPlaylist]);

  const keyExtractor = useCallback((item: Track) => item.id, []);

  if (!playlist) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff' }}>Playlist not found</Text>
      </View>
    );
  }

  const totalMinutes = Math.floor(playlist.tracks.reduce((acc, t) => acc + (t.duration ?? 0), 0) / 60);

  const ListHeader = (
    <View>
      {/* Header gradient */}
      <LinearGradient
        colors={['#3B1F6E', '#1A0D38', '#0A0A0A']}
        style={{ paddingTop: insets.top }}
      >
        {/* Back + Delete buttons */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: insets.top > 0 ? 0 : 12 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={22} color="#fff" />
          </Pressable>
          <Pressable
            onPress={handleDelete}
            hitSlop={12}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Trash2 size={18} color="#FF5555" />
          </Pressable>
        </View>

        {/* Artwork */}
        <View style={{ alignItems: 'center', paddingTop: 24, paddingBottom: 20, paddingHorizontal: 60 }}>
          <View style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.6, shadowRadius: 30 }}>
            {playlist.artwork ? (
              <Image
                source={{ uri: playlist.artwork }}
                style={{ width: SCREEN_WIDTH - 120, height: SCREEN_WIDTH - 120, borderRadius: 8 }}
                contentFit="cover"
              />
            ) : (
              <View style={{ width: SCREEN_WIDTH - 120, height: SCREEN_WIDTH - 120, borderRadius: 8, backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center' }}>
                <ListMusic size={64} color="rgba(255,255,255,0.3)" />
              </View>
            )}
          </View>
        </View>

        {/* Info */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>{playlist.name}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 4 }}>
            {playlist.tracks.length} {playlist.tracks.length === 1 ? 'song' : 'songs'}{totalMinutes > 0 ? ` · ${totalMinutes} min` : ''}
          </Text>
        </View>
      </LinearGradient>

      {/* Action bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#0A0A0A' }}>
        <View style={{ flex: 1 }} />
        <Pressable onPress={handleShuffle} style={{ padding: 8, marginRight: 8 }}>
          <Shuffle size={26} color="#8B5CF6" />
        </Pressable>
        <AnimatedPressable
          onPress={handlePlayAll}
          onPressIn={() => { playScale.value = withSpring(0.88); }}
          onPressOut={() => { playScale.value = withSpring(1); }}
          style={[playButtonStyle, { width: 56, height: 56, borderRadius: 28, backgroundColor: '#4F6CF5', alignItems: 'center', justifyContent: 'center' }]}
        >
          <Play size={26} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
        </AnimatedPressable>
      </View>
    </View>
  );

  const ListEmpty = (
    <View style={{ alignItems: 'center', paddingTop: 60 }}>
      <ListMusic size={48} color="rgba(255,255,255,0.15)" />
      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, marginTop: 16 }}>No tracks yet</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <FlatList
        data={playlist.tracks}
        keyExtractor={keyExtractor}
        renderItem={renderTrack}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={10}
      />
    </View>
  );
}
