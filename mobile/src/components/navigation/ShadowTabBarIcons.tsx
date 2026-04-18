import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Ellipse } from 'react-native-svg';
import { Radar, Disc3 } from 'lucide-react-native';

/** Shadow tab chrome — shared across tab bar icons. */
export const SHADOW_TAB_STROKE = 1.5;
export const SHADOW_TAB_ACTIVE = 'rgba(255,255,255,0.9)';
export const SHADOW_TAB_INACTIVE = 'rgba(255,255,255,0.42)';

const GLOW = '#D946EF';

type IconBase = { size: number; color: string };

/**
 * Active: magenta / purple glow + slight scale-up (per Shadow tab spec).
 */
export function ShadowTabIconShell({
  focused,
  children,
}: {
  focused: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.shell,
        focused && {
          transform: [{ scale: 1.1 }],
          shadowColor: GLOW,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: Platform.OS === 'ios' ? 0.85 : 0.55,
          shadowRadius: 5,
          elevation: Platform.OS === 'android' ? 8 : 0,
        },
      ]}
    >
      {children}
    </View>
  );
}

/** Sharp geometric house — minimalist Shadow home. */
export function ShadowHomeIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 21V10.5L12 4l9 6.5V21"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M9 21v-7h6v7"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Thin, elongated magnifying glass. */
export function ShadowSearchIcon({ size, color }: IconBase) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Ellipse
        cx="10.2"
        cy="10.5"
        rx="6.8"
        ry="4.9"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15.8 15.8L21 21"
        stroke={color}
        strokeWidth={SHADOW_TAB_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Vybe discovery — radar sweep (Lucide, stroke locked). */
export function ShadowDiscoverIcon({ size, color }: IconBase) {
  return <Radar size={size} color={color} strokeWidth={SHADOW_TAB_STROKE} />;
}

/** Library — vinyl-style disc. */
export function ShadowLibraryIcon({ size, color }: IconBase) {
  return <Disc3 size={size} color={color} strokeWidth={SHADOW_TAB_STROKE} />;
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
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
