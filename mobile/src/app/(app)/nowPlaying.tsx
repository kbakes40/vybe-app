import React, { useCallback, useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, Dimensions, Linking, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
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
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore, downloadYouTubeTrack, downloadSoundCloudTrack } from '@/stores/downloadsStore';
import { openInSoundCloud } from '@/lib/soundcloudHandoff';
import { formatDuration } from '@/data/mockData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - 80;
const VIDEO_HEIGHT = Math.round(ARTWORK_SIZE * (9 / 16));

const normalizePlaybackSeconds = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  // Some sources report ms-like values; convert to seconds for UI/store consistency.
  return value > 100000 ? value / 1000 : value;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── YouTube Inline Video Player ─────────────────────────────────────────────

function buildYouTubeHTML(videoId: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;background:#000;overflow:hidden}
    #player,iframe{width:100%!important;height:100%!important;border:none}
  </style>
</head>
<body>
  <div id="player"></div>
  <script>
  (function(){
    var player=null,ready=false;
    var QUALITY=['hd1080','hd720','large','medium'];
    function applyQuality(){
      try{
        var avail=player.getAvailableQualityLevels();
        for(var i=0;i<QUALITY.length;i++){
          if(avail.indexOf(QUALITY[i])!==-1){player.setPlaybackQuality(QUALITY[i]);return;}
        }
      }catch(e){}
    }
    function onReady(){
      ready=true;
      applyQuality();
      try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}))}catch(e){}
    }
    function onStateChange(e){
      var map={'-1':'idle','0':'ended','1':'playing','2':'paused','3':'buffering','5':'idle'};
      try{window.ReactNativeWebView.postMessage(JSON.stringify({
        type:'stateChange',state:e.data,playbackState:map[e.data.toString()]||'idle'
      }))}catch(e){}
    }
    function init(){
      player=new YT.Player('player',{
        videoId:'${videoId}',
        playerVars:{autoplay:0,controls:0,mute:0,playsinline:1,
          vq:'hd1080',rel:0,modestbranding:1,iv_load_policy:3,origin:'https://vybe.app'},
        events:{onReady:onReady,onStateChange:onStateChange}
      });
    }
    if(window.YT&&window.YT.Player){init();}
    else{
      window.onYouTubeIframeAPIReady=init;
      var s=document.createElement('script');
      s.src='https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
    window.playVideo=function(){if(player&&ready)try{applyQuality();player.playVideo()}catch(e){}};
    window.pauseVideo=function(){if(player&&ready)try{player.pauseVideo()}catch(e){}};
    window.seekTo=function(s){if(player&&ready)try{player.seekTo(s,true)}catch(e){}};
  })();
  </script>
