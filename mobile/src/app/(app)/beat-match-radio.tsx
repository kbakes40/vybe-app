import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import Slider from '@react-native-community/slider';
import {
  ChevronLeft,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Radio,
  ThumbsDown,
  RotateCcw,
  Sliders,
} from 'lucide-react-native';
import { useBeatMatchRadioStore, BeatMatchSettings } from '@/stores/beatMatchRadioStore';
import { usePlaybackController } from '@/stores/playbackController';
import { useDiscoveryAlgorithmStore } from '@/stores/discoveryAlgorithmStore';
import { Track } from '@/types/music';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Source badge component
function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    vybe: { bg: 'bg-[#8B5CF6]/20', text: 'text-[#8B5CF6]' },
    soundcloud: { bg: 'bg-[#FF5500]/20', text: 'text-[#FF5500]' },
    youtube_music: { bg: 'bg-[#FF0000]/20', text: 'text-[#FF0000]' },
    youtube: { bg: 'bg-[#FF0000]/20', text: 'text-[#FF0000]' },
  };
  const style = colors[source] || colors.vybe;
  const label = source === 'youtube_music' ? 'YT Music' : source === 'soundcloud' ? 'SoundCloud' : source === 'youtube' ? 'YouTube' : 'VYBE';

  return (
    <View className={`px-2 py-0.5 rounded ${style.bg}`}>
      <Text className={`text-[10px] font-medium ${style.text}`}>{label}</Text>
    </View>
  );
}

