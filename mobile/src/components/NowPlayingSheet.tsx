import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { usePlaybackController } from '@/stores/playbackController';
import { useNowPlayingSheetStore } from '@/stores/nowPlayingSheetStore';
import { NowPlayingScreenContent } from '@/app/(app)/nowPlaying';
import { MINI_PLAYER_HEIGHT } from '@/constants/miniPlayer';

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');

/** Top gap between the fully-open sheet and the status bar. */
const SHEET_TOP_GAP = 80;

// ──────────────────────────────────────────────────────────────────────────
// PREVIEW TOGGLE — flip this single constant and Fast-Refresh to compare.
//   'rise' = Option A — gentle bottom-up slide (softened timing)
//   'zoom' = Option C — hero-style scale+translate from the mini-player origin
//
// NOTE: the 'zoom' mode here is a single-surface approximation, not a full
// shared-element transition. A proper Apple-Music hero would require lifting
// the artwork out of NowPlayingScreenContent into its own ghost layer that
// flies between MiniPlayer and the sheet. This preview conveys the feel
// without that refactor.
// ──────────────────────────────────────────────────────────────────────────
const ANIMATION_MODE: 'rise' | 'zoom' = 'zoom';

/** Option A softening: slow the open/close curves by 15%. */
const RISE_TIMING_SLOW_FACTOR = 1.15;

/** Option C physics: stiff spring for the zoom path. */
const ZOOM_SPRING = { stiffness: 200, damping: 20, mass: 1 } as const;
/** Option C: starting scale of the sheet content at the mini-player origin. */
const ZOOM_MINI_SCALE = 0.12;
/** Option C: approximate horizontal center of the mini-player artwork (left-padded icon). */
const ZOOM_MINI_LEFT_PX = 40;
/** Option C: approximate vertical distance from mini-player top to mini-artwork center. */
const ZOOM_MINI_OFFSET_ABOVE_TAB = 32;
/** Option C: content fade bounds — chrome stays partially transparent during the zoom. */
const ZOOM_OPACITY_START = 0.6;
const ZOOM_OPACITY_END = 1.0;

/** Open: gentle ease-out — slower start, soft landing (no snap). */
const EASE_OPEN = Easing.bezier(0.16, 1, 0.22, 1);
/** Close: standard material ease-in */
const EASE_CLOSE = Easing.bezier(0.4, 0, 0.2, 1);

const OPEN_DURATION_CAP = 780;
const OPEN_DURATION_BASE = 400;
const OPEN_DURATION_PER_PX = 0.44;

const CLOSE_DURATION_CAP = 640;
const CLOSE_DURATION_BASE = 280;
const CLOSE_DURATION_PER_PX = 0.5;

function timingForOpen(fromCollapsedY: number) {
  const dist = Math.abs(fromCollapsedY);
  const base = Math.min(OPEN_DURATION_CAP, OPEN_DURATION_BASE + dist * OPEN_DURATION_PER_PX);
  return ANIMATION_MODE === 'rise' ? base * RISE_TIMING_SLOW_FACTOR : base;
}

function timingForClose(remainingPx: number) {
  const base = Math.min(CLOSE_DURATION_CAP, CLOSE_DURATION_BASE + Math.abs(remainingPx) * CLOSE_DURATION_PER_PX);
  return ANIMATION_MODE === 'rise' ? base * RISE_TIMING_SLOW_FACTOR : base;
}

function lightHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

type Props = { miniPlayerBottom: number };

/**
 * Full-screen player sheet: one tall surface anchored to the bottom.
 * translateY 0 = full screen; collapsed = off-screen (mini lives in root `AppLayout`).
 */
