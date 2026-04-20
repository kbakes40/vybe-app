import React, { useEffect, useRef } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Rect } from 'react-native-svg';
import { Radar } from 'lucide-react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTabBarBloomStore } from '@/stores/tabBarBloomStore';
import { DOCK_CYAN, VIBRANT_BLUE } from '@/constants/machinedTheme';

/** Shadow tab chrome — shared across tab bar icons. */
export const SHADOW_TAB_STROKE = 1.5;
/** Inactive tab: 0.4 white on OLED (nav spec). */
export const SHADOW_TAB_INACTIVE = 'rgba(255,255,255,0.4)';

/** Cyan #00E5FF — only active tab glows (nav spec). */
const TAB_GLOW_RGB = { r: 0, g: 229, b: 255 } as const;

/** Active-tab glow — shadowOpacity / radius caps. */
const ACTIVE_SHADOW_OPACITY = 0.85;
const ACTIVE_SHADOW_RADIUS = 10;
/** Vybe (discover) center — slightly stronger glow when focused. */
const ACTIVE_SHADOW_RADIUS_VYBE = 15;
/** Spring physics for the cyan glow morph between tabs — stiff, snappy. */
const FOCUS_SPRING = { damping: 18, stiffness: 220, mass: 0.6 } as const;

const BLOOM_IN_MS = 150;
const BLOOM_OUT_MS = 150;

type TabIconVariant = 'default' | 'vybe';

/**
 * Tab icon shell — **only the focused tab** gets cyan #00E5FF ring + glow.
 * Inactive: no chrome (icons render at 0.4 white from parent).
 * `variant="vybe"`: center Discover — stronger ring + subtle breath when active.
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

  const focusedSv = useSharedValue(focused ? 1 : 0);
  const bloomScale = useSharedValue(1);
  const bloomBoost = useSharedValue(0);
  const breath = useSharedValue(1);
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

  const { r: cr, g: cg, b: cb } = TAB_GLOW_RGB;

  const shellAnimatedStyle = useAnimatedStyle(() => {
    const f = focusedSv.value;
    const breathMix = isVybe ? breath.value : 1;
    const boost = bloomBoost.value;
    const active = f * (1 - boost * 0.02) + boost * 0.85;
    if (active < 0.03) {
      return {
        transform: [{ scale: bloomScale.value }],
        borderWidth: 0,
        borderColor: 'transparent',
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowOffset: { width: 0, height: 0 },
        elevation: 0,
      };
    }
    const shadowOpacity = Math.min(1, active * ACTIVE_SHADOW_OPACITY * breathMix + boost * 0.15);
    const shadowRadius = active * activeRadius * breathMix + boost * 6;
    const borderOpacity = Math.min(1, active * 0.95 + boost * 0.2);
    return {
      transform: [{ scale: bloomScale.value }],
      borderWidth: isVybe ? 2 : 1,
      borderColor: `rgba(${cr},${cg},${cb},${borderOpacity})`,
      shadowColor: VIBRANT_BLUE,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity,
      shadowRadius,
      elevation: Platform.OS === 'android' ? Math.min(14, shadowRadius * 0.85) : 0,
    };
  });

  const inner = (
    <Animated.View
      style={[styles.shell, isVybe && styles.shellVybe, shellAnimatedStyle]}
      renderToHardwareTextureAndroid
      collapsable={false}
    >
      {children}
    </Animated.View>
  );

  return (
    <View style={styles.wrapCol} pointerEvents="box-none">
      {isVybe ? (
        <View style={styles.vybePowerRing} pointerEvents="box-none">
          {inner}
        </View>
      ) : (
        inner
      )}
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

/**
 * Search tab — technical saxophone glyph (stroke-only, geometric).
 */
export function ShadowSaxSearchIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7.5 18.5V8.2c0-1.1.9-2 2-2h1.2M9.5 6.2L11 4.7c.4-.4 1-.4 1.4 0l1.1 1.1M12.5 5.8l2.8 2.8c.6.6.9 1.4.9 2.3v6.1c0 .8-.3 1.6-.9 2.2l-.4.4c-.5.5-1.2.8-1.9.8H10c-.8 0-1.5-.3-2-.8l-.5-.5"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="14.5" cy="14" r="1.15" stroke={color} strokeWidth={SHADOW_TAB_STROKE} />
      <Path
        d="M6 19.5h3.5"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Radio tab — minimalist transmitter dial (arc ticks + center post).
 */
export function ShadowRadioDialIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.25" stroke={color} strokeWidth={SHADOW_TAB_STROKE} />
      <Circle cx="12" cy="12" r="1.6" fill={color} />
      <Path
        d="M12 12L12 6.2"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
      />
      <Path
        d="M12 4.5v1.2M16.2 7.8l-.85.85M19.5 12h-1.2M16.2 16.2l-.85-.85M12 19.5v-1.2M7.8 16.2l.85-.85M4.5 12h1.2M7.8 7.8l.85.85"
        stroke={color}
        strokeWidth={1.35}
        strokeLinecap="round"
        opacity={0.85}
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

/**
 * Account tab — vector circle-user glyph (24×24 viewBox, sharp at @3x; no raster blur).
 */
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
  /** 1px cyan Power Ring (slot 3) — ambient glow reads as illuminating the Dock slightly. */
  vybePowerRing: {
    borderWidth: 1,
    borderColor: DOCK_CYAN,
    borderRadius: 16,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: DOCK_CYAN,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.34,
        shadowRadius: 20,
      },
      android: {
        elevation: 14,
      },
    }),
  },
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    borderWidth: 0,
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
});
