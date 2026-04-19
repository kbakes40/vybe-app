import React, { useEffect, useRef } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Rect } from 'react-native-svg';
import { Radar } from 'lucide-react-native';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTabBarBloomStore } from '@/stores/tabBarBloomStore';

/** Shadow tab chrome — shared across tab bar icons. */
export const SHADOW_TAB_STROKE = 1.5;
/** Neon Cyan — active tab + machined indicator (global nav). */
export const SHADOW_TAB_ACTIVE = '#00FFFF';
/** Muted Machined Grey — inactive silhouettes (white at 25% opacity). */
export const SHADOW_TAB_INACTIVE = '#FFFFFF40';

const MACHINED_BLUE = SHADOW_TAB_ACTIVE;
const MAGENTA_HEARTBEAT = '#FF00FF';

/** Active-tab glow target — per spec: shadowOpacity 0.8 / shadowRadius 10. */
const ACTIVE_SHADOW_OPACITY = 0.8;
const ACTIVE_SHADOW_RADIUS = 10;
/** Vybe (discover) hero variant — slightly stronger glow when focused. */
const ACTIVE_SHADOW_RADIUS_VYBE = 14;
/**
 * Speed Mode "Always On" baseline — every tab keeps a faint Machined Blue
 * presence at 0.6 opacity so the bar never feels dead. Focus springs the
 * glow up to full (1.0) and brings the magenta heartbeat dot in below.
 */
const BASELINE_BORDER_OPACITY = 0.6;
const BASELINE_SHADOW_OPACITY = 0.35;
const BASELINE_SHADOW_RADIUS = 4;
/** Spring physics for the cyan glow morph between tabs — stiff, snappy. */
const FOCUS_SPRING = { damping: 18, stiffness: 220, mass: 0.6 } as const;

const BLOOM_IN_MS = 150;
const BLOOM_OUT_MS = 150;

type TabIconVariant = 'default' | 'vybe';

/**
 * Tab icon shell — permanent Machined Blue 1px ring + outer glow (baseline 0.6 opacity),
 * press-driven 1.2× bloom + doubled shadow (300ms), magenta heartbeat dot under active tab.
 * `variant="vybe"`: stronger ring + breathing glow when active.
 */
