import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, Text, Pressable, Dimensions, Linking, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
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
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { WebView } from 'react-native-webview';
import { usePlaybackController } from '@/stores/playbackController';
import { openInSoundCloud } from '@/lib/soundcloudHandoff';
import { formatDuration } from '@/data/mockData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - 80;

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
  const webViewRef = useRef<WebView>(null);

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

  const playScale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const isLiked = currentTrack ? likedTracks.has(currentTrack.id) : false;
  const isYouTube = currentSource === 'youtube';
  const isYouTubeMusic = currentSource === 'youtube_music';
  const isSoundCloud = currentSource === 'soundcloud';
  const isExternalPlayback = isYouTube; // Only YouTube has in-app playback now
  const isExternalOnly = isSoundCloud || isYouTubeMusic; // These open externally

  // YouTube playback state
  const [ytLoadError, setYtLoadError] = useState(false);

  // Reset YouTube error state when track changes
  useEffect(() => {
    if (isYouTube) {
      setYtLoadError(false);
    }
  }, [currentTrack?.id, isYouTube]);

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

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

  const handlePlayPause = () => {
    // SoundCloud and YouTube Music are external-only - open externally instead of playing
    if (isSoundCloud || isYouTubeMusic) {
      handleOpenExternal();
      return;
    }

    if (isYouTube && webViewRef.current) {
      if (isPlaying) {
        webViewRef.current.injectJavaScript('player.pauseVideo(); true;');
      } else {
        webViewRef.current.injectJavaScript('player.playVideo(); true;');
      }
    }
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  const handleSeek = (value: number) => {
    // SoundCloud and YouTube Music are external-only - no seeking
    if (isSoundCloud || isYouTubeMusic) return;

    if (isYouTube && webViewRef.current) {
      webViewRef.current.injectJavaScript(`player.seekTo(${value}, true); true;`);
    }
    seekTo(value);
  };

  const handleSeekForward = () => {
    if (isSoundCloud || isYouTubeMusic) return;
    const newProgress = Math.min(progress + 15, duration);
    handleSeek(newProgress);
  };

  const handleSeekBackward = () => {
    if (isSoundCloud || isYouTubeMusic) return;
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

  const onYouTubeMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'stateChange') {
        if (data.state === 1) {
          setPlaybackState('playing');
        } else if (data.state === 2 || data.state === 0) {
          setPlaybackState('paused');
          if (data.state === 0) {
            next();
          }
        }
      } else if (data.type === 'timeUpdate') {
        setProgress(data.currentTime);
        if (data.duration && data.duration > 0) {
          usePlaybackController.setState({ duration: data.duration });
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, [setPlaybackState, setProgress, next]);

  if (!currentTrack) {
    return (
      <View className="flex-1 bg-[#0A0A0A] items-center justify-center">
        <Text className="text-white/60">No track playing</Text>
      </View>
    );
  }

  // SoundCloud and YouTube Music: show static progress (external only)
  const progressPercent = (isSoundCloud || isYouTubeMusic) ? 0 : (duration > 0 ? (progress / duration) * 100 : 0);

  // YouTube embed HTML with IFrame API
  const youtubeHTML = currentTrack.youtubeId ? `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          width: 100%;
          height: 100%;
          background: #0A0A0A;
          overflow: hidden;
        }
        #player {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
      </style>
    </head>
    <body>
      <div id="player"></div>
      <script>
        var tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

        var player;
        function onYouTubeIframeAPIReady() {
          player = new YT.Player('player', {
            videoId: '${currentTrack.youtubeId}',
            playerVars: {
              'autoplay': 1,
              'playsinline': 1,
              'controls': 0,
              'modestbranding': 1,
              'rel': 0,
              'showinfo': 0,
              'fs': 0,
              'iv_load_policy': 3,
            },
            events: {
              'onReady': onPlayerReady,
              'onStateChange': onPlayerStateChange
            }
          });
        }

        function onPlayerReady(event) {
          event.target.playVideo();
          setInterval(function() {
            if (player && player.getCurrentTime) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'timeUpdate',
                currentTime: player.getCurrentTime(),
                duration: player.getDuration()
              }));
            }
          }, 500);
        }

        function onPlayerStateChange(event) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'stateChange',
            state: event.data
          }));
        }
      </script>
    </body>
    </html>
  ` : '';

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
                  {(isYouTubeMusic || isSoundCloud) ? 'Discovered on' : 'Playing from'}
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
              {isYouTube && currentTrack.youtubeId ? (
                <View
                  style={{
                    width: ARTWORK_SIZE,
                    height: ARTWORK_SIZE,
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: '#000',
                  }}
                >
                  <WebView
                    ref={webViewRef}
                    source={{ html: youtubeHTML }}
                    style={{ flex: 1, backgroundColor: '#000' }}
                    allowsInlineMediaPlayback
                    mediaPlaybackRequiresUserAction={false}
                    onMessage={onYouTubeMessage}
                    scrollEnabled={false}
                    bounces={false}
                    onError={(e) => {
                      console.log('[YouTube] WebView error:', e.nativeEvent);
                      setYtLoadError(true);
                    }}
                  />
                  {/* YouTube Error overlay with fallback */}
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
                      <YouTubeIcon size={48} />
                      <Text className="text-white font-semibold mt-3 text-base">
                        Playback unavailable in VYBE
                      </Text>
                      <Text className="text-white/60 mt-1 text-sm text-center">
                        This video cannot be played within the app
                      </Text>
                      <View className="flex-row mt-6">
                        <Pressable
                          onPress={() => {
                            console.log('[YouTube] User tapped retry');
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setYtLoadError(false);
                            if (webViewRef.current) {
                              webViewRef.current.reload();
                            }
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
                          <Text className="text-white text-sm font-medium ml-2">Open in YouTube</Text>
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
              ) : isYouTubeMusic ? (
                /* YouTube Music - Discovery only, no inline playback */
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
                    <YouTubeMusicIcon size={40} />
                    <Text className="text-white/80 text-sm mt-3 text-center">
                      This track plays on YouTube Music
                    </Text>

                    {/* Primary CTA */}
                    <Pressable
                      onPress={handleOpenExternal}
                      className="flex-row items-center bg-[#FF0000] rounded-full py-3.5 px-6 mt-4"
                    >
                      <ExternalLink size={18} color="#fff" />
                      <Text className="text-white font-semibold ml-2">Open in YouTube Music</Text>
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
                  <Pressable
                    onPress={handleOpenExternal}
                    className="flex-row items-center justify-center bg-white/10 rounded-full py-2.5 px-4 mt-4 self-start"
                  >
                    <ExternalLink size={16} color="#fff" />
                    <Text className="text-white text-sm font-medium ml-2">
                      {isYouTube ? 'Watch on YouTube' : 'Open in SoundCloud'}
                    </Text>
                  </Pressable>
                  {isSoundCloud && (
                    <Text className="text-white/40 text-xs mt-2">
                      Opens SoundCloud search. Availability depends on the creator.
                    </Text>
                  )}
                </View>
              ) : null}

{/* SoundCloud Download removed - not supported in VYBE currently */}

              {/* Progress Bar - static for YouTube Music */}
              <View className="mt-6">
                <Pressable
                  onPress={(e) => {
                    if (isYouTubeMusic) return; // No seeking for YouTube Music
                    const x = e.nativeEvent.locationX;
                    const width = SCREEN_WIDTH - 64;
                    const percent = x / width;
                    handleSeek(Math.floor(percent * duration));
                  }}
                  disabled={isYouTubeMusic}
                >
                  <View className="h-1 bg-white/20 rounded-full overflow-hidden">
                    <View
                      className={`h-full rounded-full ${isYouTubeMusic ? 'bg-white/30' : 'bg-white'}`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </View>
                </Pressable>
                <View className="flex-row justify-between mt-2">
                  <Text className="text-white/40 text-xs">
                    {isYouTubeMusic ? '--:--' : formatDuration(Math.floor(progress))}
                  </Text>
                  <Text className="text-white/40 text-xs">
                    {isYouTubeMusic ? (currentTrack.duration ? formatDuration(currentTrack.duration) : '--:--') : (duration > 0 ? formatDuration(Math.floor(duration)) : '--:--')}
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
                  disabled={isYouTubeMusic}
                >
                  <Shuffle
                    size={24}
                    color={isYouTubeMusic ? 'rgba(255,255,255,0.3)' : (isShuffled ? '#8B5CF6' : '#fff')}
                  />
                </Pressable>

                {isExternalPlayback ? (
                  <Pressable onPress={handleSeekBackward} className="p-3">
                    <RotateCcw size={28} color="#fff" />
                  </Pressable>
                ) : isYouTubeMusic ? (
                  <View className="p-3">
                    <SkipBack size={32} color="rgba(255,255,255,0.3)" />
                  </View>
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
                  <View className={`w-[72px] h-[72px] rounded-full items-center justify-center ${isYouTubeMusic ? 'bg-[#FF0000]' : isError ? 'bg-red-500' : 'bg-white'}`}>
                    {isYouTubeMusic ? (
                      <ExternalLink size={32} color="#fff" />
                    ) : isWorking ? (
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
                ) : isYouTubeMusic ? (
                  <View className="p-3">
                    <SkipForward size={32} color="rgba(255,255,255,0.3)" />
                  </View>
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
                  disabled={isYouTubeMusic}
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 size={24} color={isYouTubeMusic ? 'rgba(255,255,255,0.3)' : '#8B5CF6'} />
                  ) : (
                    <Repeat
                      size={24}
                      color={isYouTubeMusic ? 'rgba(255,255,255,0.3)' : (repeatMode === 'all' ? '#8B5CF6' : '#fff')}
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
