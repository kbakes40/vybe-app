import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { usePlaybackController } from '@/stores/playbackController';
import { useNowPlayingSheetStore } from '@/stores/nowPlayingSheetStore';
import { NowPlayingScreenContent } from '@/app/(app)/nowPlaying';
import { sheetProgressSV } from '@/stores/nowPlayingSheetProgress';

/** Expanded sheet height: full window — the sheet covers the tab bar too (Google/Apple Music style). */
function sheetExpandedHeightPx(windowHeight: number): number {
  return Math.max(120, windowHeight);
}

/**
 * When the sheet is fully "open", rest translateY at this offset from the top.
 * Leaves a strip of the previous screen (status bar + DI pill) visible above
 * the sheet's rounded top corners — Apple/Spotify/Google Music pattern.
 */
const EXPANDED_TOP_OFFSET = 110;

/** Keeps the top corners rounded even when the sheet is fully open. */
const EXPANDED_TOP_RADIUS = 32;

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
  return Math.min(OPEN_DURATION_CAP, OPEN_DURATION_BASE + dist * OPEN_DURATION_PER_PX);
}

function timingForClose(remainingPx: number) {
  return Math.min(CLOSE_DURATION_CAP, CLOSE_DURATION_BASE + Math.abs(remainingPx) * CLOSE_DURATION_PER_PX);
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
  const { height: windowHeight } = useWindowDimensions();
  const currentTrack = usePlaybackController((s) => s.currentTrack);
  /** Mini player is mounted in the root layout; sheet fully slides off-screen when collapsed. */
  const maxTranslate = sheetExpandedHeightPx(windowHeight);
  const ty = useSharedValue(maxTranslate);
  const dragStart = useSharedValue(0);
  const lastMaxTranslateRef = useRef(maxTranslate);
  const register = useNowPlayingSheetStore((s) => s.register);
  const setSheetExpanded = useNowPlayingSheetStore((s) => s.setSheetExpanded);
  // When collapsed, the full-player layer must not intercept touches (playlist list stays usable).
  const [mainPointerEvents, setMainPointerEvents] = useState<'auto' | 'none'>(() =>
    maxTranslate > 0 ? 'none' : 'auto',
  );
  /** When collapsed, entire sheet shell is non-hit-testable so touches reach MiniPlayer (z below). */
  const [shellPointerEvents, setShellPointerEvents] = useState<'none' | 'box-none'>(() =>
    maxTranslate > 0 ? 'none' : 'box-none',
  );

  const applyTouchPolicy = useCallback((collapsed: boolean | null) => {
    if (collapsed === null) {
      setMainPointerEvents('auto');
      setShellPointerEvents('box-none');
      return;
    }
    if (collapsed) {
      setMainPointerEvents('none');
      setShellPointerEvents('none');
    } else {
      setMainPointerEvents('auto');
      setShellPointerEvents('box-none');
    }
  }, []);

  const expand = useCallback(() => {
    const d = timingForOpen(ty.value);
    // Target EXPANDED_TOP_OFFSET (not 0) so the sheet doesn't cover the
    // status bar / DI pill — leaves space for the rounded top corners to read.
    ty.value = withTiming(EXPANDED_TOP_OFFSET, { duration: d, easing: EASE_OPEN });
  }, [ty]);

  const collapse = useCallback(() => {
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
      applyTouchPolicy(null);
      return;
    }
    applyTouchPolicy(ty.value > maxTranslate * 0.72);
  }, [maxTranslate, applyTouchPolicy]);

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
        runOnJS(applyTouchPolicy)(null);
        return;
      }
      runOnJS(applyTouchPolicy)(y > m * 0.72);
    },
    [maxTranslate, applyTouchPolicy],
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
   * Google / Apple Music style: full-height surface that slides up as one block via translateY.
   * Panel is always laid out at full `maxTranslate` height (so inner content is stable — no
   * mid-animation layout smoosh). `translateY` animates from `maxTranslate` (off-screen, hidden
   * below the mini) → 0 (fully shown).
   */
  const mainRevealStyle = useAnimatedStyle(() => {
    if (maxTranslate <= 0) {
      return {
        flex: 1,
        width: '100%' as const,
        overflow: 'hidden' as const,
        transform: [{ translateY: 0 }],
      };
    }
    const m = maxTranslate;
    // Corners stay rounded at fully-open (bottom of input range is now the
    // rest offset, not 0) so the sheet reads as a page-sheet, not a
    // full-screen takeover. Radius grows as the sheet lifts — max at rest.
    const topRadius = interpolate(
      ty.value,
      [m, m * 0.88, m * 0.42, EXPANDED_TOP_OFFSET],
      [16, 22, 28, EXPANDED_TOP_RADIUS],
      Extrapolation.CLAMP,
    );
    return {
      // Shrink the sheet's rendered height by EXPANDED_TOP_OFFSET so that
      // when translated down to rest at y=80, the bottom row (Queue / AirPlay
      // / Share) stays on-screen instead of being clipped by the 80pt shift.
      height: m - EXPANDED_TOP_OFFSET,
      transform: [{ translateY: ty.value }],
      borderTopLeftRadius: topRadius,
      borderTopRightRadius: topRadius,
      overflow: 'hidden' as const,
      width: '100%' as const,
    };
  }, [maxTranslate]);

  /** Full-screen modal — no outer padding. Inner `NowPlayingScreenContent` handles safe-area insets. */
  const expandSlotPadStyle = useAnimatedStyle(() => {
    const m = maxTranslate;
    if (m <= 0) return { paddingBottom: miniPlayerBottom };
    return { paddingBottom: 0 };
  }, [maxTranslate, miniPlayerBottom]);

  /**
   * Drive the global `sheetProgressSV` every frame (0 = collapsed → 1 = expanded).
   * `MiniPlayer` reads this exact shared value to cross-fade smoothly with the gesture.
   */
  useAnimatedReaction(
    () => ({ y: ty.value, m: maxTranslate }),
    (cur) => {
      if (cur.m <= 0) {
        sheetProgressSV.value = 1;
        return;
      }
      sheetProgressSV.value = 1 - cur.y / cur.m;
    },
    [maxTranslate],
  );

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
      const remaining = Math.abs(target - ty.value);
      let d = open
        ? Math.min(OPEN_DURATION_CAP, OPEN_DURATION_BASE + ty.value * OPEN_DURATION_PER_PX)
        : Math.min(CLOSE_DURATION_CAP, CLOSE_DURATION_BASE + remaining * CLOSE_DURATION_PER_PX);
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
    <Animated.View
      style={[styles.shell, shellLayoutStyle]}
      pointerEvents={shellPointerEvents}
    >
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
    zIndex: 10,
    overflow: 'visible',
    elevation: 10,
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
  /** Container lets the translated sheet slide up as one unit (no height animation). */
  mainRevealOuter: {
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
});
