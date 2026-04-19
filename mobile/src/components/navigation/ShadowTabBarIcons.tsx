import React, { useEffect } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { Radar } from 'lucide-react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/** Shadow tab chrome — shared across tab bar icons. */
export const SHADOW_TAB_STROKE = 1.5;
/** Vibrant cyan — active tab + machined indicator (global nav). */
export const SHADOW_TAB_ACTIVE = '#00E5FF';
/** Deep graphite — inactive silhouettes. */
export const SHADOW_TAB_INACTIVE = '#444444';

const MACHINED_BLUE = SHADOW_TAB_ACTIVE;
const MAGENTA_HEARTBEAT = '#FF00FF';

/** Base iOS shadow radius; doubles briefly on focus (bloom). */
const SHADOW_R_DEFAULT = 6;
const SHADOW_R_VYBE = 9;
const GLOW_OPACITY_MAX = 0.44;
/** Inactive tab: glow at 60% of design max. */
const GLOW_INACTIVE_MULT = 0.6;
/** Central Vybe tab — extra dim when inactive. */
const VYBE_INACTIVE_DIM = 0.52;

const BLOOM_IN_MS = 150;
const BLOOM_OUT_MS = 150;

type TabIconVariant = 'default' | 'vybe';

/**
 * Tab icon shell — permanent Machined Blue 1px ring + outer glow (inactive 0.6 / active 1.0),
 * Reanimated bloom on focus, magenta heartbeat dot under active tab.
 * `variant="vybe"`: stronger ring + base glow; active uses slow breathing (0.8–1.0).
 */
export function ShadowTabIconShell({
  focused,
  variant = 'default',
  children,
}: {
  focused: boolean;
  /** Central Vybe (discover) — stronger ring + breathing glow when active. */
  variant?: TabIconVariant;
  children: React.ReactNode;
}) {
  const isVybe = variant === 'vybe';
  const baseRadius = isVybe ? SHADOW_R_VYBE : SHADOW_R_DEFAULT;

  const focusedSv = useSharedValue(focused ? 1 : 0);
  const variantVybeSv = useSharedValue(isVybe ? 1 : 0);
  const bloomScale = useSharedValue(1);
  const bloomShadowR = useSharedValue(baseRadius);
  const breath = useSharedValue(1);
  const dotPulse = useSharedValue(1);

  useEffect(() => {
    focusedSv.value = focused ? 1 : 0;
  }, [focused, focusedSv]);

  useEffect(() => {
    variantVybeSv.value = isVybe ? 1 : 0;
  }, [isVybe, variantVybeSv]);

  useEffect(() => {
    if (focused) {
      bloomScale.value = withSequence(
        withTiming(1.2, { duration: BLOOM_IN_MS }),
        withTiming(1, { duration: BLOOM_OUT_MS }),
      );
      bloomShadowR.value = withSequence(
        withTiming(baseRadius * 2, { duration: BLOOM_IN_MS }),
        withTiming(baseRadius, { duration: BLOOM_OUT_MS }),
      );
    } else {
      cancelAnimation(bloomScale);
      cancelAnimation(bloomShadowR);
      bloomScale.value = withTiming(1, { duration: 120 });
      bloomShadowR.value = withTiming(baseRadius, { duration: 120 });
    }
  }, [focused, baseRadius, bloomScale, bloomShadowR]);

  useEffect(() => {
    if (focused && isVybe) {
      breath.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(breath);
      breath.value = 1;
    }
  }, [focused, isVybe, breath]);

  useEffect(() => {
    if (focused) {
      dotPulse.value = withRepeat(
        withSequence(
          withTiming(1.18, { duration: 380, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 380, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(dotPulse);
      dotPulse.value = 1;
    }
  }, [focused, dotPulse]);

  const shellAnimatedStyle = useAnimatedStyle(() => {
    const f = focusedSv.value;
    const vy = variantVybeSv.value;
    const inactiveBase = GLOW_OPACITY_MAX * GLOW_INACTIVE_MULT;
    const inactiveGlow = inactiveBase * (vy > 0.5 ? VYBE_INACTIVE_DIM : 1);
    const activeGlowDefault = GLOW_OPACITY_MAX;
    const activeGlowVybe = GLOW_OPACITY_MAX * breath.value;
    const activeGlow = vy > 0.5 ? activeGlowVybe : activeGlowDefault;
    const shadowOpacity = inactiveGlow + (activeGlow - inactiveGlow) * f;

    return {
      transform: [{ scale: bloomScale.value }],
      shadowColor: MACHINED_BLUE,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity,
      shadowRadius: bloomShadowR.value,
      elevation: Platform.OS === 'android' ? Math.min(14, bloomShadowR.value * 0.85) : 0,
    };
  });

  const dotAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotPulse.value }],
    opacity: interpolate(dotPulse.value, [1, 1.18], [0.88, 1]),
  }));

  return (
    <View style={styles.wrapCol} pointerEvents="box-none">
      <Animated.View
        style={[styles.shell, isVybe && styles.shellVybe, shellAnimatedStyle]}
        renderToHardwareTextureAndroid
        collapsable={false}
      >
        {children}
      </Animated.View>
      {focused ? (
        <Animated.View
          style={[styles.heartbeatDot, dotAnimatedStyle]}
          pointerEvents="none"
          renderToHardwareTextureAndroid
          collapsable={false}
        />
      ) : null}
    </View>
  );
}

