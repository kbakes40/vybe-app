import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, Text, Pressable, Dimensions, Linking, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  ListMusic,
  Share2,
  ChevronDown,
  ExternalLink,
  RotateCcw,
  RotateCw,
  Cloud,
  RefreshCw,
  Plus,
  Download,
  Check,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import YoutubePlayer from 'react-native-youtube-iframe';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { openInSoundCloud } from '@/lib/soundcloudHandoff';
import { formatDuration } from '@/data/mockData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - 80;
const VIDEO_WIDTH = ARTWORK_SIZE;
const VIDEO_HEIGHT = Math.round((ARTWORK_SIZE * 9) / 16);

const normalizePlaybackSeconds = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  // Some sources report ms-like values; convert to seconds for UI/store consistency.
  return value > 100000 ? value / 1000 : value;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// YouTube icon component
function YouTubeIcon({ size = 16 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: '#FF0000',
        borderRadius: 4,
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
          marginLeft: 2,
        }}
      />
    </View>
  );
}

// SoundCloud icon component
function SoundCloudIcon({ size = 16 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: '#FF5500',
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Cloud size={size * 0.7} color="#fff" strokeWidth={3} />
    </View>
  );
}

// YouTube Music icon component (circular with play icon)
function YouTubeMusicIcon({ size = 16 }: { size?: number }) {
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

export default function NowPlayingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const youtubePlayerRef = useRef<any>(null);

  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playbackState = usePlaybackController(s => s.playbackState);
  const isPlaying = playbackState === 'playing';
  const isLoading = playbackState === 'loading';
  const isBuffering = playbackState === 'buffering';
  const isError = playbackState === 'error';
  const progress = usePlaybackController(s => s.progress);
  const duration = usePlaybackController(s => s.duration);
  const error = usePlaybackController(s => s.error);
  const isShuffled = usePlaybackController(s => s.isShuffled);
  const repeatMode = usePlaybackController(s => s.repeatMode);
  const likedTracks = usePlaybackController(s => s.likedTracks);
  const currentSource = usePlaybackController(s => s.currentSource);

  // Determine if we're in a "working" state (loading or buffering)
  const isWorking = isLoading || isBuffering;

  const pause = usePlaybackController(s => s.pause);
  const play = usePlaybackController(s => s.play);
  const next = usePlaybackController(s => s.next);
  const previous = usePlaybackController(s => s.previous);
  const seekTo = usePlaybackController(s => s.seekTo);
  const setProgress = usePlaybackController(s => s.setProgress);
  const setPlaybackState = usePlaybackController(s => s.setPlaybackState);
  const toggleShuffle = usePlaybackController(s => s.toggleShuffle);
  const toggleRepeat = usePlaybackController(s => s.toggleRepeat);
  const toggleLike = usePlaybackController(s => s.toggleLike);
  const addDownload = useDownloadsStore(s => s.addDownload);
  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);

  const playScale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const isLiked = currentTrack ? likedTracks.has(currentTrack.id) : false;
  const isYouTube = currentSource === 'youtube';
  const isYouTubeMusic = currentSource === 'youtube_music';
  const isSoundCloud = currentSource === 'soundcloud';
  const isExternalPlayback = isYouTube || isYouTubeMusic;
  const isExternalOnly = isSoundCloud;
  const ytVideoId = currentTrack?.youtubeId || currentTrack?.youtubeMusicId || null;

  // YouTube playback state
  const [ytLoadError, setYtLoadError] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Reset YouTube error state when track changes
  useEffect(() => {
    if (isYouTube || isYouTubeMusic) {
      setYtLoadError(false);
    }
  }, [currentTrack?.id, isYouTube, isYouTubeMusic]);

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));
  const isDownloaded = currentTrack ? isTrackDownloaded(currentTrack.id) : false;

  // Keep progress and duration synced to the actual embedded YouTube player.
  // This fills gaps when onProgress events are sparse on some videos/devices.
  useEffect(() => {
    if (!(isYouTube || isYouTubeMusic) || !ytVideoId || !youtubePlayerRef.current) {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const player = youtubePlayerRef.current;
        if (!player) return;

        const [currentTime, currentDuration] = await Promise.all([
          player.getCurrentTime?.(),
          player.getDuration?.(),
        ]);

        if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
          setProgress(normalizePlaybackSeconds(currentTime));
        }

        if (
          typeof currentDuration === 'number' &&
          Number.isFinite(currentDuration) &&
          currentDuration > 0 &&
          normalizePlaybackSeconds(currentDuration) !== duration
        ) {
          usePlaybackController.setState({ duration: normalizePlaybackSeconds(currentDuration) });
        }
      } catch {
        // Ignore transient bridge errors while the player initializes.
      }
    }, 500);

    return () => clearInterval(intervalId);
  }, [isYouTube, isYouTubeMusic, ytVideoId, duration, setProgress]);

  const handleClose = () => {
    // Light haptic when collapsing full player back to mini player
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 100) {
        runOnJS(handleClose)();
      } else {
        translateY.value = withSpring(0);
      }
    });

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: interpolate(translateY.value, [0, 300], [1, 0.5]),
  }));

  const handlePlayPause = async () => {
    // SoundCloud is external-only - open externally instead of playing
    if (isSoundCloud) {
      handleOpenExternal();
      return;
    }

    // For embedded YouTube players, keep store state in lockstep so the
    // `play` prop immediately controls the iframe player.
    if (isYouTube || isYouTubeMusic) {
      if (isPlaying) {
        setPlaybackState('paused');
        await pause();
      } else {
        setPlaybackState('playing');
        await play();
      }
      return;
    }

    if (isPlaying) {
      await pause();
    } else {
      await play();
    }
  };

  const handleSeek = (value: number) => {
    // SoundCloud and YouTube Music are external-only - no seeking
    if (isSoundCloud) return;

    if ((isYouTube || isYouTubeMusic) && youtubePlayerRef.current) {
      youtubePlayerRef.current.seekTo(value);
    }
    seekTo(value);
  };

  const handleSeekForward = () => {
    if (isSoundCloud) return;
    const newProgress = Math.min(progress + 15, duration);
    handleSeek(newProgress);
  };

  const handleSeekBackward = () => {
    if (isSoundCloud) return;
    const newProgress = Math.max(progress - 15, 0);
    handleSeek(newProgress);
  };

  const handleOpenExternal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isYouTube && currentTrack?.youtubeId) {
      Linking.openURL(`https://www.youtube.com/watch?v=${currentTrack.youtubeId}`);
    } else if (isYouTubeMusic && currentTrack?.youtubeMusicUrl) {
      Linking.openURL(currentTrack.youtubeMusicUrl);
    } else if (isSoundCloud && currentTrack) {
      // Use search handoff for SoundCloud - opens search with artist + title
      openInSoundCloud(currentTrack);
    }
  }, [isYouTube, isYouTubeMusic, isSoundCloud, currentTrack]);

  const handleDownloadTrack = useCallback(async () => {
    if (!currentTrack || !ytVideoId || isDownloading || isDownloaded) return;

    const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
    if (!baseUrl) {
      usePlaybackController.setState({ error: 'Missing EXPO_PUBLIC_BACKEND_URL' });
      setPlaybackState('error');
      return;
    }

    try {
      setIsDownloading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const downloadDir = `${FileSystem.documentDirectory}downloads`;
      const dirInfo = await FileSystem.getInfoAsync(downloadDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(downloadDir, { intermediates: true });
      }

      const targetUri = `${downloadDir}/${currentTrack.id}.mp4`;
      const response = await FileSystem.downloadAsync(
        `${baseUrl}/api/youtube/audio/${ytVideoId}`,
        targetUri
      );

      if (response.status !== 200) {
        throw new Error(`Download failed with status ${response.status}`);
      }

      const fileInfo = await FileSystem.getInfoAsync(response.uri, { size: true });
      addDownload({
        ...currentTrack,
        source: 'vybe',
        audioUrl: response.uri,
        localFilePath: response.uri,
        isDownloaded: true,
        importedAt: Date.now(),
        isUserImported: false,
        fileSize: fileInfo.exists ? (fileInfo.size ?? 0) : 0,
        fileFormat: 'MP4',
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (downloadError) {
      console.error('[NowPlaying] Download failed:', downloadError);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      usePlaybackController.setState({ error: 'Failed to download track audio' });
      setPlaybackState('error');
    } finally {
      setIsDownloading(false);
    }
  }, [
    currentTrack,
    ytVideoId,
    isDownloading,
    isDownloaded,
    addDownload,
    setPlaybackState,
  ]);



  if (!currentTrack) {
    return (
      <View className="flex-1 bg-[#0A0A0A] items-center justify-center">
        <Text className="text-white/60">No track playing</Text>
      </View>
    );
  }

  // SoundCloud: show static progress (external only)
  const displayProgress = normalizePlaybackSeconds(progress);
  const displayDuration = normalizePlaybackSeconds(duration);
  const progressPercent = isSoundCloud
    ? 0
    : displayDuration > 0
      ? (displayProgress / displayDuration) * 100
      : 0;




  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[{ flex: 1 }, containerStyle]}>
        <LinearGradient
          colors={isSoundCloud ? ['#1a1510', '#0A0A0A', '#0A0A0A'] : isYouTubeMusic ? ['#1a0a0a', '#0A0A0A', '#0A0A0A'] : ['#1a1a2e', '#0A0A0A', '#0A0A0A']}
          style={{ flex: 1 }}
        >
          <View style={{ flex: 1, paddingTop: insets.top }}>
            {/* Header */}
            <View className="flex-row items-center justify-between px-6 py-4">
              <Pressable onPress={handleClose} className="p-2 -ml-2">
                <ChevronDown size={28} color="#fff" />
              </Pressable>
              <View className="items-center">
                <Text className="text-white/60 text-xs uppercase tracking-wider">
                  {isSoundCloud ? 'Discovered on' : 'Playing from'}
                </Text>
                <View className="flex-row items-center mt-1">
                  {isYouTube ? (
                    <>
                      <YouTubeIcon size={14} />
                      <Text className="text-white font-semibold text-sm ml-1.5">
                        YouTube
                      </Text>
                    </>
                  ) : isYouTubeMusic ? (
                    <>
                      <YouTubeMusicIcon size={14} />
                      <Text className="text-white font-semibold text-sm ml-1.5">
                        YouTube Music
                      </Text>
                    </>
                  ) : isSoundCloud ? (
                    <>
                      <SoundCloudIcon size={14} />
                      <Text className="text-white font-semibold text-sm ml-1.5">
                        SoundCloud
                      </Text>
                    </>
                  ) : (
                    <Text className="text-white font-semibold text-sm">
                      {currentTrack.album}
                    </Text>
                  )}
                </View>
              </View>
              <View className="w-10" />
            </View>

            {/* Artwork / Video / Embed */}
            <View className="items-center justify-center flex-1 px-10">
              {isExternalPlayback && ytVideoId ? (
                <View
                  style={{
                    width: ARTWORK_SIZE,
                    height: VIDEO_HEIGHT,
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: '#000',
                  }}
                >
                  <View
                    style={{
                      width: VIDEO_WIDTH,
                      height: VIDEO_HEIGHT,
                      backgroundColor: '#000',
                    }}
                  >
                    <YoutubePlayer
                      ref={youtubePlayerRef}
                      height={VIDEO_HEIGHT}
                      width={VIDEO_WIDTH}
                      videoId={ytVideoId}
                      play={isPlaying}
                      onChangeState={(state: string) => {
                        if (state === 'ended') {
                          setPlaybackState('paused');
                        } else if (state === 'playing') {
                          setPlaybackState('playing');
                        } else if (state === 'paused') {
                          setPlaybackState('paused');
                        } else if (state === 'buffering') {
                          setPlaybackState('buffering');
                        }
                      }}
                      onProgress={(progress: { currentTime: number; duration: number }) => {
                        setProgress(normalizePlaybackSeconds(progress.currentTime));
                        if (progress.duration && progress.duration > 0) {
                          usePlaybackController.setState({
                            duration: normalizePlaybackSeconds(progress.duration),
                          });
                        }
                      }}
                      onError={(error: any) => {
                        console.log('[YouTube] Player error:', error);
                        setYtLoadError(true);
                        setPlaybackState('error');
                      }}
                      onReady={() => {
                        setYtLoadError(false);
                      }}
                    />
                  </View>
                  {/* YouTube / YouTube Music error overlay */}
                  {ytLoadError && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.95)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 24,
                      }}
                    >
                      {isYouTubeMusic ? <YouTubeMusicIcon size={48} /> : <YouTubeIcon size={48} />}
                      <Text className="text-white font-semibold mt-3 text-base">
                        Playback unavailable in VYBE
                      </Text>
                      <Text className="text-white/60 mt-1 text-sm text-center">
                        This video cannot be played within the app
                      </Text>
                      <View className="flex-row mt-6">
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setYtLoadError(false);
                          }}
                          className="flex-row items-center bg-white/10 rounded-full py-3 px-5 mr-3"
                        >
                          <RefreshCw size={16} color="#fff" />
                          <Text className="text-white text-sm font-medium ml-2">Retry</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            handleOpenExternal();
                          }}
                          className="flex-row items-center bg-[#FF0000] rounded-full py-3 px-5"
                        >
                          <ExternalLink size={16} color="#fff" />
                          <Text className="text-white text-sm font-medium ml-2">
                            {isYouTubeMusic ? 'Open in YouTube Music' : 'Open in YouTube'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </View>
              ) : isSoundCloud ? (
                /* SoundCloud - Search handoff only, no inline playback */
                <View
                  style={{
                    width: ARTWORK_SIZE,
                    height: ARTWORK_SIZE,
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: '#0A0A0A',
                  }}
                >
                  {/* Album artwork with overlay */}
                  <Image
                    source={{ uri: currentTrack.artwork }}
                    style={{
                      width: ARTWORK_SIZE,
                      height: ARTWORK_SIZE,
                    }}
                    contentFit="cover"
                  />
                  {/* Branded overlay */}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: ARTWORK_SIZE * 0.6,
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      paddingBottom: 24,
                      paddingHorizontal: 20,
                    }}
                  >
                    <Cloud size={40} color="#FF5500" />
                    <Text className="text-white/80 text-sm mt-3 text-center">
                      SoundCloud playback happens in the SoundCloud app
                    </Text>

                    {/* Primary CTA */}
                    <Pressable
                      onPress={handleOpenExternal}
                      className="flex-row items-center bg-[#FF5500] rounded-full py-3.5 px-6 mt-4"
                    >
                      <ExternalLink size={18} color="#fff" />
                      <Text className="text-white font-semibold ml-2">Open in SoundCloud</Text>
                    </Pressable>

                    {/* Secondary CTA */}
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        toggleLike(currentTrack.id);
                      }}
                      className="flex-row items-center bg-white/10 rounded-full py-3 px-5 mt-3"
                    >
                      <Plus size={16} color="#fff" />
                      <Text className="text-white text-sm font-medium ml-2">Add to VYBE Library</Text>
                    </Pressable>
                  </LinearGradient>
                </View>
              ) : (
                <Animated.View
                  style={{
                    shadowColor: '#8B5CF6',
                    shadowOffset: { width: 0, height: 20 },
                    shadowOpacity: 0.5,
                    shadowRadius: 40,
                    elevation: 20,
                  }}
                >
                  <Image
                    source={{ uri: currentTrack.artwork }}
                    style={{
                      width: ARTWORK_SIZE,
                      height: ARTWORK_SIZE,
                      borderRadius: 12,
                    }}
                    contentFit="cover"
                  />
                </Animated.View>
              )}
            </View>

            {/* Track Info */}
            <View className="px-8 mt-8">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-4">
                  <Text className="text-white text-2xl font-bold" numberOfLines={1}>
                    {currentTrack.title}
                  </Text>
                  <Text className="text-white/60 text-lg mt-1" numberOfLines={1}>
                    {currentTrack.artist}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    toggleLike(currentTrack.id);
                  }}
                  className="p-2"
                >
                  <Heart
                    size={28}
                    color={isLiked ? '#8B5CF6' : '#fff'}
                    fill={isLiked ? '#8B5CF6' : 'transparent'}
                  />
                </Pressable>
              </View>

              {/* Open in external app button - not shown for YouTube Music (CTA is on artwork) */}
              {isExternalPlayback ? (
                <View>
                  <View className="flex-row items-center mt-4">
                    <Pressable
                      onPress={handleOpenExternal}
                      className="flex-row items-center justify-center bg-white/10 rounded-full py-2.5 px-4 mr-3"
                    >
                      <ExternalLink size={16} color="#fff" />
                      <Text className="text-white text-sm font-medium ml-2">
                        {isYouTubeMusic ? 'Watch on YouTube Music' : 'Watch on YouTube'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleDownloadTrack}
                      disabled={isDownloading || isDownloaded}
                      className="flex-row items-center justify-center bg-white/10 rounded-full py-2.5 px-4"
                    >
                      {isDownloading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : isDownloaded ? (
                        <Check size={16} color="#22C55E" />
                      ) : (
                        <Download size={16} color="#fff" />
                      )}
                      <Text className="text-white text-sm font-medium ml-2">
                        {isDownloading ? 'Downloading...' : isDownloaded ? 'Downloaded' : 'Download'}
                      </Text>
                    </Pressable>
                  </View>
                  {isSoundCloud && (
                    <Text className="text-white/40 text-xs mt-2">
                      Opens SoundCloud search. Availability depends on the creator.
                    </Text>
                  )}
                </View>
              ) : null}

