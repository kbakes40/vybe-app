import React, { useCallback, useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  Dimensions,
  Linking,
  ActivityIndicator,
  Share,
  Modal,
  ScrollView,
  Animated as RNAnimated,
  Platform,
  StyleSheet,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Image } from 'expo-image';
import { useRouter, usePathname } from 'expo-router';
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
  Flame,
  ListMusic,
  Share2,
  Airplay,
  ChevronDown,
  ExternalLink,
  RotateCcw,
  RotateCw,
  Cloud,
  Download,
  Check,
  X,
  Trash2,
  ListPlus,
} from 'lucide-react-native';
import { Svg, Circle } from 'react-native-svg';
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  interpolate,
  runOnJS,
  Easing,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { usePlaybackController } from '@/stores/playbackController';
import { useDownloadsStore, downloadYouTubeTrack, downloadSoundCloudTrack } from '@/stores/downloadsStore';
import { useLikedSongsStore } from '@/stores/likedSongsStore';
import { DownloadButton } from '@/components/DownloadButton';
import { LoadingRing } from '@/components/LoadingRing';
import { openInSoundCloud } from '@/lib/soundcloudHandoff';
import { showRoutePicker } from '@/lib/NowPlayingManager';
import { shareSong } from '@/lib/share-helpers';
import { formatDuration } from '@/data/mockData';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useDynamicIslandSignal } from '@/stores/dynamicIslandStore';
import { usePiPStore } from '@/components/PiPVideoOverlay';
import { useNowPlayingSheetStore } from '@/stores/nowPlayingSheetStore';
import {
  VybeVideoNeonIcon,
  VybeMusicNeonIcon,
  VybeWavesNeonIcon,
} from '@/assets/icons/VybeNeonSourceIcons';
import { AnimatedArtworkBackground } from '@/components/NowPlaying/Background';
import { RadioParadiseSoulActions } from '@/components/radio/RadioParadiseSoulActions';
import { useThemeStore } from '@/stores/themeStore';
import { hexToRgba } from '@/lib/themeColorUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - 56;
const VIDEO_HEIGHT = Math.round(ARTWORK_SIZE * (9 / 16));
/** Outer chrome — aligned with Dynamic Island pill softness */
const ARTWORK_OUTER_RADIUS = 22;
const ARTWORK_INNER_RADIUS = 20;

/** No cross-fade / slide when skipping or picking another track — UI updates immediately */
const ARTWORK_STATIC_STYLE = { opacity: 1, transform: [{ scale: 1 }] as const };
const INFO_STATIC_STYLE = { opacity: 1, transform: [{ translateY: 0 }] as const };

// YouTube hqdefault/maxresdefault thumbnails are 16:9 with black letterbox bars baked in.
// Detecting these URLs lets us display them in a 16:9 container so cover-fit crops the bars out.
function isYouTubeThumbnail(url: string): boolean {
  return !!(url && (url.includes('i.ytimg.com') || url.includes('img.youtube.com')));
}