export function ShadowTabIconShell({
  focused,
  variant = 'default',
  pressRoute,
  children,
}: {
  focused: boolean;
  /** Central Vybe (discover) — stronger ring + breathing glow when active. */
  variant?: TabIconVariant;
  /** Route name — matches `useTabBarBloomStore.pulse(route)` for press bloom. */
  pressRoute?: string;
  children: React.ReactNode;
}) {
  const isVybe = variant === 'vybe';
  const activeRadius = isVybe ? ACTIVE_SHADOW_RADIUS_VYBE : ACTIVE_SHADOW_RADIUS;

  // Spring-driven focus value (0 = inactive, 1 = active). Drives borderColor
  // opacity, shadow opacity, and shadow radius — so the cyan glow physically
  // springs onto the new tab and away from the old one.
  const focusedSv = useSharedValue(focused ? 1 : 0);
  const bloomScale = useSharedValue(1);
  const bloomBoost = useSharedValue(0);
  const breath = useSharedValue(1);
  const dotPulse = useSharedValue(1);
  const lastPulseAtRef = useRef(0);

  useEffect(() => {
    focusedSv.value = withSpring(focused ? 1 : 0, FOCUS_SPRING);
  }, [focused, focusedSv]);

  useEffect(() => {
    if (!pressRoute) return () => {};
    const unsub = useTabBarBloomStore.subscribe((s) => {
      if (s.pulseRoute !== pressRoute) return;
      if (s.pulseAt === lastPulseAtRef.current) return;
      lastPulseAtRef.current = s.pulseAt;
      cancelAnimation(bloomScale);
      cancelAnimation(bloomBoost);
      bloomScale.value = withSequence(
        withTiming(1.2, { duration: BLOOM_IN_MS }),
        withTiming(1, { duration: BLOOM_OUT_MS }),
      );
      bloomBoost.value = withSequence(
        withTiming(1, { duration: BLOOM_IN_MS }),
        withTiming(0, { duration: BLOOM_OUT_MS }),
      );
    });
    // Defensive guard: zustand returns an unsubscribe fn but if a build ever
    // produced something else, calling it as `unsub.call()` would be the
    // root of "TypeError: _b.call is not a function".
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [pressRoute, bloomScale, bloomBoost]);

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

  // Speed Mode tab chrome: every tab keeps a constant Machined Blue
  // baseline (border 0.6, soft shadow at 0.35) so the bar feels alive even
  // when nothing is focused. The spring then layers the active boost on
  // top — full opacity ring, full glow, optional press bloom.
  const shellAnimatedStyle = useAnimatedStyle(() => {
    const f = focusedSv.value;
    const breathMix = isVybe ? breath.value : 1;
    const boost = bloomBoost.value;
    const borderOpacity = Math.min(
      1,
      BASELINE_BORDER_OPACITY + f * (1 - BASELINE_BORDER_OPACITY) + boost * 0.3,
    );
    const shadowOpacity = Math.min(
      1,
      BASELINE_SHADOW_OPACITY +
        f * (ACTIVE_SHADOW_OPACITY - BASELINE_SHADOW_OPACITY) * breathMix +
        boost * 0.2,
    );
    const shadowRadius =
      BASELINE_SHADOW_RADIUS +
      f * (activeRadius - BASELINE_SHADOW_RADIUS) * breathMix +
      boost * 6;
    return {
      transform: [{ scale: bloomScale.value }],
      borderColor: `rgba(0, 255, 255, ${borderOpacity})`,
      shadowColor: MACHINED_BLUE,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity,
      shadowRadius,
      elevation: Platform.OS === 'android' ? Math.min(14, shadowRadius * 0.85) : 0,
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

/** Vault / visualizer — vertical bars (activity tab standard). */
export function ShadowVaultWaveIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={11} width={2.5} height={7} rx={1} fill={color} />
      <Rect x={9.25} y={7} width={2.5} height={11} rx={1} fill={color} />
      <Rect x={13.5} y={9} width={2.5} height={9} rx={1} fill={color} />
      <Rect x={17.75} y={6} width={2.5} height={12} rx={1} fill={color} />
    </Svg>
  );
}

/** Radio / broadcast — mast + radiating arcs (geometric stroke icon). */
export function ShadowRadioTowerIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4v16M9 7l3-2 3 2M9 11l3-2 3 2M9 15l3-2 3 2"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15.5 6.5c2.5 1.8 4 4.6 4 7.5s-1.5 5.7-4 7.5M8.5 6.5C6 8.3 4.5 11.1 4.5 14s1.5 5.7 4 7.5"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Plan / grid — 2×2 cells (Your Plan tab). */
export function ShadowPlanGridIcon({ size, color }: IconBase) {
  const s = size;
  const u = 7.5;
  const g = 2.5;
  const o = 4;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x={o} y={o} width={u} height={u} rx={1.5} stroke={color} strokeWidth={SHADOW_TAB_STROKE} />
      <Rect x={o + u + g} y={o} width={u} height={u} rx={1.5} stroke={color} strokeWidth={SHADOW_TAB_STROKE} />
      <Rect x={o} y={o + u + g} width={u} height={u} rx={1.5} stroke={color} strokeWidth={SHADOW_TAB_STROKE} />
      <Rect x={o + u + g} y={o + u + g} width={u} height={u} rx={1.5} stroke={color} strokeWidth={SHADOW_TAB_STROKE} />
    </Svg>
  );
}

/** Profile tab — bold V mark (unified purple stroke from parent `color`). */
export function ShadowProfileVybeVIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 5 L12 19 L18 5"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE + 0.35}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
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
    // Static border WIDTH only — color/opacity come from the animated style.
    // Speed Mode keeps a 0.6 baseline ring on every tab; focus springs it
    // up to full and brings the heartbeat dot in below.
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.001)',
  },
  /** Central Vybe — slightly thicker ring footprint when focused (animated). */
  shellVybe: {
    borderWidth: 2,
    borderRadius: 10,
    padding: 2,
  },
  heartbeatDot: {
    marginTop: 4,
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