{/* SoundCloud Download removed - not supported in VYBE currently */}

              {/* Progress Bar - static for SoundCloud */}
              <View className="mt-6">
                <Pressable
                  onPress={(e) => {
                    if (isSoundCloud) return; // No seeking for SoundCloud
                    const x = e.nativeEvent.locationX;
                    const width = SCREEN_WIDTH - 64;
                    const percent = x / width;
                    handleSeek(Math.floor(percent * displayDuration));
                  }}
                  disabled={isSoundCloud}
                >
                  <View className="h-1 bg-white/20 rounded-full overflow-hidden">
                    <View
                      className={`h-full rounded-full ${isSoundCloud ? 'bg-white/30' : 'bg-white'}`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </View>
                </Pressable>
                <View className="flex-row justify-between mt-2">
                  <Text className="text-white/40 text-xs">
                    {isSoundCloud ? '--:--' : formatDuration(Math.floor(displayProgress))}
                  </Text>
                  <Text className="text-white/40 text-xs">
                    {isSoundCloud
                      ? currentTrack.duration
                        ? formatDuration(currentTrack.duration)
                        : '--:--'
                      : displayDuration > 0
                        ? formatDuration(Math.floor(displayDuration))
                        : '--:--'}
                  </Text>
                </View>
              </View>

              {/* Controls */}
              <View className="flex-row items-center justify-between mt-4">
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    toggleShuffle();
                  }}
                  className="p-3"
                >
                  <Shuffle
                    size={24}
                    color={isShuffled ? '#8B5CF6' : '#fff'}
                  />
                </Pressable>

                {isExternalPlayback ? (
                  <Pressable onPress={handleSeekBackward} className="p-3">
                    <RotateCcw size={28} color="#fff" />
                  </Pressable>
                ) : (
                  <Pressable onPress={previous} className="p-3">
                    <SkipBack size={32} color="#fff" fill="#fff" />
                  </Pressable>
                )}

                <AnimatedPressable
                  onPress={handlePlayPause}
                  onPressIn={() => {
                    playScale.value = withSpring(0.9);
                  }}
                  onPressOut={() => {
                    playScale.value = withSpring(1);
                  }}
                  style={playButtonStyle}
                  className="w-18 h-18 bg-white rounded-full items-center justify-center"
                  disabled={isWorking}
                >
                  <View className={`w-[72px] h-[72px] rounded-full items-center justify-center ${isError ? 'bg-red-500' : 'bg-white'}`}>
                    {isWorking ? (
                      <ActivityIndicator size="large" color="#0A0A0A" />
                    ) : isPlaying ? (
                      <Pause size={36} color="#0A0A0A" fill="#0A0A0A" />
                    ) : (
                      <Play size={36} color={isError ? "#fff" : "#0A0A0A"} fill={isError ? "#fff" : "#0A0A0A"} style={{ marginLeft: 4 }} />
                    )}
                  </View>
                </AnimatedPressable>

                {isExternalPlayback ? (
                  <Pressable onPress={handleSeekForward} className="p-3">
                    <RotateCw size={28} color="#fff" />
                  </Pressable>
                ) : (
                  <Pressable onPress={next} className="p-3">
                    <SkipForward size={32} color="#fff" fill="#fff" />
                  </Pressable>
                )}

                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    toggleRepeat();
                  }}
                  className="p-3"
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 size={24} color='#8B5CF6' />
                  ) : (
                    <Repeat
                      size={24}
                      color={repeatMode === 'all' ? '#8B5CF6' : '#fff'}
                    />
                  )}
                </Pressable>
              </View>

              {/* Bottom Actions */}
              <View
                className="flex-row items-center justify-between mt-6"
                style={{ paddingBottom: Math.max(insets.bottom + 24, 88) }}
              >
                <Pressable className="p-3">
                  <ListMusic size={24} color="#fff" />
                </Pressable>
                <Pressable className="p-3">
                  <Share2 size={24} color="#fff" />
                </Pressable>
              </View>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
    </GestureDetector>
  );
}
