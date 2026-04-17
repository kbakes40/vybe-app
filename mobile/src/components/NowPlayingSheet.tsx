import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
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
import { MiniPlayer } from '@/components/MiniPlayer';
import { NowPlayingScreenContent } from '@/app/(app)/nowPlaying';
import { MINI_PLAYER_HEIGHT } from '@/constants/miniPlayer';

const { height: SCREEN_H } = Dimensions.get('window');

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
 * translateY 0 = full screen; larger = slid down so only the mini strip shows.
 */
export function NowPlayingSheet({ miniPlayerBottom }: Props) {
  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const maxTranslate = Math.max(0, SCREEN_H - MINI_PLAYER_HEIGHT - miniPlayerBottom);
  const ty = useSharedValue(maxTranslate);
  const dragStart = useSharedValue(0);
  const lastMaxTranslateRef = useRef(maxTranslate);
  const register = useNowPlayingSheetStore((s) => s.register);
  const [miniPointerEvents, setMiniPointerEvents] = useState<'box-none' | 'none'>('box-none');
  // When collapsed, the full-player layer must not intercept touches (playlist list stays usable).
  const [mainPointerEvents, setMainPointerEvents] = useState<'auto' | 'none'>(() =>
    maxTranslate > 0 ? 'none' : 'auto',
  );

  const expand = useCallback(() => {
    const d = timingForOpen(ty.value);
    ty.value = withTiming(0, { duration: d, easing: EASE_OPEN });
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
   * `miniPlayerBottom` changes between tab routes vs stack (playlist, etc.), so `maxTranslate`
   * changes. If `ty` stays on the old value, `miniFadeStyle` can land in a low-opacity band and
   * the mini bar looks nearly invisible.
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
    () => ty.value,
    (y, prev) => {
      if (maxTranslate <= 0) return;
      const threshold = maxTranslate * 0.38;
      const collapsed = y > threshold;
      const wasCollapsed = (prev ?? maxTranslate) > threshold;
      if (collapsed !== wasCollapsed) {
        runOnJS(setMiniPointerEvents)(collapsed ? 'box-none' : 'none');
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

  const shellLayoutStyle = {
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_H,
  } as const;

  /**
   * Bottom-anchored reveal: animated *height* (not maxHeight alone) so flex children inside
   * `NowPlayingScreenContent` get a real layout box. maxHeight-only parents often collapse to ~0 in RN.
   */
  const mainRevealStyle = useAnimatedStyle(() => {
    if (maxTranslate <= 0) {
      return {
        flex: 1,
        width: '100%' as const,
        overflow: 'hidden' as const,
      };
    }
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
  }, [maxTranslate]);

  /**
   * Mini must stay **fully opaque** while collapsed (y ≈ m). The old curve dipped to 0.28
   * mid-travel, which read as “glass” over the home feed. Only fade once the sheet is clearly opening.
   */
  const miniFadeStyle = useAnimatedStyle(() => {
    const m = maxTranslate;
    if (m <= 0) {
      return { opacity: 0, transform: [{ translateY: 0 }] };
    }
    const y = ty.value;
    // inputRange must be increasing: collapsed y → m, expanded y → 0
    return {
      opacity: interpolate(
        y,
        [0, m * 0.35, m * 0.9, m],
        [0, 0.12, 1, 1],
        Extrapolation.CLAMP,
      ),
    };
  }, [maxTranslate]);

  /** Full player: only reserve tab bar. Collapsed: reserve tab + mini — avoids content sitting “too high” when open. */
  const expandSlotPadStyle = useAnimatedStyle(() => {
    const m = maxTranslate;
    const tab = miniPlayerBottom;
    if (m <= 0) return { paddingBottom: tab };
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

  if (!currentTrack) return null;

  return (
    <Animated.View style={[styles.shell, shellLayoutStyle]} pointerEvents="box-none">
      <View style={styles.column} pointerEvents="box-none">
        {/* Pan must NOT wrap MiniPlayer — the outer GH pan wins and steals all touches, so expand never runs. */}
        <GestureDetector gesture={pan}>
          <View style={styles.panArea} pointerEvents="box-none">
            <Animated.View
              style={[styles.mainExpandSlot, expandSlotPadStyle]}
              pointerEvents={mainPointerEvents}
            >
              <View style={styles.mainRevealOuter} pointerEvents="box-none">
                <Animated.View style={mainRevealStyle} pointerEvents="auto">
                  <NowPlayingScreenContent sheetLayout />
                </Animated.View>
              </View>
            </Animated.View>
          </View>
        </GestureDetector>
        <Animated.View
          style={[styles.miniSlot, { paddingBottom: miniPlayerBottom }, miniFadeStyle]}
          pointerEvents={miniPointerEvents}
        >
          <MiniPlayer />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    zIndex: 1,
    overflow: 'visible',
    elevation: 0,
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
  /** Hug the bottom so maxHeight growth reads as “coming from the player”, not from the status bar. */
  mainRevealOuter: {
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  miniSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 12,
    backgroundColor: 'transparent',
  },
});
