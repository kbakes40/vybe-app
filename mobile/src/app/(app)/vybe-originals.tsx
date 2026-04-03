import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import {
  ChevronLeft,
  Sparkles,
  Play,
  RefreshCw,
  AlertCircle,
  Music2,
} from 'lucide-react-native';
import { useMusicGenStore } from '@/stores/musicgenStore';
import { usePlaybackController } from '@/stores/playbackController';
import { MusicGenTrack, MusicGenMood } from '@/types/musicgen';
import { formatDuration } from '@/data/mockData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const FEATURED_CARD_WIDTH = SCREEN_WIDTH * 0.75;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Mood display names and colors - matches backend MusicGenMood type
const MOOD_CONFIG: Record<MusicGenMood, { label: string; color: string }> = {
  chill: { label: 'Chill', color: '#60A5FA' },
  lofi: { label: 'Lo-Fi', color: '#ed8936' },
  focus: { label: 'Focus', color: '#8B5CF6' },
  productivity: { label: 'Productivity', color: '#10B981' },
  ambient: { label: 'Ambient', color: '#90cdf4' },
  cinematic: { label: 'Cinematic', color: '#f6e05e' },
  late_night: { label: 'Late Night', color: '#9f7aea' },
  dreamy: { label: 'Dreamy', color: '#EC4899' },
  energetic: { label: 'Energetic', color: '#F97316' },
  uplifting: { label: 'Uplifting', color: '#34D399' },
  melancholic: { label: 'Melancholic', color: '#6366F1' },
  ethereal: { label: 'Ethereal', color: '#14B8A6' },
  groovy: { label: 'Groovy', color: '#f687b3' },
  meditative: { label: 'Meditative', color: '#81e6d9' },
};

// Featured track card component
function FeaturedTrackCard({
  track,
  onPress,
  index,
}: {
  track: MusicGenTrack;
  onPress: () => void;
  index: number;
}) {
  const scale = useSharedValue(1);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playbackState = usePlaybackController(s => s.playbackState);
  const isCurrentTrack = currentTrack?.id === track.id;
  const isPlaying = isCurrentTrack && playbackState === 'playing';

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
      <AnimatedPressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        onPressIn={() => {
          scale.value = withSpring(0.96);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        style={[animatedStyle, { width: FEATURED_CARD_WIDTH, marginRight: 16 }]}
      >
        <View className="overflow-hidden rounded-2xl">
          <Image
            source={{ uri: track.artwork }}
            style={{ width: FEATURED_CARD_WIDTH, height: FEATURED_CARD_WIDTH * 0.6 }}
            contentFit="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.9)']}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 100,
              justifyContent: 'flex-end',
              padding: 16,
            }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-3">
                <Text
                  className={`font-bold text-lg ${isCurrentTrack ? 'text-[#8B5CF6]' : 'text-white'}`}
                  numberOfLines={1}
                >
                  {track.title}
                </Text>
                <Text className="text-white/70 text-sm" numberOfLines={1}>
                  {track.artist}
                </Text>
              </View>
              <View
                className={`w-12 h-12 rounded-full items-center justify-center ${
                  isPlaying ? 'bg-[#8B5CF6]' : 'bg-white/20'
                }`}
              >
                {isPlaying ? (
                  <View className="flex-row gap-[2px]">
                    <View className="w-[3px] h-4 bg-white rounded-full" />
                    <View className="w-[3px] h-3 bg-white rounded-full" />
                    <View className="w-[3px] h-5 bg-white rounded-full" />
                  </View>
                ) : (
                  <Play size={20} color="#fff" fill="#fff" />
                )}
              </View>
            </View>
          </LinearGradient>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

// Mood chip component
function MoodChip({
  mood,
  isSelected,
  onPress,
}: {
  mood: MusicGenMood;
  isSelected: boolean;
  onPress: () => void;
}) {
  const config = MOOD_CONFIG[mood];

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{
        backgroundColor: isSelected ? config.color : 'rgba(255,255,255,0.1)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        marginRight: 10,
        borderWidth: isSelected ? 0 : 1,
        borderColor: 'rgba(255,255,255,0.15)',
      }}
    >
      <Text
        style={{
          color: isSelected ? '#000' : '#fff',
          fontWeight: isSelected ? '600' : '500',
          fontSize: 14,
        }}
      >
        {config.label}
      </Text>
    </Pressable>
  );
}