export function NowPlayingSheet({ miniPlayerBottom }: Props) {
  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const insets = useSafeAreaInsets();
  /**
   * Sheet content occupies [insets.top + SHEET_TOP_GAP, SCREEN_H - miniPlayerBottom].
   * The mainExpandSlot already reserves miniPlayerBottom via paddingBottom, so
   * maxTranslate (which equals the final reveal height) is the remaining span.
   * Previous versions omitted miniPlayerBottom here, which made the sheet extend
   * nearly to the top of the screen regardless of SHEET_TOP_GAP.
   */
  const maxTranslate = useMemo(
    () => Math.max(0, SCREEN_H - insets.top - SHEET_TOP_GAP - miniPlayerBottom),
    [insets.top, miniPlayerBottom],
  );

  /**
   * Zoom-mode origin: delta from the sheet content center to the mini-player
   * artwork center, in screen coordinates. Used as the closed-state translate.
   */
  const zoomDx = useMemo(() => ZOOM_MINI_LEFT_PX - SCREEN_W / 2, []);
  const zoomDy = useMemo(() => {
    const sheetCenterY = (insets.top + SHEET_TOP_GAP + (SCREEN_H - miniPlayerBottom)) / 2;
    const miniCenterY = SCREEN_H - miniPlayerBottom - ZOOM_MINI_OFFSET_ABOVE_TAB;
    return miniCenterY - sheetCenterY;
  }, [insets.top, miniPlayerBottom]);

  const ty = useSharedValue(maxTranslate);
  const dragStart = useSharedValue(0);
  const lastMaxTranslateRef = useRef(maxTranslate);
  const register = useNowPlayingSheetStore((s) => s.register);
  const setSheetExpanded = useNowPlayingSheetStore((s) => s.setSheetExpanded);
  // When collapsed, the full-player layer must not intercept touches (playlist list stays usable).
  const [mainPointerEvents, setMainPointerEvents] = useState<'auto' | 'none'>(() =>
    maxTranslate > 0 ? 'none' : 'auto',
  );

  const expand = useCallback(() => {
    if (ANIMATION_MODE === 'zoom') {
      ty.value = withSpring(0, ZOOM_SPRING);
      return;
    }
    const d = timingForOpen(ty.value);
    ty.value = withTiming(0, { duration: d, easing: EASE_OPEN });
  }, [ty]);

  const collapse = useCallback(() => {
    if (ANIMATION_MODE === 'zoom') {
      ty.value = withSpring(maxTranslate, ZOOM_SPRING);
      return;
    }
    const d = timingForClose(maxTranslate - ty.value);
    ty.value = withTiming(maxTranslate, { duration: d, easing: EASE_CLOSE });
  }, [ty, maxTranslate]);

  useLayoutEffect(() => {
    register(expand, collapse);
    return () => register(null, null);
  }, [register, expand, collapse]);

  /**
   * When `SCREEN_H` changes (rotation), keep `ty` clamped to the new `maxTranslate`.
   */
  useLayoutEffect(() => {
    const prev = lastMaxTranslateRef.current;
    if (maxTranslate === prev) return;
    lastMaxTranslateRef.current = maxTranslate;
    const y = ty.value;
    if (y > maxTranslate) {
      ty.value = maxTranslate;
      return;
    }
    if (y >= prev - 6) {
      ty.value = maxTranslate;
    }
  }, [maxTranslate, ty]);

  // When idle, snap to collapsed so the next session does not inherit a fully-open translateY.
  // Do not force-collapse when a track appears — that fights playTrack()'s openNowPlayingSheet().
  useEffect(() => {
    if (!currentTrack) {
      ty.value = maxTranslate;
    }
  }, [currentTrack, maxTranslate, ty]);

  useEffect(() => {
    if (maxTranslate <= 0) {
      setMainPointerEvents('auto');
      return;
    }
    setMainPointerEvents(ty.value > maxTranslate * 0.72 ? 'none' : 'auto');
  }, [maxTranslate]);

  useAnimatedReaction(
    () => ({ y: ty.value, m: maxTranslate }),
    (cur, prev) => {
      if (cur.m <= 0) {
        runOnJS(setSheetExpanded)(true);
        return;
      }
      const expanded = cur.y < cur.m * 0.72;
      const prevExpanded =
        prev && prev.m > 0 ? prev.y < prev.m * 0.72 : expanded;
      if (expanded !== prevExpanded) {
        runOnJS(setSheetExpanded)(expanded);
      }
    },
    [maxTranslate],
  );

  useAnimatedReaction(
    () => ty.value,
    (y) => {
      const m = maxTranslate;
      if (m <= 0) {
        runOnJS(setMainPointerEvents)('auto');
        return;
      }
      runOnJS(setMainPointerEvents)(y > m * 0.72 ? 'none' : 'auto');
    },
    [maxTranslate],
  );

  /** Anchor to the window so the sheet overlays content instead of shifting the tab stack. */
  const shellLayoutStyle = {
    position: 'absolute' as const,
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };

  /**
   * Reveal style branches on ANIMATION_MODE:
   *  - 'rise': animated height grows from 0 to maxTranslate (bottom-anchored by
   *    mainRevealOuter's flex-end), radius eases as it opens.
   *  - 'zoom': fixed height at maxTranslate, scale+translate the whole surface
   *    from the mini-player origin into place using the spring on ty.
   */
  const mainRevealStyle = useAnimatedStyle(() => {
    if (maxTranslate <= 0) {
      return {
        flex: 1,
        width: '100%' as const,
        overflow: 'hidden' as const,
      };
    }

    if (ANIMATION_MODE === 'zoom') {
      const p = 1 - ty.value / maxTranslate; // 0 closed → 1 open
      const scale = ZOOM_MINI_SCALE + (1 - ZOOM_MINI_SCALE) * p;
      const tx = zoomDx * (1 - p);
      const ty_ = zoomDy * (1 - p);
      const opacity = ZOOM_OPACITY_START + (ZOOM_OPACITY_END - ZOOM_OPACITY_START) * p;
      return {
        height: maxTranslate,
        width: '100%' as const,
        transform: [{ translateX: tx }, { translateY: ty_ }, { scale }],
        opacity,
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        overflow: 'hidden' as const,
      };
    }

    // 'rise' (Option A)
    const m = maxTranslate;
    const h = interpolate(ty.value, [m, 0], [0, m], Extrapolation.CLAMP);
    const topRadius = interpolate(
      ty.value,
      [m, m * 0.88, m * 0.42, 0],
      [12, 11, 4, 0],
      Extrapolation.CLAMP,
    );
    return {
      height: h,
      borderTopLeftRadius: topRadius,
      borderTopRightRadius: topRadius,
      overflow: 'hidden' as const,
      width: '100%' as const,
    };
  }, [maxTranslate, zoomDx, zoomDy]);

  /**
   * Bottom padding for the reveal viewport.
   *  - 'rise': interpolates an extra MINI_PLAYER_HEIGHT so rising content
   *    reads as "emerging from the mini player."
   *  - 'zoom': constant tab-bar padding — the mini player stays mounted in
   *    the root, and the zoom handles the visual hand-off via transform.
   */
  const expandSlotPadStyle = useAnimatedStyle(() => {
    const m = maxTranslate;
    const tab = miniPlayerBottom;
    if (m <= 0 || ANIMATION_MODE === 'zoom') return { paddingBottom: tab };
    const y = ty.value;
    const miniPad = interpolate(y, [0, m], [0, MINI_PLAYER_HEIGHT], Extrapolation.CLAMP);
    return { paddingBottom: tab + miniPad };
  }, [maxTranslate, miniPlayerBottom]);

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-20, 20])
    .onBegin(() => {
      dragStart.value = ty.value;
    })
    .onUpdate((e) => {
      const next = dragStart.value + e.translationY;
      ty.value = Math.min(Math.max(next, 0), maxTranslate);
    })
    .onEnd((e) => {
      'worklet';
      const m = maxTranslate;
      const mid = m * 0.26;
      const open = ty.value < mid || e.velocityY < -580;
      const target = open ? 0 : m;

      if (ANIMATION_MODE === 'zoom') {
        ty.value = withSpring(target, { ...ZOOM_SPRING, velocity: e.velocityY });
        runOnJS(lightHaptic)();
        return;
      }

      const remaining = Math.abs(target - ty.value);
      let d = open
        ? Math.min(OPEN_DURATION_CAP, OPEN_DURATION_BASE + ty.value * OPEN_DURATION_PER_PX)
        : Math.min(CLOSE_DURATION_CAP, CLOSE_DURATION_BASE + remaining * CLOSE_DURATION_PER_PX);
      if (ANIMATION_MODE === 'rise') d *= RISE_TIMING_SLOW_FACTOR;
      const v = Math.abs(e.velocityY);
      if (v > 380) {
        d = open
          ? Math.max(280, d - Math.min(120, (v - 380) * 0.12))
          : Math.max(200, d - Math.min(100, (v - 380) * 0.1));
      }
      if (open && e.velocityY < -480) {
        d = Math.max(260, d - 72);
      }
      ty.value = withTiming(target, { duration: d, easing: open ? EASE_OPEN : EASE_CLOSE });
      runOnJS(lightHaptic)();
    });

  return (
    <Animated.View style={[styles.shell, shellLayoutStyle]} pointerEvents="box-none">
      <View style={styles.column} pointerEvents="box-none">
        <GestureDetector gesture={pan}>
          <View style={styles.panArea} pointerEvents="box-none">
            <Animated.View
              style={[styles.mainExpandSlot, expandSlotPadStyle]}
              pointerEvents={mainPointerEvents}
            >
              <View style={styles.mainRevealOuter} pointerEvents="box-none">
                <Animated.View style={mainRevealStyle} pointerEvents="auto">
                  {currentTrack ? <NowPlayingScreenContent sheetLayout /> : null}
                </Animated.View>
              </View>
            </Animated.View>
          </View>
        </GestureDetector>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    zIndex: 9999,
    overflow: 'visible',
    elevation: 9999,
    backgroundColor: 'transparent',
  },
  column: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  panArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  mainExpandSlot: {
    flex: 1,
  },
  /**
   * Hug the bottom so growth reads as "coming from the player", not from the
   * status bar. Overflow is visible so the zoom-mode translate can reach past
   * this container toward the mini-player origin without being clipped;
   * `mainRevealStyle` keeps its own overflow:hidden for rounded corners.
   */
  mainRevealOuter: {
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
});
