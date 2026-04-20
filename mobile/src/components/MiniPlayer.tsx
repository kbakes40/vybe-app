import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Platform, Pressable as RNPressable } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedProps,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  interpolate,
  interpolateColor,
  Extrapolation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { Svg, Rect } from 'react-native-svg';
import { Play, Pause, SkipForward, Disc3 } from 'lucide-react-native';
import { MachinedCloudIcon } from '@/components/MachinedCloudIcon';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { usePlaybackController } from '@/stores/playbackController';
import { ensurePlaybackHydratedFromStorage } from '@/lib/storage';
import { useKeyboardChromeStore } from '@/stores/keyboardChromeStore';
import { openNowPlayingSheet } from '@/lib/openNowPlayingSheet';
import { Track } from '@/types/music';
import { downloadYouTubeTrack, downloadSoundCloudTrack, useDownloadsStore } from '@/stores/downloadsStore';
import { usePlaybackDebugStore } from '@/stores/playbackDebugStore';
import { useNowPlayingSheetStore } from '@/stores/nowPlayingSheetStore';
import { sheetProgressSV } from '@/stores/nowPlayingSheetProgress';
import { PlaybackDebugIndicator } from '@/components/PlaybackDebugOverlay';
import { LoadingRing } from '@/components/LoadingRing';
import * as Haptics from 'expo-haptics';
import { MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT } from '@/constants/Layout';
import { useThemeStore } from '@/stores/themeStore';
import { usePillLockStore } from '@/stores/pillLockStore';
import { hexToRgb } from '@/lib/themeColorUtils';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const ICON_STROKE = 1.35;

const PLACEHOLDER_ARTWORK =
  'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=128&h=128&fit=crop&q=60';

