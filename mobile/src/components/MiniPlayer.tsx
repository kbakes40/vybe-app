import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Platform, Pressable } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedProps,
  withSpring,
  withTiming,
  withRepeat,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { Svg, Rect } from 'react-native-svg';
import { Play, Pause, SkipForward, Disc3, CloudDownload } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { usePlaybackController } from '@/stores/playbackController';
import { ensurePlaybackHydratedFromStorage } from '@/lib/storage';
import { useKeyboardChromeStore } from '@/stores/keyboardChromeStore';
import { openNowPlayingSheet } from '@/lib/openNowPlayingSheet';
import { Track } from '@/types/music';
import { downloadYouTubeTrack, downloadSoundCloudTrack, useDownloadsStore } from '@/stores/downloadsStore';
import { usePlaybackDebugStore } from '@/stores/playbackDebugStore';
import { useNowPlayingSheetStore } from '@/stores/nowPlayingSheetStore';
import { PlaybackDebugIndicator } from '@/components/PlaybackDebugOverlay';
import { LoadingRing } from '@/components/LoadingRing';
import * as Haptics from 'expo-haptics';
import { MINI_PLAYER_HEIGHT } from '@/constants/Layout';
import { VybeVideoNeonIcon, VybeMusicNeonIcon, VybeWavesNeonIcon } from '@/assets/icons';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const ICON_STROKE = 1.35;

const PLACEHOLDER_ARTWORK =
  'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=128&h=128&fit=crop&q=60';

