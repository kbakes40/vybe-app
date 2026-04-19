import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { Radar } from 'lucide-react-native';

/** Shadow tab chrome — shared across tab bar icons. */
export const SHADOW_TAB_STROKE = 1.5;
/** Vibrant cyan — active tab + machined indicator (global nav). */
export const SHADOW_TAB_ACTIVE = '#00E5FF';
/** Deep graphite — inactive silhouettes. */
export const SHADOW_TAB_INACTIVE = '#444444';

const GLOW = SHADOW_TAB_ACTIVE;

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
          transform: [{ scale: 1.02 }],
          shadowColor: GLOW,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: Platform.OS === 'ios' ? 0.45 : 0.35,
          shadowRadius: 4,
          elevation: Platform.OS === 'android' ? 4 : 0,
        },
      ]}
    >
      {children}
    </View>
  );
}

/** Minimal vault arch — thin continuous silhouette. */
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
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
