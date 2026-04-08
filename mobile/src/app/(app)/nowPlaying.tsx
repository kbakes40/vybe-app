import React, { useCallback, useState, useRef, useEffect } from 'react';
import { View, Text, Pressable, Dimensions, Linking, ActivityIndicator, Share, Modal, ScrollView } from 'react-native';
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
import { Svg, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  interpolate,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore, downloadYouTubeTrack, downloadSoundCloudTrack } from '@/stores/downloadsStore';
import { DownloadButton } from '@/components/DownloadButton';
import { openInSoundCloud } from '@/lib/soundcloudHandoff';
import { formatDuration } from '@/data/mockData';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - 80;
const VIDEO_HEIGHT = Math.round(ARTWORK_SIZE * (9 / 16));

// YouTube hqdefault/maxresdefault thumbnails are 16:9 with black letterbox bars baked in.
// Detecting these URLs lets us display them in a 16:9 container so cover-fit crops the bars out.
function isYouTubeThumbnail(url: string): boolean {
  return !!(url && (url.includes('i.ytimg.com') || url.includes('img.youtube.com')));
}

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
    function onError(e){
      try{window.ReactNativeWebView.postMessage(JSON.stringify({type:'ytError',code:e.data}))}catch(err){}
    }
    function init(){
      player=new YT.Player('player',{
        videoId:'${videoId}',
        playerVars:{autoplay:0,controls:0,mute:1,playsinline:1,
          vq:'hd1080',rel:0,modestbranding:1,iv_load_policy:3},
        events:{onReady:onReady,onStateChange:onStateChange,onError:onError}
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
  artworkUri: string;
  isPlaying: boolean;
}

function YouTubeInlinePlayer({ videoId, artworkUri, isPlaying }: YouTubeInlinePlayerProps) {
  const webViewRef = useRef<WebView>(null);
  const isReadyRef = useRef(false);
  const [showFallback, setShowFallback] = useState(true);

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
        setShowFallback(false);
        if (isPlaying) {
          webViewRef.current?.injectJavaScript('window.playVideo&&window.playVideo();true;');
        }
      } else if (msg.type === 'ytError' && (msg.code === 150 || msg.code === 153)) {
        setShowFallback(true);
      }
    } catch (_) {}
  }, [isPlaying]);

  return (
    <View style={{ width: ARTWORK_SIZE, height: VIDEO_HEIGHT, borderRadius: 12, overflow: 'hidden' }}>
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
      {showFallback && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Image
            source={{ uri: artworkUri }}
            style={{ width: ARTWORK_SIZE, height: VIDEO_HEIGHT }}
            contentFit="cover"
          />
          <View
            style={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.7)',
              borderRadius: 16,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <YouTubeIcon size={13} />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', marginLeft: 4 }}>YouTube</Text>
          </View>
        </View>
      )}
    </View>
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

  const [showQueue, setShowQueue] = useState(false);

  const currentTrack = usePlaybackController(s => s.currentTrack);

  // Related tracks for the queue sheet
  interface RelatedYT { videoId: string; title: string; channelName: string; thumbnailUrl: string; duration?: number; }
  interface RelatedSC { trackId: string; title: string; artist: string; artwork: string; duration: number; soundcloudUrl: string; }
  const [ytRelated, setYtRelated] = useState<RelatedYT[]>([]);
  const [scRelated, setScRelated] = useState<RelatedSC[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const lastFetchedArtist = useRef<string | null>(null);

  useEffect(() => {
    if (!showQueue || !currentTrack?.artist) return;
    if (lastFetchedArtist.current === currentTrack.artist) return;
    lastFetchedArtist.current = currentTrack.artist;
    const artist = currentTrack.artist;
    const base = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
    setRelatedLoading(true);
    setYtRelated([]);
    setScRelated([]);
    Promise.all([
      fetch(`${base}/api/youtube/search?q=${encodeURIComponent(artist + ' music')}&maxResults=10`)
        .then(r => r.ok ? r.json() : { data: [] })
        .then(j => setYtRelated((j.data ?? []) as RelatedYT[]))
        .catch(() => {}),
      fetch(`${base}/api/soundcloud/search?q=${encodeURIComponent(artist)}&maxResults=10`)
        .then(r => r.ok ? r.json() : { data: [] })
        .then(j => setScRelated((j.data ?? []) as RelatedSC[]))
        .catch(() => {}),
    ]).finally(() => setRelatedLoading(false));
  }, [showQueue, currentTrack?.artist]);
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
  const queue = usePlaybackController(s => s.queue);
  const queueIndex = usePlaybackController(s => s.queueIndex);
  const playTrack = usePlaybackController(s => s.playTrack);
  const upNext = queue.slice(queueIndex + 1);

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

  // Track-change transition
  const artworkOpacity = useSharedValue(1);
  const artworkScale = useSharedValue(1);
  const infoOpacity = useSharedValue(1);
  const infoTranslateY = useSharedValue(0);

  useEffect(() => {
    // Artwork: quick fade out + scale down, then spring back in
    artworkOpacity.value = withSequence(
      withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) }),
    );
    artworkScale.value = withSequence(
      withTiming(0.94, { duration: 180, easing: Easing.out(Easing.quad) }),
      withSpring(1, { damping: 14, stiffness: 180 }),
    );
    // Title/artist: slide up from below + fade in
    infoOpacity.value = withSequence(
      withTiming(0, { duration: 150 }),
      withTiming(1, { duration: 280 }),
    );
    infoTranslateY.value = withSequence(
      withTiming(12, { duration: 0 }),
      withTiming(0, { duration: 280, easing: Easing.out(Easing.quad) }),
    );
  }, [currentTrack?.id]);

  const artworkAnimStyle = useAnimatedStyle(() => ({
    opacity: artworkOpacity.value,
    transform: [{ scale: artworkScale.value }],
  }));
  const infoAnimStyle = useAnimatedStyle(() => ({
    opacity: infoOpacity.value,
    transform: [{ translateY: infoTranslateY.value }],
  }));

  // Scrubber state
  const scrubberWidth = SCREEN_WIDTH - 64;
  const isScrubbing = useSharedValue(false);
  const scrubPercent = useSharedValue(0);
  const thumbScale = useSharedValue(1);
  // After a seek, block status-callback renders from snapping the thumb back
  const seekLockUntil = useRef(0);

  // Download fly animation
  const flyX = useSharedValue(0);
  const flyY = useSharedValue(0);
  const flyScale = useSharedValue(1);
  const flyOpacity = useSharedValue(0);
  const [flyVisible, setFlyVisible] = useState(false);

  const isLiked = currentTrack ? likedTracks.has(currentTrack.id) : false;
  const isYouTube = currentSource === 'youtube';
  const isYouTubeMusic = currentSource === 'youtube_music';
  const isSoundCloud = currentSource === 'soundcloud';
  const isExternalPlayback = isYouTube || isYouTubeMusic || isSoundCloud;
  const ytVideoId = currentTrack?.youtubeId || currentTrack?.youtubeMusicId || null;
  // Use 16:9 for YouTube thumbnails (bars baked in); keep square for proper album art
  const ytmArtworkIsThumb = isYouTubeThumbnail(currentTrack?.artwork ?? '');
  const ytmArtworkHeight = ytmArtworkIsThumb ? VIDEO_HEIGHT : ARTWORK_SIZE;
  const scTrackUrl = currentTrack?.soundcloudUrl || null;

  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);
  const isDownloaded = currentTrack ? isTrackDownloaded(currentTrack.id) : false;
  const importProgress = useDownloadsStore(s => s.importProgress);
  const [isDownloadPending, setIsDownloadPending] = useState(false);

  const playButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playScale.value }],
  }));

  const flyStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: flyX.value },
      { translateY: flyY.value },
      { scale: flyScale.value },
    ],
    opacity: flyOpacity.value,
  }));

  const displayProgress = normalizePlaybackSeconds(progress);
  const displayDuration = normalizePlaybackSeconds(duration);
  const trackPercent = displayDuration > 0 ? Math.min(displayProgress / displayDuration, 1) : 0;

  // Keep shared values in sync with JS-side values so worklets can read them
  const trackPercentSV = useSharedValue(trackPercent);
  // Only update from status callbacks if no seek is in flight — prevents snap-back
  if (Date.now() >= seekLockUntil.current) {
    trackPercentSV.value = trackPercent;
  }
  const durationSV = useSharedValue(displayDuration);
  durationSV.value = displayDuration;

  // Scrubber animated styles — pixel values only (no % strings in worklets)
  const scrubFillStyle = useAnimatedStyle(() => ({
    width: (isScrubbing.value ? scrubPercent.value : trackPercentSV.value) * scrubberWidth,
  }));
  const scrubThumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (isScrubbing.value ? scrubPercent.value : trackPercentSV.value) * scrubberWidth - 6 },
      { scale: thumbScale.value },
    ],
  }));

  // Accepts raw seconds
  const handleSeek = (seconds: number) => {
    seekTo(seconds);
  };

  // Accepts 0–1 percentage; converts to seconds on JS thread where duration is live.
  // Also updates trackPercentSV optimistically so the thumb stays put, then releases
  // isScrubbing — doing this here (not in the worklet) prevents the snap-back race.
  // MUST be defined before gesture definitions so Reanimated worklets capture a valid ref.
  const handleSeekPct = (pct: number, seekSeconds?: number) => {
    const secs = seekSeconds ?? (pct * displayDuration);
    console.log('[Scrub] pct:', pct.toFixed(3), 'seekSeconds:', seekSeconds?.toFixed(1), 'displayDuration:', displayDuration, 'secs:', secs.toFixed(1));
    seekLockUntil.current = Date.now() + 1000; // block status-callback snap-back for 1s
    seekTo(secs);
    trackPercentSV.value = pct;
    isScrubbing.value = false;
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const scrubGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      isScrubbing.value = true;
      thumbScale.value = withSpring(1.5, { damping: 12, stiffness: 200 });
      scrubPercent.value = Math.min(Math.max(e.x / scrubberWidth, 0), 1);
    })
    .onUpdate((e) => {
      'worklet';
      scrubPercent.value = Math.min(Math.max(e.x / scrubberWidth, 0), 1);
    })
    .onEnd(() => {
      'worklet';
      thumbScale.value = withSpring(1, { damping: 12, stiffness: 200 });
      const seekSeconds = scrubPercent.value * durationSV.value;
      runOnJS(handleSeekPct)(scrubPercent.value, seekSeconds);
    });

  const scrubTapGesture = Gesture.Tap()
    .onEnd((e) => {
      'worklet';
      const pct = Math.min(Math.max(e.x / scrubberWidth, 0), 1);
      const seekSeconds = pct * durationSV.value;
      runOnJS(handleSeekPct)(pct, seekSeconds);
    });

  const scrubCombined = Gesture.Simultaneous(scrubGesture, scrubTapGesture);

  const panGesture = Gesture.Pan()
    .activeOffsetY([10, 100000])     // only activate for downward swipes
    .failOffsetX([-15, 15])          // fail immediately on horizontal movement
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

  const handleShareTrack = useCallback(async () => {
    if (!currentTrack) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ytId = currentTrack.youtubeId || currentTrack.youtubeMusicId;
    const scUrl = currentTrack.soundcloudUrl;
    const url = ytId
      ? `https://music.youtube.com/watch?v=${ytId}`
      : scUrl ?? null;
    const message = url
      ? `🎵🔥🔥🔥 Fire Ass Beats 🔥🔥🔥🎵\n\n${currentTrack.title} — ${currentTrack.artist}\n\n${url}`
      : `🎵🔥🔥🔥 Fire Ass Beats 🔥🔥🔥🎵\n\n${currentTrack.title} — ${currentTrack.artist}`;
    await Share.share({ message });
  }, [currentTrack]);

  const triggerDownloadAnimation = useCallback(() => {
    flyX.value = SCREEN_WIDTH / 2 - 24;
    flyY.value = insets.top + 80;
    flyScale.value = 1;
    flyOpacity.value = 1;
    setFlyVisible(true);
    const targetX = SCREEN_WIDTH * 0.875 - 24;
    const targetY = SCREEN_HEIGHT - 70;
    flyX.value = withTiming(targetX, { duration: 650 });
    flyY.value = withTiming(targetY, { duration: 650 });
    flyScale.value = withTiming(0.12, { duration: 650 });
    flyOpacity.value = withSequence(withTiming(1, { duration: 450 }), withTiming(0, { duration: 200 }));
    setTimeout(() => runOnJS(setFlyVisible)(false), 700);
  }, [flyX, flyY, flyScale, flyOpacity, insets.top]);

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
        triggerDownloadAnimation();
      }
    } catch (e) {
      console.error('[NowPlaying] Download failed', e);
    } finally {
      setIsDownloadPending(false);
    }
  }, [currentTrack, ytVideoId, scTrackUrl, isSoundCloud, isDownloadPending, isDownloaded, triggerDownloadAnimation]);


  if (!currentTrack) {
    return (
      <View className="flex-1 bg-[#0A0A0A] items-center justify-center">
        <Text className="text-white/60">No track playing</Text>
      </View>
    );
  }

  return (
    <>
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
              {isYouTubeMusic && ytVideoId ? (
                /* YouTube Music — 16:9 for thumbnails (crops letterbox), square for album art */
                <Animated.View
                  style={[artworkAnimStyle, {
                    shadowColor: '#FF0000',
                    shadowOffset: { width: 0, height: 20 },
                    shadowOpacity: 0.4,
                    shadowRadius: 40,
                    elevation: 20,
                  }]}
                >
                  <View style={{ width: ARTWORK_SIZE, height: ytmArtworkHeight, borderRadius: 12, overflow: 'hidden' }}>
                    <Image
                      source={{ uri: currentTrack.artwork }}
                      style={{ width: ARTWORK_SIZE, height: ytmArtworkHeight }}
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
                      <YouTubeMusicIcon size={14} />
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', marginLeft: 5 }}>YouTube Music</Text>
                    </View>
                  </View>
                </Animated.View>
              ) : isYouTube && ytVideoId ? (
                /* YouTube — show inline video player with artwork fallback */
                <Animated.View
                  style={[artworkAnimStyle, {
                    shadowColor: '#FF0000',
                    shadowOffset: { width: 0, height: 20 },
                    shadowOpacity: 0.4,
                    shadowRadius: 40,
                    elevation: 20,
                    borderRadius: 12,
                    overflow: 'hidden',
                  }]}
                >
                  <YouTubeInlinePlayer videoId={ytVideoId} artworkUri={currentTrack.artwork} isPlaying={isPlaying} />
                </Animated.View>
              ) : isSoundCloud ? (
                /* SoundCloud — artwork with source badge */
                <Animated.View
                  style={[artworkAnimStyle, {
                    shadowColor: '#FF5500',
                    shadowOffset: { width: 0, height: 20 },
                    shadowOpacity: 0.4,
                    shadowRadius: 40,
                    elevation: 20,
                  }]}
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
                  style={[artworkAnimStyle, {
                    shadowColor: '#8B5CF6',
                    shadowOffset: { width: 0, height: 20 },
                    shadowOpacity: 0.5,
                    shadowRadius: 40,
                    elevation: 20,
                  }]}
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
            <Animated.View style={[infoAnimStyle, { paddingHorizontal: 32, marginTop: 32 }]}>
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-4">
                  <Text className="text-white text-2xl font-bold" numberOfLines={1}>
                    {currentTrack.title}
                  </Text>
                  <Text className="text-white/60 text-lg mt-1" numberOfLines={1}>
                    {currentTrack.artist}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <DownloadButton track={currentTrack} size={28} />
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
              </View>

              {/* Progress Bar / Scrubber */}
              <View style={{ marginTop: 24 }}>
                <GestureDetector gesture={scrubCombined}>
                  <View style={{ paddingVertical: 10 }}>
                    <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, overflow: 'hidden' }}>
                      <Animated.View style={[{ height: 3, backgroundColor: '#fff', borderRadius: 2 }, scrubFillStyle]} />
                    </View>
                    <Animated.View style={[{
                      position: 'absolute',
                      top: 4,
                      left: 0,
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: '#fff',
                      shadowColor: '#000',
                      shadowOpacity: 0.35,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 2 },
                    }, scrubThumbStyle]} />
                  </View>
                </GestureDetector>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    {formatDuration(Math.floor(displayProgress))}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    {displayDuration > 0 ? `-${formatDuration(Math.max(0, Math.floor(displayDuration - displayProgress)))}` : '--:--'}
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

                <Pressable onPress={previous} className="p-3">
                  <SkipBack size={32} color="#fff" fill="#fff" />
                </Pressable>

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

                <Pressable onPress={next} className="p-3">
                  <SkipForward size={32} color="#fff" fill="#fff" />
                </Pressable>

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
                <Pressable className="p-3" onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowQueue(true); }}>
                  <ListMusic size={24} color="#fff" />
                </Pressable>
                <Pressable className="p-3" onPress={handleShareTrack}>
                  <Share2 size={24} color="#fff" />
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </LinearGradient>
        {/* Download fly animation thumbnail */}
        {flyVisible && currentTrack && (
          <Animated.View
            style={[
              { position: 'absolute', top: 0, left: 0, width: 48, height: 48, borderRadius: 8, overflow: 'hidden', zIndex: 999 },
              flyStyle,
            ]}
            pointerEvents="none"
          >
            <Image source={{ uri: currentTrack.artwork }} style={{ width: 48, height: 48 }} contentFit="cover" />
          </Animated.View>
        )}
      </Animated.View>
    </GestureDetector>

    {/* Queue Sheet */}
    <Modal
      visible={showQueue}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowQueue(false)}
    >
      <View style={{ flex: 1, backgroundColor: '#111' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Next Up</Text>
          <Pressable onPress={() => setShowQueue(false)} hitSlop={12} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 16, lineHeight: 18 }}>✕</Text>
          </Pressable>
        </View>

        {/* Now Playing row */}
        {currentTrack && (
          <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>Now Playing</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image source={{ uri: currentTrack.artwork }} style={{ width: 44, height: 44, borderRadius: 6, borderWidth: 2, borderColor: '#8B5CF6' }} contentFit="cover" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{currentTrack.title}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{currentTrack.artist}</Text>
              </View>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B5CF6' }} />
            </View>
          </View>
        )}

        {/* Up next list + related */}
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
          {upNext.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 32 }}>
              <ListMusic size={36} color="rgba(255,255,255,0.2)" />
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, marginTop: 12 }}>Queue is empty</Text>
            </View>
          ) : (
            <>
              <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 }}>
                Up Next — {upNext.length} track{upNext.length !== 1 ? 's' : ''}
              </Text>
              {upNext.map((track, i) => (
                <Pressable
                  key={`${track.id}-${i}`}
                  onPress={() => { playTrack(track, queue); setShowQueue(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, width: 24 }}>{i + 1}</Text>
                  <Image source={{ uri: track.artwork }} style={{ width: 44, height: 44, borderRadius: 6 }} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{track.title}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{track.artist}</Text>
                  </View>
                  <DownloadButton track={track} size={24} />
                </Pressable>
              ))}
            </>
          )}

          {/* ── Discover More ── */}
          <View style={{ marginTop: 24, marginHorizontal: 20, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginHorizontal: 12 }}>
                Discover More
              </Text>
              <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
            </View>
          </View>

          {relatedLoading ? (
            <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" style={{ marginVertical: 20 }} />
          ) : null}

          {/* YouTube Music results */}
          {ytRelated.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center', marginRight: 7 }}>
                  <Text style={{ color: '#fff', fontSize: 10, lineHeight: 11 }}>♪</Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>YouTube Music</Text>
              </View>
              {ytRelated.map((item) => {
                const t = {
                  id: `yt-${item.videoId}`,
                  title: item.title,
                  artist: item.channelName,
                  artwork: item.thumbnailUrl,
                  duration: item.duration ?? 0,
                  artistId: '', album: '', albumId: '', isLiked: false,
                  source: 'youtube_music' as const,
                  youtubeId: item.videoId,
                  youtubeMusicId: item.videoId,
                  audioUrl: '',
                };
                return (
                  <Pressable
                    key={item.videoId}
                    onPress={() => { playTrack(t, [t]); setShowQueue(false); }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 9 }}
                  >
                    <Image source={{ uri: item.thumbnailUrl }} style={{ width: 46, height: 46, borderRadius: 6 }} contentFit="cover" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 }} numberOfLines={1}>{item.channelName}</Text>
                    </View>
                    <View onStartShouldSetResponder={() => true}>
                      <DownloadButton track={t} size={26} />
                    </View>
                  </Pressable>
                );
              })}
            </>
          ) : null}

          {/* SoundCloud results */}
          {scRelated.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 16, marginBottom: 10 }}>
                <View style={{ width: 18, height: 14, borderRadius: 3, backgroundColor: '#FF5500', alignItems: 'center', justifyContent: 'center', marginRight: 7 }}>
                  <Text style={{ color: '#fff', fontSize: 7, fontWeight: '900', letterSpacing: -0.5 }}>)))</Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>SoundCloud</Text>
              </View>
              {scRelated.map((item) => {
                const t = {
                  id: `sc-${item.trackId}`,
                  title: item.title,
                  artist: item.artist,
                  artwork: item.artwork,
                  duration: item.duration,
                  artistId: '', album: '', albumId: '', isLiked: false,
                  source: 'soundcloud' as const,
                  soundcloudUrl: item.soundcloudUrl,
                  audioUrl: item.soundcloudUrl,
                };
                return (
                  <Pressable
                    key={item.trackId}
                    onPress={() => { playTrack(t, [t]); setShowQueue(false); }}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 9 }}
                  >
                    <Image source={{ uri: item.artwork }} style={{ width: 46, height: 46, borderRadius: 6 }} contentFit="cover" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 }} numberOfLines={1}>{item.artist}</Text>
                    </View>
                    <View onStartShouldSetResponder={() => true}>
                      <DownloadButton track={t} size={26} />
                    </View>
                  </Pressable>
                );
              })}
            </>
          ) : null}

          {!relatedLoading && ytRelated.length === 0 && scRelated.length === 0 && currentTrack ? (
            <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13, textAlign: 'center', marginVertical: 12 }}>No related tracks found</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
    </>
  );
}