function MiniPlayerSlimProgress() {
  const layoutW = useSharedValue(0);
  const frac = useSharedValue(0);
  const [svgW, setSvgW] = useState(0);

  useEffect(() => {
    return usePlaybackController.subscribe((state, prev) => {
      if (state.progress === prev.progress && state.duration === prev.duration) return;
      const f = state.duration > 0 ? Math.min(1, state.progress / state.duration) : 0;
      const prevF = prev.duration > 0 ? Math.min(1, prev.progress / prev.duration) : 0;
      const jumpSec = Math.abs(state.progress - prev.progress);
      if (jumpSec > 1 || Math.abs(f - prevF) > 0.04 || state.duration !== prev.duration) {
        frac.value = f;
      } else {
        frac.value = withTiming(f, { duration: 120 });
      }
    });
  }, []);

  const animatedProps = useAnimatedProps(() => ({
    width: Math.max(0, layoutW.value * frac.value),
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    layoutW.value = w;
    if (w > 0 && w !== svgW) setSvgW(w);
  };

  return (
    <View style={styles.progressTrack} onLayout={onLayout}>
      {svgW > 0 ? (
        <Svg width={svgW} height={2}>
          <Rect x={0} y={0} width={svgW} height={2} fill="rgba(255,255,255,0.08)" />
          <AnimatedRect x={0} y={0} height={2} fill="#FFFFFF" animatedProps={animatedProps} />
        </Svg>
      ) : null}
    </View>
  );
}

type MiniPlayerProps = {
  /**
   * Offset from the bottom of the sheet to the mini strip. On tab routes this should be
   * `TAB_BAR_HEIGHT + insets.bottom` from `@/constants/Layout` / safe area; on stack routes, `insets.bottom` only.
   */
  bottomLift: number;
};

export function MiniPlayer({ bottomLift }: MiniPlayerProps) {
  const sheetExpanded = useNowPlayingSheetStore((s) => s.isExpanded);
  const keyboardVisible = useKeyboardChromeStore((s) => s.keyboardVisible);
  const kbHiddenStyle = keyboardVisible
    ? { opacity: 0, height: 0, overflow: 'hidden' as const }
    : {};

  const [, forceMetaRender] = useReducer((n: number) => n + 1, 0);

  const {
    currentTrack,
    playbackState,
    playbackRevision,
    currentSource,
    play,
    pause,
    next,
    previous,
  } = usePlaybackController(
    useShallow((s) => ({
      currentTrack: s.currentTrack,
      playbackState: s.playbackState,
      playbackRevision: s.playbackRevision,
      currentSource: s.currentSource,
      play: s.play,
      pause: s.pause,
      next: s.next,
      previous: s.previous,
    })),
  );

  useEffect(() => {
    ensurePlaybackHydratedFromStorage();
  }, []);

  useEffect(
    () =>
      usePlaybackController.subscribe((state, prev) => {
        if (
          state.currentTrack?.id !== prev.currentTrack?.id ||
          state.playbackRevision !== prev.playbackRevision ||
          state.currentTrack?.title !== prev.currentTrack?.title ||
          state.currentTrack?.artist !== prev.currentTrack?.artist ||
          state.currentTrack?.artwork !== prev.currentTrack?.artwork
        ) {
          forceMetaRender();
        }
      }),
    [],
  );

  const meta = useMemo(() => {
    const t = currentTrack;
    const id = t?.id ?? '';
    const title = (t?.title?.trim() || 'Not Playing').trim();
    const artist = (t?.artist?.trim() || 'Vybe System').trim();
    const rawArt = t?.artwork?.trim();
    const artworkUri = rawArt && rawArt.length > 0 ? rawArt : PLACEHOLDER_ARTWORK;
    return { id, title, artist, artworkUri, hasRealTrack: !!t };
  }, [currentTrack, playbackRevision]);

  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);
  const isImporting = useDownloadsStore(s => s.isImporting);

  const debugModeEnabled = usePlaybackDebugStore(s => s.debugModeEnabled);
  const toggleDebugOverlay = usePlaybackDebugStore(s => s.toggleDebugOverlay);

  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);

  const isPlaying = playbackState === 'playing';
  const shouldPause = playbackState === 'playing' || playbackState === 'buffering' || playbackState === 'loading';
  const isLoading = playbackState === 'loading' || playbackState === 'buffering';

  const isYouTube = currentSource === 'youtube';
  const isYouTubeMusic = currentSource === 'youtube_music';
  const isSoundCloud = currentSource === 'soundcloud';

  const buttonScale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const dragX = useSharedValue(0);
  const loadingRotation = useSharedValue(0);

  useEffect(() => {
    if (isLoading) {
      loadingRotation.value = 0;
      loadingRotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      loadingRotation.value = 0;
    }
  }, [isLoading]);

  useEffect(() => {
    if (!currentTrack) return;
    dragX.value = 0;
    translateY.value = 0;
    buttonScale.value = 1;
  }, [currentTrack?.id, playbackRevision]);

  const navigateToNowPlaying = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    openNowPlayingSheet();
  };

  const handleTripleTap = () => {
    const now = Date.now();
    if (now - lastTapTimeRef.current > 500) {
      tapCountRef.current = 1;
    } else {
      tapCountRef.current++;
    }
    lastTapTimeRef.current = now;
    if (tapCountRef.current >= 3 && debugModeEnabled) {
      tapCountRef.current = 0;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toggleDebugOverlay();
    }
  };

  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (shouldPause) pause();
    else play();
  };

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    next();
  };

  const skipNextFromSwipe = () => {
    Haptics.selectionAsync();
    next();
  };

  const skipPreviousFromSwipe = () => {
    Haptics.selectionAsync();
    previous();
  };

  const handleDownload = async () => {
    if (!meta.hasRealTrack || !currentTrack || isImporting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL!;
    const sc = (currentTrack as Track & { soundcloudUrl?: string }).soundcloudUrl;
    if (sc) {
      await downloadSoundCloudTrack(currentTrack as Track & { soundcloudUrl: string }, BACKEND_URL);
    } else {
      await downloadYouTubeTrack(currentTrack as Track & { youtubeId?: string; youtubeMusicId?: string }, BACKEND_URL);
    }
  };

  const tripleTapDebugGesture = Gesture.Tap()
    .numberOfTaps(3)
    .onEnd(() => {
      runOnJS(handleTripleTap)();
    });

  const tapOpenGesture = Gesture.Tap().onEnd(() => {
    runOnJS(navigateToNowPlaying)();
  });

  const panGesture = Gesture.Pan()
    .minDistance(12)
    .onUpdate((event) => {
      const ax = Math.abs(event.translationX);
      const ay = Math.abs(event.translationY);
      if (ax > ay + 2) {
        dragX.value = event.translationX * 0.28;
      } else if (event.translationY < 0) {
        translateY.value = Math.max(event.translationY, -44);
      }
    })
    .onEnd((event) => {
      const { translationX, translationY, velocityX, velocityY } = event;
      const ax = Math.abs(translationX);
      const ay = Math.abs(translationY);

      if (ax > ay && ax > 22) {
        if (translationX < -44 || velocityX < -420) {
          runOnJS(skipNextFromSwipe)();
        } else if (translationX > 44 || velocityX > 420) {
          runOnJS(skipPreviousFromSwipe)();
        }
        dragX.value = withSpring(0, { damping: 18, stiffness: 240 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 400 });
        return;
      }

      if (translationY < -30 || velocityY < -480) {
        runOnJS(navigateToNowPlaying)();
        dragX.value = withSpring(0, { damping: 18, stiffness: 240 });
        translateY.value = withSpring(0, { damping: 20, stiffness: 400 });
        return;
      }

      dragX.value = withSpring(0, { damping: 18, stiffness: 240 });
      translateY.value = withSpring(0, { damping: 20, stiffness: 400 });
    });

  const miniCardGesture = Gesture.Exclusive(
    tripleTapDebugGesture,
    Gesture.Race(tapOpenGesture, panGesture),
  );

  const showDownload =
    meta.hasRealTrack &&
    currentTrack &&
    (isYouTube || isYouTubeMusic) &&
    !isTrackDownloaded(currentTrack.id);

  const playPauseTapGesture = Gesture.Tap()
    .onStart(() => {
      buttonScale.value = withSpring(0.88, { damping: 15 });
    })
    .onEnd(() => {
      runOnJS(handlePlayPause)();
    })
    .onFinalize(() => {
      buttonScale.value = withSpring(1, { damping: 15 });
    });

  const nextTapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(handleNext)();
  });

  const downloadTapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(handleDownload)();
  });

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }, { translateY: translateY.value }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const loadingAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${loadingRotation.value}deg` }],
  }));

  const playingFromLocalFile =
    meta.hasRealTrack && !!currentTrack?.audioUrl?.startsWith('file://');

  const cardBody = (
    <>
      <View style={styles.content}>
        <View style={styles.artworkContainer}>
          <View style={styles.artworkShadowHost}>
            <ShadowArtworkImage
              key={`${meta.id}-${playbackRevision}-${meta.artworkUri}`}
              recyclingKey={meta.id || 'vybe-mini-placeholder'}
              source={{ uri: meta.artworkUri }}
              style={styles.artwork}
              contentFit="cover"
            />
          </View>
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <Animated.View style={loadingAnimatedStyle}>
                <Disc3 size={18} color="#fff" style={{ opacity: 0.9 }} />
              </Animated.View>
            </View>
          )}
          {playingFromLocalFile ? (
            <View
              style={styles.localSyncedDot}
              accessibilityLabel="Synced"
              accessibilityHint="Playing from device cache"
            />
          ) : null}
          {!playingFromLocalFile && (isYouTube || isYouTubeMusic || isSoundCloud) ? (
            <View style={styles.sourceNeonBadge} pointerEvents="none">
              {isYouTube ? (
                <VybeVideoNeonIcon size={12} />
              ) : isYouTubeMusic ? (
                <VybeMusicNeonIcon size={12} />
              ) : (
                <VybeWavesNeonIcon size={12} />
              )}
            </View>
          ) : null}
        </View>

        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="tail">
            {meta.title}
          </Text>
          <Text style={styles.artistName} numberOfLines={1} ellipsizeMode="tail">
            {meta.artist}
          </Text>
        </View>

        <View style={styles.controlsRail}>
          {showDownload && (
            <GestureDetector gesture={downloadTapGesture}>
              <Animated.View
                style={[styles.controlButton, { opacity: isImporting ? 0.4 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Import to Vault"
              >
                <CloudDownload size={19} color="rgba(255,255,255,0.92)" strokeWidth={ICON_STROKE} />
              </Animated.View>
            </GestureDetector>
          )}

          <GestureDetector gesture={playPauseTapGesture}>
            <Animated.View style={[styles.controlButton, buttonAnimatedStyle]}>
              {isLoading ? (
                <LoadingRing
                  size={21}
                  color={isYouTube || isYouTubeMusic ? '#FF0000' : isSoundCloud ? '#FF7700' : '#fff'}
                />
              ) : isPlaying ? (
                <Pause size={21} color="#FFFFFF" strokeWidth={ICON_STROKE} fill="rgba(255,255,255,0.95)" />
              ) : (
                <Play
                  size={21}
                  color="#FFFFFF"
                  strokeWidth={ICON_STROKE}
                  fill="transparent"
                  style={{ marginLeft: 2 }}
                />
              )}
              <PlaybackDebugIndicator />
            </Animated.View>
          </GestureDetector>

          <GestureDetector gesture={nextTapGesture}>
            <View style={styles.controlButton}>
              <SkipForward size={21} color="#FFFFFF" strokeWidth={ICON_STROKE} fill="transparent" />
            </View>
          </GestureDetector>
        </View>
      </View>

      <MiniPlayerSlimProgress />
    </>
  );

  /** Solid chrome (#121212) matches tab bar — blur read as “floating glass” and let list show through. */
  const cardSurface = (
    <View style={styles.cardSurface}>
      {cardBody}
    </View>
  );

  const outerVisibility = meta.hasRealTrack
    ? { display: 'flex' as const, opacity: sheetExpanded ? (0 as const) : (1 as const) }
    : { display: 'flex' as const, opacity: sheetExpanded ? (0 as const) : undefined };

  /** `bottomLift` from AppLayout: tab screens ≈ TAB_BAR_HEIGHT + insets.bottom (− overlap); stack ≈ insets.bottom. */
  return (
    <View
      pointerEvents={keyboardVisible || sheetExpanded ? 'none' : 'auto'}
      style={[styles.container, { bottom: bottomLift }, outerVisibility, kbHiddenStyle]}
    >
      <GestureDetector gesture={miniCardGesture}>
        <View style={styles.shadowHost}>
          <Animated.View style={containerAnimatedStyle}>{cardSurface}</Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Root chrome only — never put `pointerEvents` here; it is not a valid style key. */
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: MINI_PLAYER_HEIGHT,
    zIndex: 9999,
    ...Platform.select({
      android: { elevation: 9999 },
      default: {},
    }),
  },
  cardSurface: {
    height: MINI_PLAYER_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#FFFFFF15',
  },
  shadowHost: {
    borderRadius: 12,
    backgroundColor: '#000000',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 9,
  },
  artworkContainer: {
    position: 'relative',
  },
  artworkShadowHost: {
    borderRadius: 4,
    backgroundColor: '#0A0A0A',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.65,
        shadowRadius: 14,
      },
      android: {
        elevation: 12,
      },
      default: {},
    }),
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceNeonBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    padding: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  localSyncedDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.4)',
    zIndex: 2,
  },
  trackInfo: {
    flex: 1,
    flexShrink: 1,
    marginLeft: 10,
    marginRight: 4,
    minWidth: 0,
    justifyContent: 'center',
  },
  controlsRail: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  artistName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  controlButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 2,
    width: '100%',
  },
});
