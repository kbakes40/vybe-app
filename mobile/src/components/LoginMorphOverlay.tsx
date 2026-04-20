import React, { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { LOGIN_MORPH_TAB_INDEX, useLoginMorphStore } from '@/stores/loginMorphStore';
import { tabBarChromeHeight } from '@/constants/Layout';

const VYBE_ICON = require('../../assets/images/icon.png');
const END_SIZE = 28;
const MORPH_MS = 720;
const TAB_COUNT = 6;

function tabIconCenterJs(
  screenW: number,
  screenH: number,
  insetBottom: number,
  tabIndex: number,
  tabCount: number,
): { cx: number; cy: number } {
  const seg = screenW / tabCount;
  const cx = seg * (tabIndex + 0.5);
  const padBottom = Math.max(8, insetBottom > 0 ? insetBottom - 2 : 8);
  const barH = tabBarChromeHeight(insetBottom);
  const innerH = barH - 10 - padBottom;
  const cy = screenH - padBottom - innerH / 2;
  return { cx, cy };
}

/**
 * Full-screen overlay: duplicate Vybe logo animates from the sign-in hero into the tab bar slot.
 */
export function LoginMorphOverlay() {
  const morph = useLoginMorphStore((s) => s.morph);
  const progress = useSharedValue(0);

  const fromX = useSharedValue(0);
  const fromY = useSharedValue(0);
  const fromW = useSharedValue(0);
  const fromH = useSharedValue(0);
  const endCx = useSharedValue(0);
  const endCy = useSharedValue(0);

  useEffect(() => {
    if (!morph) {
      progress.value = 0;
      return;
    }
    fromX.value = morph.fromX;
    fromY.value = morph.fromY;
    fromW.value = morph.fromW;
    fromH.value = morph.fromH;
    const { cx, cy } = tabIconCenterJs(
      morph.screenW,
      morph.screenH,
      morph.insetBottom,
      LOGIN_MORPH_TAB_INDEX,
      TAB_COUNT,
    );
    endCx.value = cx;
    endCy.value = cy;

    progress.value = 0;
    progress.value = withTiming(
      1,
      {
        duration: MORPH_MS,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      },
      (finished) => {
        if (finished) {
          runOnJS(useLoginMorphStore.getState().clear)();
        }
      },
    );
  }, [morph, fromX, fromY, fromW, fromH, endCx, endCy, progress]);

  const animStyle = useAnimatedStyle(() => {
    const p = progress.value;
    if (p === 0 && fromW.value === 0) {
      return { opacity: 0, width: 0, height: 0 };
    }
    const top = fromY.value + (endCy.value - END_SIZE / 2 - fromY.value) * p;
    const left = fromX.value + (endCx.value - END_SIZE / 2 - fromX.value) * p;
    const w = fromW.value + (END_SIZE - fromW.value) * p;
    const h = fromH.value + (END_SIZE - fromH.value) * p;
    const o = 1 - 0.06 * p;
    return {
      position: 'absolute' as const,
      top,
      left,
      width: w,
      height: h,
      opacity: o,
      borderRadius: 8 + 2 * (1 - p),
      overflow: 'hidden' as const,
    };
  });

  if (!morph) {
    return null;
  }

  return (
    <View style={styles.host} pointerEvents="none">
      <Animated.View style={animStyle}>
        <Image source={VYBE_ICON} style={styles.img} resizeMode="cover" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200000,
    elevation: 200000,
  },
  img: {
    width: '100%',
    height: '100%',
  },
});
