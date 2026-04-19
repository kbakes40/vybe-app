import React from 'react';
import { View, Text, StyleSheet, Platform, type ViewStyle } from 'react-native';

/** Magenta glow on the '+' — Shadow system accent */
const PLUS_GLOW = {
  textShadowColor: '#FF00FF',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 8,
} as const;

export type VybePlusWordmarkVariant = 'hero' | 'success' | 'inline' | 'badgeCapsule';

const SIZES: Record<
  VybePlusWordmarkVariant,
  { vybe: number; plus: number; vybeWeight: '600' | '700'; plusWeight: '900' }
> = {
  hero: { vybe: 30, plus: 32, vybeWeight: '700', plusWeight: '900' },
  success: { vybe: 34, plus: 36, vybeWeight: '700', plusWeight: '900' },
  inline: { vybe: 17, plus: 18, vybeWeight: '600', plusWeight: '900' },
  badgeCapsule: { vybe: 13, plus: 14, vybeWeight: '600', plusWeight: '900' },
};

type Props = {
  variant?: VybePlusWordmarkVariant;
  vybeColor?: string;
  plusColor?: string;
  /** When false, omit magenta glow (e.g. dense inline copy). */
  withPlusGlow?: boolean;
  style?: ViewStyle;
};

/**
 * Canonical “Vybe+” product mark. The ‘+’ uses heavy (900) weight and a magenta glow;
 * vertical offset nudges the plus toward the x-height of “e” for geometric balance.
 * (No separate “Plus” logo asset in-repo — this is the single UI source of truth.)
 */
export function VybePlusWordmark({
  variant = 'hero',
  vybeColor = '#FFFFFF',
  plusColor = '#FFFFFF',
  withPlusGlow = true,
  style,
}: Props) {
  const s = SIZES[variant];
  const plusLift = Platform.select({
    ios: variant === 'badgeCapsule' ? 0 : variant === 'inline' ? 0.5 : 1,
    android: variant === 'badgeCapsule' ? 0.5 : 1,
    default: 0.5,
  });

  const row = (
    <View style={[styles.row, style]}>
      <Text
        style={{
          fontSize: s.vybe,
          fontWeight: s.vybeWeight,
          color: vybeColor,
          letterSpacing: -0.3,
        }}
      >
        Vybe
      </Text>
      <Text
        style={{
          fontSize: s.plus,
          fontWeight: s.plusWeight,
          color: plusColor,
          marginLeft: -1,
          marginTop: plusLift,
          ...(withPlusGlow ? PLUS_GLOW : {}),
        }}
      >
        +
      </Text>
    </View>
  );

  if (variant === 'badgeCapsule') {
    return <View style={styles.badgeShell}>{row}</View>;
  }

  return row;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  /** OLED black + machined magenta hairline — profile / menu badge */
  badgeShell: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#FF00FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    alignSelf: 'center',
  },
});