</body>
</html>`;
}

interface YouTubeInlinePlayerProps {
  videoId: string;
  isPlaying: boolean;
}

function YouTubeInlinePlayer({ videoId, isPlaying }: YouTubeInlinePlayerProps) {
  const webViewRef = useRef<WebView>(null);
  const isReadyRef = useRef(false);

  useEffect(() => {
    if (!isReadyRef.current) return;
    const js = isPlaying
      ? 'window.playVideo&&window.playVideo();true;'
      : 'window.pauseVideo&&window.pauseVideo();true;';
    webViewRef.current?.injectJavaScript(js);
  }, [isPlaying]);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'ready') {
        isReadyRef.current = true;
        if (isPlaying) {
          webViewRef.current?.injectJavaScript('window.playVideo&&window.playVideo();true;');
        }
      }
    } catch (_) {}
  }, [isPlaying]);

  return (
    <WebView
      key={videoId}
      ref={webViewRef}
      source={{ html: buildYouTubeHTML(videoId) }}
      style={{ width: ARTWORK_SIZE, height: VIDEO_HEIGHT }}
      allowsInlineMediaPlayback
      allowsFullscreenVideo
      mediaPlaybackRequiresUserAction={false}
      scrollEnabled={false}
      onMessage={handleMessage}
      originWhitelist={['*']}
    />
  );
}

// ─── Source icon components ───────────────────────────────────────────────────

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

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function NowPlayingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playbackState = usePlaybackController(s => s.playbackState);
  const isPlaying = playbackState === 'playing';
  const shouldPause = playbackState === 'playing' || playbackState === 'buffering' || playbackState === 'loading';
  const isLoading = playbackState === 'loading';
  const isError = playbackState === 'error';
  const progress = usePlaybackController(s => s.progress);
  const duration = usePlaybackController(s => s.duration);
  const error = usePlaybackController(s => s.error);
  const isShuffled = usePlaybackController(s => s.isShuffled);
  const repeatMode = usePlaybackController(s => s.repeatMode);
  const likedTracks = usePlaybackController(s => s.likedTracks);
  const currentSource = usePlaybackController(s => s.currentSource);

  const isPlayButtonBusy = isLoading;

  const pause = usePlaybackController(s => s.pause);
  const play = usePlaybackController(s => s.play);
  const next = usePlaybackController(s => s.next);
  const previous = usePlaybackController(s => s.previous);
  const seekTo = usePlaybackController(s => s.seekTo);
  const setProgress = usePlaybackController(s => s.setProgress);
  const toggleShuffle = usePlaybackController(s => s.toggleShuffle);
  const toggleRepeat = usePlaybackController(s => s.toggleRepeat);
  const toggleLike = usePlaybackController(s => s.toggleLike);

  const playScale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const isLiked = currentTrack ? likedTracks.has(currentTrack.id) : false;
  const isYouTube = currentSource === 'youtube';
  const isYouTubeMusic = currentSource === 'youtube_music';
  const isSoundCloud = currentSource === 'soundcloud';
  const isExternalPlayback = isYouTube || isYouTubeMusic || isSoundCloud;
  const ytVideoId = currentTrack?.youtubeId || currentTrack?.youtubeMusicId || null;
  const scTrackUrl = currentTrack?.soundcloudUrl || null;

  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);
  const isDownloaded = currentTrack ? isTrackDownloaded(currentTrack.id) : false;
  const [isDownloadPending, setIsDownloadPending] = useState(false);

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  const handleClose = () => {
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
    if (__DEV__) {
      console.log('[NowPlaying] center button', { willPause: shouldPause, source: currentSource, playbackState });
    }
    if (shouldPause) {
      await pause();
    } else {
      await play();
    }
  };

  const handleSeek = (value: number) => {
    seekTo(value);
  };

  const handleSeekForward = () => {
    handleSeek(Math.min(progress + 15, duration));
  };

  const handleSeekBackward = () => {
    handleSeek(Math.max(progress - 15, 0));
  };

  const handleOpenExternal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isYouTube && currentTrack?.youtubeId) {
      Linking.openURL(`https://www.youtube.com/watch?v=${currentTrack.youtubeId}`);
    } else if (isYouTubeMusic && currentTrack?.youtubeMusicUrl) {
      Linking.openURL(currentTrack.youtubeMusicUrl);
    } else if (isSoundCloud && currentTrack) {
      openInSoundCloud(currentTrack);
    }
  }, [isYouTube, isYouTubeMusic, isSoundCloud, currentTrack]);

  const handleShareTrack = useCallback(() => {
    handleOpenExternal();
  }, [handleOpenExternal]);

  const handleDownload = useCallback(async () => {
    if (!currentTrack || isDownloadPending || isDownloaded) return;
    if (!ytVideoId && !scTrackUrl) return;
    setIsDownloadPending(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
      let result: { success: boolean; error?: string };
      if (isSoundCloud && scTrackUrl) {
        result = await downloadSoundCloudTrack(currentTrack, BACKEND_URL);
      } else {
        result = await downloadYouTubeTrack(currentTrack, BACKEND_URL);
      }
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e) {
      console.error('[NowPlaying] Download failed', e);
    } finally {
      setIsDownloadPending(false);
    }
  }, [currentTrack, ytVideoId, scTrackUrl, isSoundCloud, isDownloadPending, isDownloaded]);

  if (!currentTrack) {
    return (
      <View className="flex-1 bg-[#0A0A0A] items-center justify-center">
        <Text className="text-white/60">No track playing</Text>
      </View>
    );
  }

  const displayProgress = normalizePlaybackSeconds(progress);
  const displayDuration = normalizePlaybackSeconds(duration);
  const progressPercent = displayDuration > 0 ? (displayProgress / displayDuration) * 100 : 0;

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
                  Playing from
                </Text>
                <View className="flex-row items-center mt-1">
                  {isYouTube ? (
                    <>
                      <YouTubeIcon size={14} />
                      <Text className="text-white font-semibold text-sm ml-1.5">YouTube</Text>
                    </>
                  ) : isYouTubeMusic ? (
                    <>
                      <YouTubeMusicIcon size={14} />
                      <Text className="text-white font-semibold text-sm ml-1.5">YouTube Music</Text>
                    </>
                  ) : isSoundCloud ? (
                    <>
                      <SoundCloudIcon size={14} />
                      <Text className="text-white font-semibold text-sm ml-1.5">SoundCloud</Text>
                    </>
                  ) : (
                    <Text className="text-white font-semibold text-sm">{currentTrack.album}</Text>
                  )}
                </View>
              </View>
              <View className="w-10" />
            </View>

            {/* Artwork / Video */}
            <View className="items-center justify-center flex-1 px-10">
              {(isYouTube || isYouTubeMusic) && ytVideoId ? (
                /* YouTube / YouTube Music — show live video at highest quality */
                <Animated.View
                  style={{
                    shadowColor: '#FF0000',
                    shadowOffset: { width: 0, height: 20 },
                    shadowOpacity: 0.4,
                    shadowRadius: 40,
                    elevation: 20,
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                >
                  <YouTubeInlinePlayer videoId={ytVideoId} isPlaying={isPlaying} />
                </Animated.View>
              ) : isSoundCloud ? (
                /* SoundCloud — artwork with source badge */
                <Animated.View
                  style={{
                    shadowColor: '#FF5500',
                    shadowOffset: { width: 0, height: 20 },
                    shadowOpacity: 0.4,
                    shadowRadius: 40,
                    elevation: 20,
                  }}
                >
                  <View style={{ width: ARTWORK_SIZE, height: ARTWORK_SIZE, borderRadius: 12, overflow: 'hidden' }}>
                    <Image
                      source={{ uri: currentTrack.artwork }}
                      style={{ width: ARTWORK_SIZE, height: ARTWORK_SIZE }}
                      contentFit="cover"
                    />
                    <View
                      style={{
                        position: 'absolute',
                        bottom: 12,
                        right: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        borderRadius: 20,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                      }}
                    >
                      <SoundCloudIcon size={14} />
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', marginLeft: 5 }}>SoundCloud</Text>
                    </View>
                  </View>
                </Animated.View>
              ) : (
                /* VYBE / local — square artwork */
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
                    style={{ width: ARTWORK_SIZE, height: ARTWORK_SIZE, borderRadius: 12 }}
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

              {isExternalPlayback ? (
                <View className="flex-row items-center mt-4">
                  <Pressable
                    onPress={handleOpenExternal}
                    className="flex-row items-center justify-center bg-white/10 rounded-full py-2.5 px-4 mr-3"
                  >
                    <ExternalLink size={16} color="#fff" />
                    <Text className="text-white text-sm font-medium ml-2">
                      {isSoundCloud ? 'Open in SoundCloud' : isYouTubeMusic ? 'Watch on YouTube Music' : 'Watch on YouTube'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleDownload}
                    disabled={isDownloadPending || isDownloaded}
                    className="flex-row items-center justify-center rounded-full py-2.5 px-4"
                    style={{ backgroundColor: isDownloaded ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.1)' }}
                  >
                    {isDownloadPending ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : isDownloaded ? (
                      <Check size={16} color="#22c55e" />
                    ) : (
                      <Download size={16} color="#fff" />
                    )}
                    <Text
                      className="text-sm font-medium ml-2"
                      style={{ color: isDownloaded ? '#22c55e' : '#fff' }}
                    >
                      {isDownloadPending ? 'Downloading...' : isDownloaded ? 'Downloaded' : 'Download'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Progress Bar */}
              <View className="mt-6">
                <Pressable
                  onPress={(e) => {
                    const x = e.nativeEvent.locationX;
                    const width = SCREEN_WIDTH - 64;
                    const percent = x / width;
                    handleSeek(Math.floor(percent * displayDuration));
                  }}
                >
                  <View className="h-1 bg-white/20 rounded-full overflow-hidden">
                    <View
                      className="h-full rounded-full bg-white"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </View>
                </Pressable>
                <View className="flex-row justify-between mt-2">
                  <Text className="text-white/40 text-xs">
                    {formatDuration(Math.floor(displayProgress))}
                  </Text>
                  <Text className="text-white/40 text-xs">
                    {displayDuration > 0 ? formatDuration(Math.floor(displayDuration)) : '--:--'}
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
                  <Shuffle size={24} color={isShuffled ? '#8B5CF6' : '#fff'} />
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
                  onPressIn={() => { playScale.value = withSpring(0.9); }}
                  onPressOut={() => { playScale.value = withSpring(1); }}
                  style={playButtonStyle}
                  className="w-18 h-18 bg-white rounded-full items-center justify-center"
                  disabled={isPlayButtonBusy}
                >
                  <View className={`w-[72px] h-[72px] rounded-full items-center justify-center ${isError ? 'bg-red-500' : 'bg-white'}`}>
                    {isPlayButtonBusy ? (
                      <ActivityIndicator size="large" color="#0A0A0A" />
                    ) : isPlaying ? (
                      <Pause size={36} color="#0A0A0A" fill="#0A0A0A" />
                    ) : (
                      <Play size={36} color={isError ? '#fff' : '#0A0A0A'} fill={isError ? '#fff' : '#0A0A0A'} style={{ marginLeft: 4 }} />
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
                    <Repeat size={24} color={repeatMode === 'all' ? '#8B5CF6' : '#fff'} />
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
                <Pressable className="p-3" onPress={handleShareTrack}>
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