/** Alias — same component as {@link ShadowTabIconShell}. */
export const TabIcon = ShadowTabIconShell;

/** Minimal vault arch — thin continuous silhouette. */
type IconBase = { size: number; color: string };

export function ShadowHomeIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 21V12.25C5 8.35 8.1 5.25 12 5.25S19 8.35 19 12.25V21"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M8 21h8"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Precision magnifying glass — true circle + clean handle. */
export function ShadowSearchIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="10.25"
        cy="10.25"
        r="6.25"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
      />
      <Path
        d="M15.35 15.35L20.25 20.25"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Vybe discovery — radar sweep (Lucide, stroke locked). */
export function ShadowDiscoverIcon({ size, color }: IconBase) {
  return <Radar size={size} color={color} strokeWidth={SHADOW_TAB_STROKE} />;
}

/** Library — three tight horizontal rails. */
export function ShadowLibraryIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Line x1="5" y1="8" x2="19" y2="8" stroke={color} strokeWidth={SHADOW_TAB_STROKE} strokeLinecap="round" />
      <Line x1="5" y1="12" x2="19" y2="12" stroke={color} strokeWidth={SHADOW_TAB_STROKE} strokeLinecap="round" />
      <Line x1="5" y1="16" x2="19" y2="16" stroke={color} strokeWidth={SHADOW_TAB_STROKE} strokeLinecap="round" />
    </Svg>
  );
}

/** User silhouette inside a thin outer ring. */
export function ShadowProfileIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle
        cx="12"
        cy="12"
        r="10.25"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
      />
      <Circle
        cx="12"
        cy="9.25"
        r="2.65"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M6.75 19.25c0-2.9 2.35-5.25 5.25-5.25s5.25 2.35 5.25 5.25"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Custom 4-point star (activity / sparkle). */
export function ShadowSparkleIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4l1.25 7L20 12l-6.75 1L12 20l-1.25-7L4 12l6.75-1L12 4z"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrapCol: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    borderWidth: 1,
    borderColor: MACHINED_BLUE,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.001)',
  },
  /** Central Vybe — strongest 2px ring (always) so blue chrome reads as “hero”. */
  shellVybe: {
    borderWidth: 2,
    borderRadius: 10,
    padding: 2,
  },
  heartbeatDot: {
    marginTop: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: MAGENTA_HEARTBEAT,
    shadowColor: MAGENTA_HEARTBEAT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 3,
    elevation: 4,
  },
});
