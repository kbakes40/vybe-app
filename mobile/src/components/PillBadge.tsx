import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { hexToRgba } from '@/lib/themeColorUtils';
import { VIBRANT_BLUE } from '@/constants/machinedTheme';

/**
 * Reusable small-caps status pill — canonical form for `FLAC`, `HI-FI`,
 * `LOGIC ACTIVE`, `NATIVE PILL ACTIVE`, etc. Matches the Dynamic Island
 * lossless badge so settings/device rows stay visually identical to the pill.
 *
 * Spec (ADD_PILL_INTELLIGENCE / SETTINGS_FULL_OVERHAUL):
 *   - 10pt small-caps
 *   - 18px height
 *   - 1px `#00E5FF` (VIBRANT_BLUE) border by default
 *   - Accent override via `accent` prop for theme-tinted variants
 */
export function PillBadge({
  label,
  accent = VIBRANT_BLUE,
}: {
  label: string;
  accent?: string;
}) {
  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor: accent,
          backgroundColor: hexToRgba(accent, 0.08),
        },
      ]}
    >
      <Text style={[styles.text, { color: accent }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 18,
    paddingHorizontal: 8,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    lineHeight: 12,
  },
});