function MiniPlayerSlimProgress() {
  const accent = useThemeStore((s) => s.accentColor);
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
    <View style={styles.progressTrack} onLayout={onLayout} pointerEvents="none">
      {svgW > 0 ? (
        <Svg width={svgW} height={2}>
          <Rect x={0} y={0} width={svgW} height={2} fill="rgba(255,255,255,0.08)" />
          <AnimatedRect x={0} y={0} height={2} fill={accent} animatedProps={animatedProps} />
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

function MiniPlayerInner({ bottomLift }: MiniPlayerProps) {
  const hasUser = usePillLockStore((s) => s.hasUser);
  const insets = useSafeAreaInsets();
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
    simulateVaultFailure,
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
      simulateVaultFailure: s.simulateVaultFailure,
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
  /** 0 → resting Machined-Blue border; 1 → full bloom (glow + tint). */
  const bloomSV = useSharedValue(0);
  /** 1 → resting size; spring pop on track change using stiffness 200 / damping 20. */
  const cardScaleSV = useSharedValue(1);
  /** 0.35 → 1 pulse while `isPlaying`; parks at 0.35 when paused / idle. */
  const heartbeatSV = useSharedValue(0.35);
  /** 0 → hidden; 1 → POWERED_BY_DAVINCI subtext visible (fades in after track bloom settles). */
  const davinciSubSV = useSharedValue(0);

  const accentHex = useThemeStore((s) => s.accentColor);
  const accentR = useSharedValue(0);
  const accentG = useSharedValue(255);
  const accentB = useSharedValue(255);

  useEffect(() => {
    const { r, g, b } = hexToRgb(accentHex);
    accentR.value = r;
    accentG.value = g;
    accentB.value = b;
  }, [accentHex, accentR, accentG, accentB]);

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

  // Track-change "Shadow Sexy" sequence: light haptic → spring pop →
  // Machined-Blue glow bloom on the card border → settle. Spring physics
  // (stiffness 200, damping 20) give the mechanical-snap feel without the
  // cartoon bounce of default easings.
  useEffect(() => {
    if (!meta.hasRealTrack) {
      bloomSV.value = withTiming(0, { duration: 220 });
      davinciSubSV.value = withTiming(0, { duration: 220 });
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cardScaleSV.value = withSequence(
      withSpring(1.018, { stiffness: 200, damping: 20, mass: 0.7 }),
      withSpring(1, { stiffness: 200, damping: 20, mass: 0.7 }),
    );
    bloomSV.value = withSequence(
      withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 840, easing: Easing.inOut(Easing.quad) }),
    );
    davinciSubSV.value = withDelay(220, withTiming(1, { duration: 520 }));
  }, [meta.id, meta.hasRealTrack]);

  // Magenta heartbeat: pulses only while playing, parks at resting opacity
  // when paused. Matches Dynamic Island physics so the two bars feel tied.
  useEffect(() => {
    if (isPlaying) {
      heartbeatSV.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 520 }),
          withTiming(0.35, { duration: 620 }),
        ),
        -1,
        true,
      );
    } else {
      heartbeatSV.value = withTiming(0.35, { duration: 280 });
    }
  }, [isPlaying]);

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

  /** Tap-to-expand is handled by a full-bleed `RNPressable` behind controls (see `cardSurface`). */
  const miniCardGesture = Gesture.Exclusive(tripleTapDebugGesture, panGesture);

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
    transform: [
      { translateX: dragX.value },
      { translateY: translateY.value },
      { scale: cardScaleSV.value },
    ],
  }));

  /** Border tint + iOS glow radius interpolated off `bloomSV`. */
  const bloomBorderStyle = useAnimatedStyle(() => {
    const machined = `rgb(${Math.round(accentR.value)}, ${Math.round(accentG.value)}, ${Math.round(accentB.value)})`;
    return {
      borderColor: interpolateColor(bloomSV.value, [0, 1], ['rgba(255,255,255,0.08)', machined]),
      shadowColor: machined,
      shadowOpacity: bloomSV.value * 0.75,
      shadowRadius: 4 + bloomSV.value * 14,
    };
  });

  const heartbeatAnimatedStyle = useAnimatedStyle(() => ({
    opacity: heartbeatSV.value,
    transform: [{ scale: 0.85 + heartbeatSV.value * 0.25 }],
  }));

  const davinciSubAnimatedStyle = useAnimatedStyle(() => ({
    opacity: davinciSubSV.value * 0.9,
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
      <View style={styles.content} pointerEvents="box-none">
        <View style={styles.artworkContainer} pointerEvents="none">
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
        </View>

        <View style={styles.trackInfo} pointerEvents="none">
          <View style={styles.titleRow}>
            <Text style={styles.trackTitle} numberOfLines={1} ellipsizeMode="tail">
              {meta.title}
            </Text>
            {meta.hasRealTrack ? (
              <Animated.View style={[styles.heartbeatDot, heartbeatAnimatedStyle]} />
            ) : null}
          </View>
          <Text style={styles.artistName} numberOfLines={1} ellipsizeMode="tail">
            {meta.artist}
          </Text>
        </View>

        {showDownload && (
          <GestureDetector gesture={downloadTapGesture}>
            <Animated.View
              style={[styles.controlButton, styles.controlHit, { opacity: isImporting ? 0.4 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Import to Vault"
            >
              <MachinedCloudIcon size={19} strokeWidth={ICON_STROKE} disabled={isImporting} />
            </Animated.View>
          </GestureDetector>
        )}

        <GestureDetector gesture={playPauseTapGesture}>
          <Animated.View style={[styles.controlButton, styles.controlHit, buttonAnimatedStyle]}>
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
          <View style={[styles.controlButton, styles.controlHit]}>
            <SkipForward size={21} color="#FFFFFF" strokeWidth={ICON_STROKE} fill="transparent" />
          </View>
        </GestureDetector>
      </View>

      <MiniPlayerSlimProgress />
    </>
  );

  /** Solid chrome (#000) matches tab bar — Animated.View so the track-change bloom can tint the border. */
  const cardSurface = (
    <Animated.View style={[styles.cardSurface, bloomBorderStyle]}>
      <RNPressable
        accessibilityRole="button"
        accessibilityLabel="Expand now playing"
        onPress={navigateToNowPlaying}
        style={styles.expandHitTarget}
        disabled={!meta.hasRealTrack}
        hitSlop={0}
      />
      <View style={styles.cardForeground} pointerEvents="box-none">
      {cardBody}
      </View>
      {meta.hasRealTrack ? (
        // Hidden DEV FAIL-SAFE — long-press fires `simulateVaultFailure` so QA
        // can verify the SHADOW_HEALING → SoundCloud transition without waiting
        // for an actually blocked Video ID. Stays invisible to a11y.
        <Pressable
          onLongPress={() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            void simulateVaultFailure();
          }}
          delayLongPress={650}
          hitSlop={8}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.Text
            numberOfLines={1}
            style={[styles.davinciSubtext, davinciSubAnimatedStyle]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            POWERED_BY_DAVINCI
          </Animated.Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );

  /** Pin above tab chrome: tab bar height + home indicator when parent passes tab-aware lift; else stack insets. */
  const dockBottom =
    bottomLift >= TAB_BAR_HEIGHT ? TAB_BAR_HEIGHT + insets.bottom : bottomLift;

  /**
   * Google Music cross-fade: mini reads the sheet's progress shared value every frame.
   * - Progress 0 (collapsed)   → opacity 1 (fully visible above tab bar)
   * - Progress 0.35 (mid drag) → opacity 0.12 (quick dip so the sheet reads as taking over)
   * - Progress ~1 (expanded)   → opacity 0 (hidden behind the full player)
   */
  const sheetFadeStyle = useAnimatedStyle(() => {
    if (!meta.hasRealTrack) return { opacity: 1 };
    return {
      opacity: interpolate(
        sheetProgressSV.value,
        [0, 0.1, 0.65, 1],
        [1, 1, 0.12, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  if (!hasUser) return null;

  return (
    <Animated.View
      pointerEvents={keyboardVisible || sheetExpanded ? 'none' : 'auto'}
      style={[styles.container, { bottom: dockBottom }, sheetFadeStyle, kbHiddenStyle]}
    >
      <GestureDetector gesture={miniCardGesture}>
        <View style={styles.shadowHost}>
          <Animated.View style={containerAnimatedStyle}>{cardSurface}</Animated.View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

/**
 * Memoized for tab-switch perf: MiniPlayer re-renders only when its single prop
 * `bottomLift` actually changes; track state lives in zustand selectors inside
 * the component so those drive re-renders independently.
 */
export const MiniPlayer = React.memo(MiniPlayerInner);

const styles = StyleSheet.create({
  /** Root chrome only — never put `pointerEvents` here; it is not a valid style key. */
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: MINI_PLAYER_HEIGHT,
    zIndex: 9999,
    // 1px OLED Black bottom border keeps the baby-blue progress bar from
    // bleeding into the tab bar — pairs with the tab bar's 1px black top
    // border to create a sharp "Machined" seam.
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    ...Platform.select({
      android: { elevation: 9999 },
      default: {},
    }),
  },
  expandHitTarget: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  cardForeground: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  controlHit: {
    zIndex: 2,
  },
  cardSurface: {
    height: MINI_PLAYER_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 0 },
      },
      default: {},
    }),
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
    flex: 1,
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
    marginLeft: 10,
    marginRight: 4,
    minWidth: 0,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  heartbeatDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 8,
    backgroundColor: '#FF00D4',
    shadowColor: '#FF00D4',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  davinciSubtext: {
    position: 'absolute',
    right: 14,
    bottom: 4,
    color: 'rgba(103,232,249,0.42)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
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