const MACHINED_BLUE = '#00E5FF';
const nowPlayingTypography = StyleSheet.create({
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  artist: {
    marginTop: 4,
    color: '#00E5FF',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
});

const LIKE_BURST_PARTICLE_ANGLES = Array.from({ length: 8 }, (_, i) => (i * Math.PI * 2) / 8);
const LIKE_BURST_DISTANCE = 34;
const LIKE_HEART_CONTAINER = 56;

const nowPlayingChromeStyles = StyleSheet.create({
  bottomIconCell: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Fire icon palette — SoundCloud Orange + warm ember tones for active state. */
const FIRE_ORANGE = '#FF3300';
const FIRE_EMBER = '#FFB020';

const npFireStyles = StyleSheet.create({
  fireShadowHost: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fireShadowHostActive: {
    shadowColor: FIRE_ORANGE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 14,
    ...Platform.select({
      android: { elevation: 16 },
      default: {},
    }),
  },
  fireHitArea: {
    width: LIKE_HEART_CONTAINER,
    height: LIKE_HEART_CONTAINER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fireBurstRing: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: FIRE_ORANGE,
    backgroundColor: 'transparent',
  },
  fireParticle: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: FIRE_EMBER,
    shadowColor: FIRE_ORANGE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    left: LIKE_HEART_CONTAINER / 2 - 2,
    top: LIKE_HEART_CONTAINER / 2 - 2,
  },
});

const normalizePlaybackSeconds = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  // Some sources report ms-like values; convert to seconds for UI/store consistency.
  return value > 100000 ? value / 1000 : value;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// ─── Swipe actions (Trash + Queue) ───────────────────────────────────────────
function SwipeActions({
  progress,
  onDelete,
  onQueue,
}: {
  progress: SharedValue<number>;
  onDelete?: () => void;
  onQueue?: () => void;
}) {
  const actionCount = (onDelete ? 1 : 0) + (onQueue ? 1 : 0);
  const width = actionCount * 72;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.8, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [16, 0], Extrapolation.CLAMP) }],
  }));
  return (
    <Animated.View style={[style, { width, flexDirection: 'row' }]}>
      {onQueue ? (
        <Pressable
          onPress={onQueue}
          style={{
            width: 64, marginLeft: 4,
            backgroundColor: '#3B82F6', borderRadius: 10,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ListPlus size={20} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', marginTop: 2 }}>Queue</Text>
        </Pressable>
      ) : null}
      {onDelete ? (
        <Pressable
          onPress={onDelete}
          style={{
            width: 64, marginLeft: 4,
            backgroundColor: '#EF4444', borderRadius: 10,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Trash2 size={20} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700', marginTop: 2 }}>Delete</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

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
    <View style={{ width: ARTWORK_SIZE, height: VIDEO_HEIGHT, borderRadius: ARTWORK_INNER_RADIUS, overflow: 'hidden' }}>
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
              backgroundColor: 'rgba(0,0,0,0.38)',
              borderRadius: 16,
              paddingHorizontal: 8,
              paddingVertical: 4,
              opacity: 0.52,
            }}
          >
            <YouTubeIcon size={13} />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', marginLeft: 4 }}>Vybe Video</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Vybe neon source marks (red / pink / orange glow) ───────────────────────

function YouTubeIcon({ size = 16 }: { size?: number }) {
  return <VybeVideoNeonIcon size={size} />;
}

function SoundCloudIcon({ size = 16 }: { size?: number }) {
  return <VybeWavesNeonIcon size={size} />;
}

function YouTubeMusicIcon({ size = 16 }: { size?: number }) {
  return <VybeMusicNeonIcon size={size} />;
}

const ARTWORK_EDGE = MACHINED_BLUE;

/** Scrubber + time labels only — subscribes to progress so the rest of Now Playing does not re-render every tick. */
function NowPlayingScrubberRow() {
  const accent = useThemeStore((s) => s.accentColor);
  const progress = usePlaybackController(s => s.progress);
  const duration = usePlaybackController(s => s.duration);
  const seekTo = usePlaybackController(s => s.seekTo);

  const scrubberWidth = SCREEN_WIDTH - 64;
  const isScrubbing = useSharedValue(false);
  const scrubPercent = useSharedValue(0);
  const thumbScale = useSharedValue(1);
  const seekLockUntil = useRef(0);

  const displayDuration = Math.max(0, normalizePlaybackSeconds(duration));
  const rawProgress = Math.max(0, normalizePlaybackSeconds(progress));
  const displayProgress = displayDuration > 0 ? Math.min(rawProgress, displayDuration) : rawProgress;
  const trackPercent = displayDuration > 0 ? Math.min(displayProgress / displayDuration, 1) : 0;

  const trackPercentSV = useSharedValue(trackPercent);
  const durationSV = useSharedValue(displayDuration);

  useEffect(() => {
    if (Date.now() >= seekLockUntil.current) {
      trackPercentSV.value = trackPercent;
    }
  }, [trackPercent, trackPercentSV]);

  useEffect(() => {
    durationSV.value = Math.max(0, displayDuration);
  }, [displayDuration, durationSV]);

  const scrubFillStyle = useAnimatedStyle(() => ({
    width: (isScrubbing.value ? scrubPercent.value : trackPercentSV.value) * scrubberWidth,
  }));
  const scrubThumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (isScrubbing.value ? scrubPercent.value : trackPercentSV.value) * scrubberWidth - 11 },
      { scale: thumbScale.value },
    ],
  }));

  const handleSeekPct = useCallback((pct: number, seekSeconds: number) => {
    seekLockUntil.current = Date.now() + 1000;
    seekTo(seekSeconds);
    trackPercentSV.value = pct;
    isScrubbing.value = false;
  }, [seekTo]);

  // Built each render so `runOnJS(handleSeekPct)` stays fresh; avoids useMemo + Fast Refresh hook-order bugs.
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

  return (
    <View style={{ marginTop: 24 }}>
      <GestureDetector gesture={scrubCombined}>
        <View style={{ paddingVertical: 10 }}>
          <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
            <Animated.View
              style={[
                { height: '100%', borderRadius: 2, overflow: 'hidden', backgroundColor: accent },
                scrubFillStyle,
              ]}
            />
          </View>
          <Animated.View style={[{ position: 'absolute', top: 2, left: 0, width: 22, height: 22 }, scrubThumbStyle]}>
            <View
              style={{
                ...StyleSheet.absoluteFillObject,
                borderRadius: 11,
                backgroundColor: hexToRgba(accent, 0.12),
                shadowColor: accent,
                shadowOpacity: 1,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
            <View
              style={{
                ...StyleSheet.absoluteFillObject,
                borderRadius: 11,
                backgroundColor: 'rgba(255,255,255,0.2)',
                shadowColor: '#FFFFFF',
                shadowOpacity: 0.9,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 0 },
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: 5,
                left: 5,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#FFFFFF',
                shadowColor: MACHINED_BLUE,
                shadowOpacity: 0.95,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 0 },
                elevation: 14,
              }}
            />
          </Animated.View>
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
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function NowPlayingScreenContent({ sheetLayout = false }: { sheetLayout?: boolean } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const [showQueue, setShowQueue] = useState(false);

  const currentTrack = usePlaybackController(s => s.currentTrack);

  // Related tracks for the queue sheet
  interface RelatedYT { videoId: string; title: string; channelName: string; thumbnailUrl: string; duration?: number; }
  interface RelatedSC { trackId: string; title: string; artist: string; artwork: string; duration: number; soundcloudUrl: string; }
  const [ytRelated, setYtRelated] = useState<RelatedYT[]>([]);
  const [scRelated, setScRelated] = useState<RelatedSC[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Batch download state for Vybe Music / Vybe Waves recommendations
  const [ytDownloadingAll, setYtDownloadingAll] = useState(false);
  const [scDownloadingAll, setScDownloadingAll] = useState(false);
  const [batchActiveId, setBatchActiveId] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState(0);
  const cancelBatchRef = useRef(false);
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
  const error = usePlaybackController(s => s.error);
  const isShuffled = usePlaybackController(s => s.isShuffled);
  const repeatMode = usePlaybackController(s => s.repeatMode);
  const likedTracks = usePlaybackController(s => s.likedTracks);
  const currentSource = usePlaybackController(s => s.currentSource);
  const queue = usePlaybackController(s => s.queue);
  const queueIndex = usePlaybackController(s => s.queueIndex);
  const playTrack = usePlaybackController(s => s.playTrack);
  const playNext = usePlaybackController(s => s.playNext);
  const addToQueue = usePlaybackController(s => s.addToQueue);
  const upNext = queue.slice(queueIndex + 1);

  const isVaultStreamBusy =
    (currentSource === 'youtube' || currentSource === 'youtube_music') &&
    (playbackState === 'loading' || playbackState === 'buffering');
  const isPlayButtonBusy = isVaultStreamBusy || isLoading;

  const pause = usePlaybackController(s => s.pause);
  const play = usePlaybackController(s => s.play);
  const next = usePlaybackController(s => s.next);
  const previous = usePlaybackController(s => s.previous);

  const skipsRemaining = useSubscriptionStore(s => s.skipsRemaining);
  const subscriptionTier = useSubscriptionStore(s => s.tier);

  const handleSkip = useCallback(() => {
    if (__DEV__ || subscriptionTier === 'plus') {
      next();
      return;
    }
    if (skipsRemaining === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.push('/upgrade');
      return;
    }
    next();
  }, [skipsRemaining, subscriptionTier, next, router]);
  const seekTo = usePlaybackController(s => s.seekTo);
  const toggleShuffle = usePlaybackController(s => s.toggleShuffle);
  const toggleRepeat = usePlaybackController(s => s.toggleRepeat);
  const toggleLike = usePlaybackController(s => s.toggleLike);

  const playScale = useSharedValue(1);
  const playRingPulse = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    playRingPulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [playRingPulse]);

  const isLiveRadio = currentSource === 'global_radio' || currentSource === 'radio_paradise';
  const livePulse = useSharedValue(1);
  useEffect(() => {
    if (!isLiveRadio) {
      cancelAnimation(livePulse);
      livePulse.value = 1;
      return;
    }
    livePulse.value = withRepeat(
      withSequence(
        withTiming(0.52, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    return () => {
      cancelAnimation(livePulse);
      livePulse.value = 1;
    };
  }, [isLiveRadio, livePulse]);

  const liveBadgeOpacityStyle = useAnimatedStyle(() => ({
    opacity: livePulse.value,
  }));

  const playRingPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playRingPulse.value }],
    opacity: 0.72 + 0.22 * (playRingPulse.value - 1) / 0.05,
  }));

  // Download fly animation
  const flyX = useSharedValue(0);
  const flyY = useSharedValue(0);
  const flyScale = useSharedValue(1);
  const flyOpacity = useSharedValue(0);
  const [flyVisible, setFlyVisible] = useState(false);

  const isFired = currentTrack ? likedTracks.has(currentTrack.id) : false;
  const flashFire = useDynamicIslandSignal((s) => s.flashFire);

  const fireScale = useRef(new RNAnimated.Value(1)).current;
  const fireRingScale = useRef(new RNAnimated.Value(1)).current;
  const fireRingOpacity = useRef(new RNAnimated.Value(0)).current;
  const fireBurstDriver = useRef(new RNAnimated.Value(0)).current;

  /** 1.3x bloom on every Fire tap — heavy, tactile, then snaps back. */
  const bloomFire = useCallback(() => {
    RNAnimated.sequence([
      RNAnimated.timing(fireScale, { toValue: 1.3, duration: 110, useNativeDriver: true }),
      RNAnimated.timing(fireScale, { toValue: 1, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [fireScale]);

  const runFireRewardAnimation = useCallback(() => {
    // Heavy thump — distinct from the soft Light/Medium taps used elsewhere.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    fireRingScale.setValue(1);
    fireRingOpacity.setValue(0);
    fireBurstDriver.setValue(0);

    bloomFire();
    // Bump the DI pill so it flares SC-Orange + emits its own ember burst.
    flashFire();

    RNAnimated.parallel([
      RNAnimated.timing(fireRingScale, {
        toValue: 1.7,
        duration: 220,
        useNativeDriver: true,
      }),
      RNAnimated.sequence([
        RNAnimated.timing(fireRingOpacity, { toValue: 1, duration: 110, useNativeDriver: true }),
        RNAnimated.timing(fireRingOpacity, { toValue: 0, duration: 110, useNativeDriver: true }),
      ]),
      RNAnimated.timing(fireBurstDriver, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        fireRingScale.setValue(1);
        fireRingOpacity.setValue(0);
        fireBurstDriver.setValue(0);
      }
    });
  }, [fireRingScale, fireRingOpacity, fireBurstDriver, bloomFire, flashFire]);
  const isYouTube = currentSource === 'youtube';
  const isYouTubeMusic = currentSource === 'youtube_music';
  const isSoundCloud = currentSource === 'soundcloud';
  const isExternalPlayback = isYouTube || isYouTubeMusic || isSoundCloud;
  const ytVideoId = currentTrack?.youtubeId || currentTrack?.youtubeMusicId || null;
  // Use 16:9 for YouTube thumbnails (bars baked in); keep square for proper album art
  const ytmArtworkIsThumb = isYouTubeThumbnail(currentTrack?.artwork ?? '');
  const ytmArtworkHeight = ytmArtworkIsThumb ? VIDEO_HEIGHT : ARTWORK_SIZE;
  const ytInlineVault =
    !!(isYouTube && ytVideoId && !currentTrack?.audioUrl?.startsWith('file://'));
  const artworkSlotHeight =
    isYouTubeMusic && ytVideoId ? ytmArtworkHeight : ytInlineVault ? VIDEO_HEIGHT : ARTWORK_SIZE;
  const showYoutubeStreamSkeleton =
    (isYouTube || isYouTubeMusic) &&
    (playbackState === 'buffering' || playbackState === 'loading');
  const scTrackUrl = currentTrack?.soundcloudUrl || null;

  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);
  const removeDownload = useDownloadsStore(s => s.removeDownload);
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

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (sheetLayout) {
      useNowPlayingSheetStore.getState().collapse?.();
      if (pathname.includes('nowPlaying')) {
        router.back();
      }
      return;
    }
    router.back();
  };

  const dockPiP = () => {
    usePiPStore.getState().dock();
    handleClose();
  };

  const panGesture = Gesture.Pan()
    .enabled(!sheetLayout)
    .activeOffsetY([10, 100000])
    .failOffsetX([-15, 15])
    .onUpdate((e) => {
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      if (e.translationY > 150 || e.velocityY > 800) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });
        if (isYouTube && ytVideoId) {
          runOnJS(dockPiP)();
        } else {
          runOnJS(handleClose)();
        }
      } else {
        translateY.value = withSpring(0, { damping: 15, stiffness: 100, mass: 1 });
      }
    });

  const rootStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [
      { translateY: translateY.value },
      { scale: interpolate(translateY.value, [0, 400], [1, 0.88], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(translateY.value, [0, 400], [1, 0.4], Extrapolation.CLAMP),
    borderRadius: interpolate(translateY.value, [0, 100], [0, 24], Extrapolation.CLAMP),
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
    const { progress: p, duration: d } = usePlaybackController.getState();
    seekTo(Math.min(p + 15, d));
  };

  const handleSeekBackward = () => {
    const { progress: p } = usePlaybackController.getState();
    seekTo(Math.max(p - 15, 0));
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
    const playbackUrl = ytId
      ? `https://music.youtube.com/watch?v=${ytId}`
      : scUrl ?? null;
    await shareSong({
      title: currentTrack.title,
      artist: currentTrack.artist,
      playbackUrl,
    });
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

  const sheetBody = (
    <>
        <AnimatedArtworkBackground artworkUri={currentTrack.artwork} />
        <View style={{ flex: 1 }} pointerEvents="box-none">
          <View
            style={{
              flex: 1,
              paddingTop: sheetLayout ? 20 : insets.top,
              paddingBottom: sheetLayout ? insets.bottom + 12 : insets.bottom + 20,
            }}
          >
            {/* Header — neon pill (matches machined control language) */}
            <View
              className="flex-row items-center justify-between px-6 py-3"
              style={{ marginBottom: 8 }}
            >
              <Pressable onPress={handleClose} className="p-2 -ml-2">
                <ChevronDown size={28} color="#fff" />
              </Pressable>
              <View
                style={{
                  alignItems: 'center',
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 22,
                  backgroundColor: 'rgba(6, 10, 14, 0.55)',
                  borderWidth: 1,
                  borderColor: 'rgba(0, 229, 255, 0.55)',
                  shadowColor: MACHINED_BLUE,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.9,
                  shadowRadius: 18,
                  elevation: 14,
                }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' }}>
                  Playing from
                </Text>
                <View className="flex-row items-center mt-1">
                  {isYouTube ? (
                    <>
                      <YouTubeIcon size={14} />
                      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13, marginLeft: 6 }}>Vybe Video</Text>
                    </>
                  ) : isYouTubeMusic ? (
                    <>
                      <YouTubeMusicIcon size={14} />
                      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13, marginLeft: 6 }}>Vybe Music</Text>
                    </>
                  ) : isSoundCloud ? (
                    <>
                      <SoundCloudIcon size={14} />
                      <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13, marginLeft: 6 }}>Vybe Waves</Text>
                    </>
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>{currentTrack.album}</Text>
                  )}
                </View>
              </View>
              <View className="w-10" />
            </View>

            {/* Artwork / Video */}
            <View className="items-center justify-center flex-1 px-10" style={{ minHeight: 0, overflow: 'visible' }}>
              <View
                style={{
                  position: 'relative',
                  width: ARTWORK_SIZE,
                  height: artworkSlotHeight,
                  alignSelf: 'center',
                  overflow: 'visible',
                }}
              >
              {isYouTubeMusic && ytVideoId ? (
                /* YouTube Music — 16:9 for thumbnails (crops letterbox), square for album art */
                <Animated.View
                  style={[ARTWORK_STATIC_STYLE, {
                    shadowColor: MACHINED_BLUE,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.92,
                    shadowRadius: 34,
                    elevation: 26,
                    borderRadius: ARTWORK_OUTER_RADIUS,
                    borderWidth: 1,
                    borderColor: ARTWORK_EDGE,
                  }]}
                >
                  <View style={{ width: ARTWORK_SIZE, height: ytmArtworkHeight, borderRadius: ARTWORK_INNER_RADIUS, overflow: 'hidden' }}>
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
                        backgroundColor: 'rgba(0,0,0,0.38)',
                        borderRadius: 20,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        opacity: 0.55,
                      }}
                    >
                      <YouTubeMusicIcon size={14} />
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', marginLeft: 5 }}>Vybe Music</Text>
                    </View>
                  </View>
                </Animated.View>
              ) : ytInlineVault ? (
                <Animated.View
                  style={[ARTWORK_STATIC_STYLE, {
                    shadowColor: MACHINED_BLUE,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.92,
                    shadowRadius: 34,
                    elevation: 26,
                    borderRadius: ARTWORK_OUTER_RADIUS,
                    borderWidth: 1,
                    borderColor: ARTWORK_EDGE,
                    overflow: 'hidden',
                  }]}
                >
                  <YouTubeInlinePlayer videoId={ytVideoId} artworkUri={currentTrack.artwork} isPlaying={isPlaying} />
                </Animated.View>
              ) : isSoundCloud ? (
                <Animated.View
                  style={[ARTWORK_STATIC_STYLE, {
                    shadowColor: MACHINED_BLUE,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.92,
                    shadowRadius: 34,
                    elevation: 26,
                    borderRadius: ARTWORK_OUTER_RADIUS,
                    borderWidth: 1,
                    borderColor: ARTWORK_EDGE,
                  }]}
                >
                  <View style={{ width: ARTWORK_SIZE, height: ARTWORK_SIZE, borderRadius: ARTWORK_INNER_RADIUS, overflow: 'hidden' }}>
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
                        backgroundColor: 'rgba(0,0,0,0.38)',
                        borderRadius: 20,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        opacity: 0.52,
                      }}
                    >
                      <SoundCloudIcon size={14} />
                      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600', marginLeft: 5 }}>Vybe Waves</Text>
                    </View>
                  </View>
                </Animated.View>
              ) : (
                <Animated.View
                  style={[ARTWORK_STATIC_STYLE, {
                    shadowColor: MACHINED_BLUE,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.9,
                    shadowRadius: 32,
                    elevation: 22,
                    borderRadius: ARTWORK_OUTER_RADIUS,
                    borderWidth: 1,
                    borderColor: ARTWORK_EDGE,
                    overflow: 'visible',
                  }]}
                >
                  <Image
                    source={{ uri: currentTrack.artwork }}
                    style={{ width: ARTWORK_SIZE, height: ARTWORK_SIZE, borderRadius: ARTWORK_INNER_RADIUS }}
                    contentFit="cover"
                  />
                </Animated.View>
              )}
              {showYoutubeStreamSkeleton ? (
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFillObject,
                    {
                      borderRadius: ARTWORK_OUTER_RADIUS,
                      backgroundColor: 'rgba(0,0,0,0.45)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                  ]}
                >
                  <LoadingRing
                    size={52}
                    color="#FF0000"
                    trackColor="rgba(255,255,255,0.12)"
                    strokeWidth={3}
                  />
                  <Text
                    style={{
                      marginTop: 14,
                      color: 'rgba(255,255,255,0.78)',
                      fontSize: 13,
                      fontWeight: '600',
                      letterSpacing: 0.3,
                    }}
                  >
                    Loading stream…
                  </Text>
                </View>
              ) : null}
              </View>
            </View>

            {/* Track Info */}
            <Animated.View
              style={[INFO_STATIC_STYLE, { paddingHorizontal: 28, marginTop: sheetLayout ? 26 : 20 }]}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 mr-4">
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {isLiveRadio ? (
                      <Animated.View
                        style={[
                          {
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderRadius: 6,
                            backgroundColor: 'rgba(255,0,212,0.22)',
                            borderWidth: StyleSheet.hairlineWidth,
                            borderColor: 'rgba(255,0,212,0.55)',
                          },
                          liveBadgeOpacityStyle,
                        ]}
                      >
                        <Text
                          style={{
                            color: '#FF00D4',
                            fontSize: 11,
                            fontWeight: '900',
                            letterSpacing: 1.2,
                          }}
                        >
                          LIVE
                        </Text>
                      </Animated.View>
                    ) : null}
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[nowPlayingTypography.title, { flex: 1, minWidth: 0 }]}
                    >
                      {currentTrack.title}
                    </Text>
                  </View>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={nowPlayingTypography.artist}>
                    {currentTrack.artist}
                  </Text>
                  {isLiveRadio ? (
                    <View style={{ marginTop: 14, alignSelf: 'flex-start' }}>
                      <RadioParadiseSoulActions layout="full" />
                    </View>
                  ) : null}
                </View>
                <View className="flex-row items-center gap-2">
                  <DownloadButton track={currentTrack} size={28} />
                  <Pressable
                    onPress={() => {
                      // Every Fire tap (light or unlight) gets the full reward —
                      // heavy haptic + bloom + DI flare. The visual state then
                      // toggles via likedSongs as the underlying "Fired" tag.
                      runFireRewardAnimation();
                      toggleLike(currentTrack.id, currentTrack);
                    }}
                    className="p-2"
                    accessibilityRole="button"
                    accessibilityLabel={isFired ? 'Unfire' : 'Fire'}
                  >
                    <View style={npFireStyles.fireHitArea}>
                      {LIKE_BURST_PARTICLE_ANGLES.map((angle, idx) => {
                        const dx = Math.cos(angle) * LIKE_BURST_DISTANCE;
                        const dy = Math.sin(angle) * LIKE_BURST_DISTANCE;
                        return (
                          <RNAnimated.View
                            key={`fire-particle-${idx}`}
                            style={[
                              npFireStyles.fireParticle,
                              {
                                opacity: fireBurstDriver.interpolate({
                                  inputRange: [0, 0.08, 1],
                                  outputRange: [0, 1, 0],
                                }),
                                transform: [
                                  {
                                    translateX: fireBurstDriver.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [0, dx],
                                    }),
                                  },
                                  {
                                    translateY: fireBurstDriver.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: [0, dy],
                                    }),
                                  },
                                  {
                                    rotate: fireBurstDriver.interpolate({
                                      inputRange: [0, 1],
                                      outputRange: ['0deg', '90deg'],
                                    }),
                                  },
                                ],
                              },
                            ]}
                          />
                        );
                      })}
                      <RNAnimated.View
                        pointerEvents="none"
                        style={[
                          npFireStyles.fireBurstRing,
                          {
                            opacity: fireRingOpacity,
                            transform: [{ scale: fireRingScale }],
                            left: LIKE_HEART_CONTAINER / 2 - 15,
                            top: LIKE_HEART_CONTAINER / 2 - 15,
                          },
                        ]}
                      />
                      <View
                        style={[
                          npFireStyles.fireShadowHost,
                          isFired && npFireStyles.fireShadowHostActive,
                        ]}
                      >
                        <RNAnimated.View style={{ transform: [{ scale: fireScale }] }}>
                          <Flame
                            size={28}
                            color={isFired ? FIRE_ORANGE : '#fff'}
                            fill={isFired ? FIRE_ORANGE : 'transparent'}
                            strokeWidth={2.2}
                          />
                        </RNAnimated.View>
                      </View>
                    </View>
                  </Pressable>
                </View>
              </View>

              <View style={{ marginBottom: sheetLayout ? 100 : 0 }}>
                <NowPlayingScrubberRow />

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

                  <View style={{ width: 88, height: 88, alignItems: 'center', justifyContent: 'center' }}>
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        {
                          position: 'absolute',
                          width: 90,
                          height: 90,
                          borderRadius: 45,
                          borderWidth: 0,
                          backgroundColor: 'transparent',
                          shadowColor: MACHINED_BLUE,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.85,
                          shadowRadius: 28,
                          elevation: 0,
                        },
                        playRingPulseStyle,
                      ]}
                    />
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        {
                          position: 'absolute',
                          width: 82,
                          height: 82,
                          borderRadius: 41,
                          borderWidth: 2.5,
                          borderColor: MACHINED_BLUE,
                          shadowColor: MACHINED_BLUE,
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 1,
                          shadowRadius: 26,
                          elevation: 18,
                        },
                        playRingPulseStyle,
                      ]}
                    />
                    <AnimatedPressable
                      onPress={handlePlayPause}
                      onPressIn={() => { playScale.value = withSpring(0.92); }}
                      onPressOut={() => { playScale.value = withSpring(1); }}
                      style={playButtonStyle}
                      disabled={isPlayButtonBusy}
                    >
                      <View
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 36,
                          backgroundColor: isError ? '#DC2626' : '#FFFFFF',
                          borderWidth: 0,
                          alignItems: 'center',
                          justifyContent: 'center',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.35,
                          shadowRadius: 10,
                          elevation: 10,
                        }}
                      >
                        {isPlayButtonBusy ? (
                          <LoadingRing
                            size={44}
                            color={isYouTube || isYouTubeMusic ? '#FF0000' : isSoundCloud ? '#FF7700' : MACHINED_BLUE}
                            trackColor="rgba(10,10,10,0.12)"
                            strokeWidth={3}
                          />
                        ) : isPlaying ? (
                          <Pause size={36} color="#0A0A0A" fill="#0A0A0A" />
                        ) : (
                          <Play size={36} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 4 }} />
                        )}
                      </View>
                    </AnimatedPressable>
                  </View>

                  <Pressable onPress={handleSkip} className="p-3">
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

                {/* Bottom Actions — icon cells share height so Queue / AirPlay / Share stay vertically aligned */}
                <View className="flex-row items-center justify-between mt-6">
                  <Pressable
                    style={nowPlayingChromeStyles.bottomIconCell}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowQueue(true); }}
                  >
                    <ListMusic size={24} color="#fff" />
                  </Pressable>
                  <Pressable
                    style={nowPlayingChromeStyles.bottomIconCell}
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); showRoutePicker(); }}
                  >
                    <Airplay size={22} color="#fff" />
                  </Pressable>
                  <Pressable style={nowPlayingChromeStyles.bottomIconCell} onPress={handleShareTrack}>
                    <Share2 size={24} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          </View>
        </View>
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
    </>
  );

  return (
    <>
    {sheetLayout ? (
      <View style={{ flex: 1 }}>{sheetBody}</View>
    ) : (
      <GestureDetector gesture={panGesture}>
        <Animated.View style={rootStyle}>{sheetBody}</Animated.View>
      </GestureDetector>
    )}

    {/* Queue Sheet */}
    <Modal
      visible={showQueue}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowQueue(false)}
    >
      <View style={{ flex: 1, backgroundColor: '#0D0B08' }}>
        {/* Header — premium dark with gold accent */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(212,175,55,0.15)' }}>
          <Text style={{ color: '#D4AF37', fontSize: 18, fontWeight: '700', letterSpacing: 0.5 }}>Next Up</Text>
          <Pressable onPress={() => setShowQueue(false)} hitSlop={12} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 16, lineHeight: 18 }}>✕</Text>
          </Pressable>
        </View>

        {/* Now Playing row */}
        {currentTrack && (
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 18,
              marginBottom: 16,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(212,175,55,0.1)',
            }}
          >
            <Text style={{ color: '#D4AF37', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>Now Playing</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image source={{ uri: currentTrack.artwork }} style={{ width: 44, height: 44, borderRadius: 6, borderWidth: 2, borderColor: '#D4AF37' }} contentFit="cover" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{currentTrack.title}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{currentTrack.artist}</Text>
              </View>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#8B5CF6' }} />
            </View>
          </View>
        )}

        {/* Up next list + related */}
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 44 }}
          showsVerticalScrollIndicator={false}
        >
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
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    marginHorizontal: 16, marginBottom: 8, padding: 10,
                    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12,
                    borderWidth: 0.5, borderColor: 'rgba(212,175,55,0.3)',
                  }}
                >
                  <Image source={{ uri: track.artwork }} style={{ width: 50, height: 50, borderRadius: 4 }} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{track.title}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{track.artist}</Text>
                  </View>
                  <DownloadButton track={track} size={20} />
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
            <View style={{ alignItems: 'center', marginVertical: 20 }}>
              <LoadingRing size={28} />
            </View>
          ) : null}

          {/* YouTube Music results */}
          {ytRelated.length > 0 ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center', marginRight: 7 }}>
                  <Text style={{ color: '#fff', fontSize: 10, lineHeight: 11 }}>♪</Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>Vybe Music</Text>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={async () => {
                    if (ytDownloadingAll) {
                      // Second tap → cancel
                      cancelBatchRef.current = true;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      return;
                    }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    cancelBatchRef.current = false;
                    setYtDownloadingAll(true);
                    const base = process.env.EXPO_PUBLIC_BACKEND_URL!;
                    try {
                      for (const item of ytRelated) {
                        if (cancelBatchRef.current) break;
                        const id = `yt-${item.videoId}`;
                        if (isTrackDownloaded(id)) continue;
                        const t = {
                          id,
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
                        setBatchActiveId(id);
                        setBatchProgress(0);
                        try { await downloadYouTubeTrack(t, base, (p) => setBatchProgress(p)); } catch {}
                      }
                    } finally {
                      setBatchActiveId(null);
                      setBatchProgress(0);
                      setYtDownloadingAll(false);
                      cancelBatchRef.current = false;
                    }
                  }}
                  style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: ytDownloadingAll ? 'rgba(255,0,0,0.12)' : '#FF0000',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {ytDownloadingAll ? (
                    <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                      <Svg width={28} height={28} style={{ position: 'absolute' }}>
                        <Circle cx={14} cy={14} r={12} stroke="rgba(59,130,246,0.2)" strokeWidth={2.5} fill="none" />
                        <Circle cx={14} cy={14} r={12} stroke="#3B82F6" strokeWidth={2.5} fill="none"
                          strokeDasharray={`${2 * Math.PI * 12}`}
                          strokeDashoffset={2 * Math.PI * 12 * (1 - Math.min(batchProgress, 1))}
                          strokeLinecap="round" rotation="-90" origin="14, 14" />
                      </Svg>
                      <X size={12} color="#3B82F6" strokeWidth={3} />
                    </View>
                  ) : (
                    <Download size={15} color="#fff" strokeWidth={2.5} />
                  )}
                </Pressable>
              </View>
              {ytRelated.map((item) => {
                const id = `yt-${item.videoId}`;
                const t = {
                  id,
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
                const isBatchTarget = batchActiveId === id;
                const pct = Math.round(batchProgress * 100);
                const isDownloaded = isTrackDownloaded(id);
                const row = (
                  <Pressable
                    onPress={() => { playTrack(t, [t]); setShowQueue(false); }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 20,
                      paddingVertical: 9,
                      backgroundColor: isBatchTarget ? 'rgba(255,0,0,0.08)' : '#0A0A0A',
                    }}
                  >
                    <Image source={{ uri: item.thumbnailUrl }} style={{ width: 46, height: 46, borderRadius: 6 }} contentFit="cover" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 }} numberOfLines={1}>{item.channelName}</Text>
                      {isBatchTarget ? (
                        <View style={{ marginTop: 6, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,0,0,0.15)', overflow: 'hidden' }}>
                          <View style={{ height: 3, width: `${Math.max(2, pct)}%`, backgroundColor: '#FF0000' }} />
                        </View>
                      ) : null}
                    </View>
                    <View onStartShouldSetResponder={() => true} style={{ minWidth: 44, alignItems: 'center' }}>
                      {isBatchTarget ? (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,0,0,0.15)' }}>
                          <Text style={{ color: '#FF0000', fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
                        </View>
                      ) : (
                        <DownloadButton track={t} size={26} />
                      )}
                    </View>
                  </Pressable>
                );
                return (
                  <ReanimatedSwipeable
                    key={item.videoId}
                    friction={2}
                    rightThreshold={60}
                    onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                    renderRightActions={(progress) => (
                      <SwipeActions
                        progress={progress}
                        onQueue={() => {
                          addToQueue(t);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }}
                        onDelete={
                          isDownloaded
                            ? () => {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                removeDownload(id);
                              }
                            : undefined
                        }
                      />
                    )}
                  >
                    {row}
                  </ReanimatedSwipeable>
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
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }}>Vybe Waves</Text>
                <View style={{ flex: 1 }} />
                <Pressable
                  onPress={async () => {
                    if (scDownloadingAll) {
                      cancelBatchRef.current = true;
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      return;
                    }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    cancelBatchRef.current = false;
                    setScDownloadingAll(true);
                    const base = process.env.EXPO_PUBLIC_BACKEND_URL!;
                    try {
                      for (const item of scRelated) {
                        if (cancelBatchRef.current) break;
                        const id = `sc-${item.trackId}`;
                        if (isTrackDownloaded(id)) continue;
                        const t = {
                          id,
                          title: item.title,
                          artist: item.artist,
                          artwork: item.artwork,
                          duration: item.duration,
                          artistId: '', album: '', albumId: '', isLiked: false,
                          source: 'soundcloud' as const,
                          soundcloudUrl: item.soundcloudUrl,
                          audioUrl: item.soundcloudUrl,
                        };
                        setBatchActiveId(id);
                        setBatchProgress(0);
                        try { await downloadSoundCloudTrack(t, base, (p) => setBatchProgress(p)); } catch {}
                      }
                    } finally {
                      setBatchActiveId(null);
                      setBatchProgress(0);
                      setScDownloadingAll(false);
                      cancelBatchRef.current = false;
                    }
                  }}
                  style={{
                    width: 32, height: 32, borderRadius: 16,
                    backgroundColor: scDownloadingAll ? 'rgba(255,85,0,0.12)' : '#FF5500',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {scDownloadingAll ? (
                    <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                      <Svg width={28} height={28} style={{ position: 'absolute' }}>
                        <Circle cx={14} cy={14} r={12} stroke="rgba(59,130,246,0.2)" strokeWidth={2.5} fill="none" />
                        <Circle cx={14} cy={14} r={12} stroke="#3B82F6" strokeWidth={2.5} fill="none"
                          strokeDasharray={`${2 * Math.PI * 12}`}
                          strokeDashoffset={2 * Math.PI * 12 * (1 - Math.min(batchProgress, 1))}
                          strokeLinecap="round" rotation="-90" origin="14, 14" />
                      </Svg>
                      <X size={12} color="#3B82F6" strokeWidth={3} />
                    </View>
                  ) : (
                    <Download size={15} color="#fff" strokeWidth={2.5} />
                  )}
                </Pressable>
              </View>
              {scRelated.map((item) => {
                const id = `sc-${item.trackId}`;
                const t = {
                  id,
                  title: item.title,
                  artist: item.artist,
                  artwork: item.artwork,
                  duration: item.duration,
                  artistId: '', album: '', albumId: '', isLiked: false,
                  source: 'soundcloud' as const,
                  soundcloudUrl: item.soundcloudUrl,
                  audioUrl: item.soundcloudUrl,
                };
                const isBatchTarget = batchActiveId === id;
                const pct = Math.round(batchProgress * 100);
                const isDownloaded = isTrackDownloaded(id);
                const row = (
                  <Pressable
                    onPress={() => { playTrack(t, [t]); setShowQueue(false); }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 20,
                      paddingVertical: 9,
                      backgroundColor: isBatchTarget ? 'rgba(255,85,0,0.08)' : '#0A0A0A',
                    }}
                  >
                    <Image source={{ uri: item.artwork }} style={{ width: 46, height: 46, borderRadius: 6 }} contentFit="cover" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 }} numberOfLines={1}>{item.artist}</Text>
                      {isBatchTarget ? (
                        <View style={{ marginTop: 6, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,85,0,0.15)', overflow: 'hidden' }}>
                          <View style={{ height: 3, width: `${Math.max(2, pct)}%`, backgroundColor: '#FF5500' }} />
                        </View>
                      ) : null}
                    </View>
                    <View onStartShouldSetResponder={() => true} style={{ minWidth: 44, alignItems: 'center' }}>
                      {isBatchTarget ? (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(255,85,0,0.15)' }}>
                          <Text style={{ color: '#FF5500', fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
                        </View>
                      ) : (
                        <DownloadButton track={t} size={26} />
                      )}
                    </View>
                  </Pressable>
                );
                return (
                  <ReanimatedSwipeable
                    key={item.trackId}
                    friction={2}
                    rightThreshold={60}
                    onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
                    renderRightActions={(progress) => (
                      <SwipeActions
                        progress={progress}
                        onQueue={() => {
                          addToQueue(t);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }}
                        onDelete={
                          isDownloaded
                            ? () => {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                                removeDownload(id);
                              }
                            : undefined
                        }
                      />
                    )}
                  >
                    {row}
                  </ReanimatedSwipeable>
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

export default function NowPlayingRouteScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <NowPlayingScreenContent />
    </View>
  );
}