// Track row component
function TrackRow({
  track,
  index,
  onPress,
}: {
  track: MusicGenTrack;
  index: number;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playbackState = usePlaybackController(s => s.playbackState);
  const isCurrentTrack = currentTrack?.id === track.id;
  const isPlaying = isCurrentTrack && playbackState === 'playing';

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View entering={FadeIn.delay(index * 50)}>
      <AnimatedPressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        onPressIn={() => {
          scale.value = withSpring(0.98);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        style={animatedStyle}
        className="flex-row items-center py-3 px-5"
      >
        <Image
          source={{ uri: track.artwork }}
          style={{ width: 52, height: 52, borderRadius: 6 }}
          contentFit="cover"
        />
        <View className="flex-1 ml-3">
          <Text
            className={`font-medium ${isCurrentTrack ? 'text-[#8B5CF6]' : 'text-white'}`}
            numberOfLines={1}
          >
            {track.title}
          </Text>
          <View className="flex-row items-center mt-0.5">
            <Sparkles size={12} color="#8B5CF6" />
            <Text className="text-white/60 text-sm ml-1" numberOfLines={1}>
              {track.artist}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <Text className="text-white/40 text-sm">{formatDuration(track.duration)}</Text>
          {isPlaying && (
            <View className="flex-row gap-[2px] mt-1">
              <View className="w-[2px] h-3 bg-[#8B5CF6] rounded-full" />
              <View className="w-[2px] h-2 bg-[#8B5CF6] rounded-full" />
              <View className="w-[2px] h-4 bg-[#8B5CF6] rounded-full" />
            </View>
          )}
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function VybeOriginalsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Store state
  const tracks = useMusicGenStore(s => s.tracks);
  const featuredTracks = useMusicGenStore(s => s.featuredTracks);
  const moods = useMusicGenStore(s => s.moods);
  const isLoading = useMusicGenStore(s => s.isLoading);
  const error = useMusicGenStore(s => s.error);
  const loadCatalog = useMusicGenStore(s => s.loadCatalog);
  const refreshCatalog = useMusicGenStore(s => s.refreshCatalog);
  const clearError = useMusicGenStore(s => s.clearError);
  const getTracksByMood = useMusicGenStore(s => s.getTracksByMood);

  // Playback
  const playTrack = usePlaybackController(s => s.playTrack);

  // Local state for mood filter
  const [selectedMood, setSelectedMood] = useState<MusicGenMood | null>(null);

  // Load catalog on mount
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Filtered tracks based on selected mood
  const filteredTracks = useMemo(() => {
    if (!selectedMood) return tracks;
    return getTracksByMood(selectedMood);
  }, [selectedMood, tracks, getTracksByMood]);

  const handlePlayTrack = useCallback(
    (track: MusicGenTrack, queue: MusicGenTrack[]) => {
      playTrack(track, queue);
    },
    [playTrack]
  );

  const handleRetry = useCallback(() => {
    clearError();
    refreshCatalog();
  }, [clearError, refreshCatalog]);

  const handleMoodSelect = useCallback((mood: MusicGenMood) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMood(prev => (prev === mood ? null : mood));
  }, []);

  // Loading state
  if (isLoading && tracks.length === 0) {
    return (
      <View className="flex-1 bg-[#0A0A0A] items-center justify-center">
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text className="text-white/60 mt-4">Loading VYBE Originals...</Text>
      </View>
    );
  }

  // Error state
  if (error && tracks.length === 0) {
    return (
      <View className="flex-1 bg-[#0A0A0A] items-center justify-center px-8">
        <View className="w-20 h-20 bg-red-500/20 rounded-full items-center justify-center mb-6">
          <AlertCircle size={40} color="#EF4444" />
        </View>
        <Text className="text-white font-bold text-xl text-center mb-2">
          Failed to Load
        </Text>
        <Text className="text-white/60 text-center mb-6">{error}</Text>
        <Pressable
          onPress={handleRetry}
          className="bg-[#8B5CF6] px-6 py-3 rounded-full flex-row items-center"
        >
          <RefreshCw size={18} color="#fff" />
          <Text className="text-white font-semibold ml-2">Try Again</Text>
        </Pressable>
      </View>
    );
  }

  // Empty state
  if (tracks.length === 0) {
    return (
      <View className="flex-1 bg-[#0A0A0A] items-center justify-center px-8">
        <View className="w-20 h-20 bg-[#8B5CF6]/20 rounded-full items-center justify-center mb-6">
          <Music2 size={40} color="#8B5CF6" />
        </View>
        <Text className="text-white font-bold text-xl text-center mb-2">
          No Tracks Available
        </Text>
        <Text className="text-white/60 text-center mb-6">
          VYBE Originals catalog is currently empty. Check back later!
        </Text>
        <Pressable
          onPress={handleRetry}
          className="bg-[#8B5CF6] px-6 py-3 rounded-full flex-row items-center"
        >
          <RefreshCw size={18} color="#fff" />
          <Text className="text-white font-semibold ml-2">Refresh</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      {/* Header */}
      <LinearGradient
        colors={['#1a0a2e', '#0A0A0A']}
        style={{
          paddingTop: insets.top,
          paddingBottom: 20,
        }}
      >
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="w-10 h-10 items-center justify-center rounded-full bg-white/10"
          >
            <ChevronLeft size={24} color="#fff" />
          </Pressable>
          <View className="flex-1 ml-4">
            <View className="flex-row items-center">
              <Sparkles size={20} color="#8B5CF6" />
              <Text className="text-white font-bold text-xl ml-2">VYBE Originals</Text>
            </View>
            <Text className="text-white/60 text-sm">AI-Generated Music</Text>
          </View>
          {isLoading && (
            <ActivityIndicator size="small" color="#8B5CF6" />
          )}
        </View>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Featured Section */}
        {featuredTracks.length > 0 && (
          <View className="mt-4">
            <Text className="text-white font-bold text-lg px-5 mb-4">Featured</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 20, paddingRight: 4 }}
              style={{ flexGrow: 0 }}
            >
              {featuredTracks.map((track, index) => (
                <FeaturedTrackCard
                  key={track.id}
                  track={track}
                  index={index}
                  onPress={() => handlePlayTrack(track, featuredTracks)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Browse by Mood */}
        {moods.length > 0 && (
          <View className="mt-8">
            <Text className="text-white font-bold text-lg px-5 mb-4">Browse by Mood</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 20, paddingRight: 10 }}
              style={{ flexGrow: 0 }}
            >
              {moods.map(mood => (
                <MoodChip
                  key={mood}
                  mood={mood}
                  isSelected={selectedMood === mood}
                  onPress={() => handleMoodSelect(mood)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Track List */}
        <View className="mt-8">
          <View className="flex-row items-center justify-between px-5 mb-2">
            <Text className="text-white font-bold text-lg">
              {selectedMood ? MOOD_CONFIG[selectedMood].label : 'All Tracks'}
            </Text>
            <Text className="text-white/40 text-sm">
              {filteredTracks.length} {filteredTracks.length === 1 ? 'track' : 'tracks'}
            </Text>
          </View>

          {filteredTracks.length === 0 ? (
            <View className="items-center py-12">
              <Text className="text-white/40">No tracks match this mood</Text>
            </View>
          ) : (
            filteredTracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                onPress={() => handlePlayTrack(track, filteredTracks)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}