// Track row component
function TrackRow({
  track,
  isPlaying,
  onPress,
}: {
  track: Track;
  isPlaying: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center py-3 px-4 ${isPlaying ? 'bg-white/5' : ''}`}
    >
      <Image
        source={{ uri: track.artwork || 'https://via.placeholder.com/48' }}
        style={{ width: 48, height: 48, borderRadius: 6 }}
        contentFit="cover"
      />
      <View className="flex-1 ml-3">
        <Text
          className={`font-medium ${isPlaying ? 'text-[#8B5CF6]' : 'text-white'}`}
          numberOfLines={1}
        >
          {track.title || 'Unknown Track'}
        </Text>
        <Text className="text-white/50 text-sm" numberOfLines={1}>
          {track.artist || 'Unknown Artist'}
        </Text>
      </View>
      <SourceBadge source={track.source || 'vybe'} />
    </Pressable>
  );
}

// Settings panel component
function SettingsPanel({
  settings,
  onUpdateSettings,
  onClose,
}: {
  settings: BeatMatchSettings;
  onUpdateSettings: (settings: Partial<BeatMatchSettings>) => void;
  onClose: () => void;
}) {
  return (
    <View className="bg-[#1A1A1A] rounded-2xl p-5 mx-4 mb-4">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-white font-semibold text-lg">Station Controls</Text>
        <Pressable onPress={onClose} className="p-2 -mr-2">
          <Text className="text-[#8B5CF6] text-sm">Done</Text>
        </Pressable>
      </View>

      {/* Mood Slider */}
      <View className="mb-5">
        <View className="flex-row justify-between mb-2">
          <Text className="text-white/60 text-sm">Mood</Text>
          <Text className="text-white/40 text-xs">
            {settings.moodLevel < 0.33 ? 'Chill' : settings.moodLevel < 0.66 ? 'Balanced' : 'Hype'}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Text className="text-white/30 text-xs w-10">Chill</Text>
          <Slider
            style={{ flex: 1, height: 40 }}
            minimumValue={0}
            maximumValue={1}
            value={settings.moodLevel}
            onValueChange={(value) => onUpdateSettings({ moodLevel: value })}
            minimumTrackTintColor="#8B5CF6"
            maximumTrackTintColor="rgba(255,255,255,0.1)"
            thumbTintColor="#8B5CF6"
          />
          <Text className="text-white/30 text-xs w-10 text-right">Hype</Text>
        </View>
      </View>

      {/* Tempo Slider */}
      <View className="mb-5">
        <View className="flex-row justify-between mb-2">
          <Text className="text-white/60 text-sm">Tempo</Text>
          <Text className="text-white/40 text-xs">
            {settings.tempoLevel < 0.33 ? 'Slow' : settings.tempoLevel < 0.66 ? 'Mid' : 'Fast'}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Text className="text-white/30 text-xs w-10">Slow</Text>
          <Slider
            style={{ flex: 1, height: 40 }}
            minimumValue={0}
            maximumValue={1}
            value={settings.tempoLevel}
            onValueChange={(value) => onUpdateSettings({ tempoLevel: value })}
            minimumTrackTintColor="#8B5CF6"
            maximumTrackTintColor="rgba(255,255,255,0.1)"
            thumbTintColor="#8B5CF6"
          />
          <Text className="text-white/30 text-xs w-10 text-right">Fast</Text>
        </View>
      </View>

      {/* Discovery Slider */}
      <View>
        <View className="flex-row justify-between mb-2">
          <Text className="text-white/60 text-sm">Discovery</Text>
          <Text className="text-white/40 text-xs">
            {settings.discoveryLevel < 0.33 ? 'Safe' : settings.discoveryLevel < 0.66 ? 'Mixed' : 'Adventurous'}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Text className="text-white/30 text-xs w-10">Safe</Text>
          <Slider
            style={{ flex: 1, height: 40 }}
            minimumValue={0}
            maximumValue={1}
            value={settings.discoveryLevel}
            onValueChange={(value) => onUpdateSettings({ discoveryLevel: value })}
            minimumTrackTintColor="#8B5CF6"
            maximumTrackTintColor="rgba(255,255,255,0.1)"
            thumbTintColor="#8B5CF6"
          />
          <Text className="text-white/30 text-xs w-10 text-right">New</Text>
        </View>
      </View>
    </View>
  );
}

export default function BeatMatchRadioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showSettings, setShowSettings] = useState(false);

  const queue = useBeatMatchRadioStore(s => s.queue);
  const queuePosition = useBeatMatchRadioStore(s => s.queuePosition);
  const seedTracks = useBeatMatchRadioStore(s => s.seedTracks);
  const settings = useBeatMatchRadioStore(s => s.settings);
  const isLoading = useBeatMatchRadioStore(s => s.isLoading);
  const startRadio = useBeatMatchRadioStore(s => s.startRadio);
  const skipTrack = useBeatMatchRadioStore(s => s.skipTrack);
  const previousTrack = useBeatMatchRadioStore(s => s.previousTrack);
  const updateSettings = useBeatMatchRadioStore(s => s.updateSettings);
  const resetStation = useBeatMatchRadioStore(s => s.resetStation);
  const generateMoreTracks = useBeatMatchRadioStore(s => s.generateMoreTracks);
  const setQueuePosition = useBeatMatchRadioStore(s => s.setQueuePosition);

  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playbackState = usePlaybackController(s => s.playbackState);
  const pause = usePlaybackController(s => s.pause);
  const play = usePlaybackController(s => s.play);

  const dislikeTrack = useDiscoveryAlgorithmStore(s => s.dislikeTrack);

  const isPlaying = playbackState === 'playing';
  const nowPlayingTrack = queue[queuePosition];
  const upNextTracks = queue.slice(queuePosition + 1, queuePosition + 11);

  // Start radio on mount if queue is empty
  useEffect(() => {
    if (queue.length === 0) {
      startRadio();
    }
  }, [queue.length, startRadio]);

  // Play current track when queue position changes
  useEffect(() => {
    if (nowPlayingTrack && nowPlayingTrack.id !== currentTrack?.id) {
      playTrack(nowPlayingTrack, queue.slice(queuePosition));
    }
  }, [queuePosition, nowPlayingTrack?.id, currentTrack?.id, playTrack, queue]);

  // Generate more tracks when nearing end
  useEffect(() => {
    if (queue.length > 0 && queue.length - queuePosition < 15) {
      generateMoreTracks();
    }
  }, [queuePosition, queue.length, generateMoreTracks]);

  const handlePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skipTrack();
  }, [skipTrack]);

  const handlePrevious = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    previousTrack();
  }, [previousTrack]);

  const handleDislike = useCallback(() => {
    if (nowPlayingTrack) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      dislikeTrack(nowPlayingTrack.id);
      skipTrack();
    }
  }, [nowPlayingTrack, dislikeTrack, skipTrack]);

  const handleReset = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    resetStation();
    startRadio();
  }, [resetStation, startRadio]);

  const playScale = useSharedValue(1);
  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <LinearGradient
        colors={['#1a1a2e', '#0A0A0A']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 300 }}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ paddingTop: insets.top }} className="px-4 pb-4">
          <View className="flex-row items-center justify-between py-4">
            <Pressable onPress={() => router.back()} className="p-2 -ml-2">
              <ChevronLeft size={28} color="#fff" />
            </Pressable>
            <View className="flex-row items-center">
              <Radio size={20} color="#8B5CF6" />
              <Text className="text-white font-semibold text-lg ml-2">Beat Match Radio</Text>
            </View>
            <Pressable
              onPress={() => setShowSettings(!showSettings)}
              className="p-2 -mr-2"
            >
              <Sliders size={22} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Settings Panel */}
        {showSettings ? (
          <SettingsPanel
            settings={settings}
            onUpdateSettings={updateSettings}
            onClose={() => setShowSettings(false)}
          />
        ) : null}

        {/* Loading State */}
        {isLoading && queue.length === 0 ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#8B5CF6" />
            <Text className="text-white/60 mt-4">Generating your station...</Text>
          </View>
        ) : (
          <>
            {/* Now Playing Card */}
            {nowPlayingTrack ? (
              <View className="mx-4 mb-6">
                <View className="bg-[#1A1A1A] rounded-2xl overflow-hidden">
                  <Image
                    source={{ uri: nowPlayingTrack.artwork || 'https://via.placeholder.com/300' }}
                    style={{ width: '100%', aspectRatio: 1 }}
                    contentFit="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(26,26,26,0.9)', '#1A1A1A']}
                    style={{
                      position: 'absolute',
                      bottom: 80,
                      left: 0,
                      right: 0,
                      height: 150,
                      justifyContent: 'flex-end',
                      padding: 20,
                    }}
                  >
                    <Text className="text-white text-2xl font-bold" numberOfLines={1}>
                      {nowPlayingTrack.title || 'Unknown Track'}
                    </Text>
                    <Text className="text-white/60 text-base mt-1" numberOfLines={1}>
                      {nowPlayingTrack.artist || 'Unknown Artist'}
                    </Text>
                    <View className="flex-row items-center mt-2">
                      <SourceBadge source={nowPlayingTrack.source || 'vybe'} />
                    </View>
                  </LinearGradient>

                  {/* Controls */}
                  <View className="flex-row items-center justify-center py-4 px-6">
                    <Pressable onPress={handleDislike} className="p-3">
                      <ThumbsDown size={22} color="rgba(255,255,255,0.6)" />
                    </Pressable>
                    <Pressable onPress={handlePrevious} className="p-3 mx-4">
                      <SkipBack size={28} color="#fff" fill="#fff" />
                    </Pressable>
                    <AnimatedPressable
                      onPress={handlePlayPause}
                      onPressIn={() => { playScale.value = withSpring(0.9); }}
                      onPressOut={() => { playScale.value = withSpring(1); }}
                      style={playButtonStyle}
                      className="w-16 h-16 bg-[#8B5CF6] rounded-full items-center justify-center mx-2"
                    >
                      {isPlaying ? (
                        <Pause size={28} color="#fff" fill="#fff" />
                      ) : (
                        <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
                      )}
                    </AnimatedPressable>
                    <Pressable onPress={handleSkip} className="p-3 mx-4">
                      <SkipForward size={28} color="#fff" fill="#fff" />
                    </Pressable>
                    <Pressable onPress={handleReset} className="p-3">
                      <RotateCcw size={22} color="rgba(255,255,255,0.6)" />
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Because you liked */}
            {seedTracks.length > 0 ? (
              <View className="mb-6">
                <Text className="text-white/40 text-xs uppercase tracking-wider px-4 mb-3">
                  Because you liked
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16 }}
                  style={{ flexGrow: 0 }}
                >
                  {seedTracks.map(track => (
                    <View key={track.id} className="mr-3 items-center">
                      <Image
                        source={{ uri: track.artwork || 'https://via.placeholder.com/60' }}
                        style={{ width: 60, height: 60, borderRadius: 6 }}
                        contentFit="cover"
                      />
                      <Text className="text-white/60 text-xs mt-1 w-[60px]" numberOfLines={1}>
                        {track.title}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Up Next */}
            {upNextTracks.length > 0 ? (
              <View>
                <Text className="text-white font-semibold text-lg px-4 mb-3">Up Next</Text>
                {upNextTracks.map((track, index) => (
                  <TrackRow
                    key={`${track.id}-${index}`}
                    track={track}
                    isPlaying={false}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      // Skip to this track
                      const newPosition = queuePosition + 1 + index;
                      setQueuePosition(newPosition);
                    }}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
