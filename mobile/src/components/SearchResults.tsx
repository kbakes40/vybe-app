/**
 * Search tab — neon “machined” section headers (Skia glow + Vybe source icons).
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Canvas, Text as SkiaText, matchFont, Group } from '@shopify/react-native-skia';
import {
  VybeVideoNeonIcon,
  VybeMusicNeonIcon,
  VybeWavesNeonIcon,
} from '@/assets/icons/VybeNeonSourceIcons';

export type VybeSearchSourceVariant = 'video' | 'music' | 'waves';

const LABELS: Record<VybeSearchSourceVariant, string> = {
  video: 'Vybe Video',
  music: 'Vybe Music',
  waves: 'Vybe Waves',
};

const ACCENT: Record<VybeSearchSourceVariant, string> = {
  video: '#FF0033',
  music: '#FF2D95',
  waves: '#FF6600',
};

function NeonSkiaTitle({ variant }: { variant: VybeSearchSourceVariant }) {
  const label = LABELS[variant];
  const accent = ACCENT[variant];
  const font = useMemo(
    () =>
      matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif' }) ?? 'sans-serif',
        fontSize: 18,
        fontWeight: '700',
      }),
    [],
  );

  const w = 280;
  const h = 26;
  const y = 20;

  return (
    <Canvas style={{ width: w, height: h }} pointerEvents="none">
      <Group>
        <SkiaText x={0} y={y} text={label} font={font} color={accent} opacity={0.35} />
        <SkiaText x={1.5} y={y + 0.5} text={label} font={font} color={accent} opacity={0.5} />
        <SkiaText x={-1} y={y} text={label} font={font} color={accent} opacity={0.4} />
        <SkiaText x={0} y={y + 1} text={label} font={font} color={accent} opacity={0.28} />
      </Group>
      <SkiaText x={0} y={y} text={label} font={font} color="#FFFFFF" />
    </Canvas>
  );
}

export function NeonVybeSearchSectionHeader({
  variant,
  subtitle,
  rowStyle,
}: {
  variant: VybeSearchSourceVariant;
  subtitle?: string;
  rowStyle?: object;
}) {
  const Icon =
    variant === 'video' ? VybeVideoNeonIcon : variant === 'music' ? VybeMusicNeonIcon : VybeWavesNeonIcon;

  return (
    <View style={[styles.sectionHeaderRow, rowStyle]}>
      <View style={styles.iconSlot}>
        <Icon size={32} />
      </View>
      <View style={{ flex: 1 }}>
        <NeonSkiaTitle variant={variant} />
        {subtitle ? <Text style={styles.sectionHeaderSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 14,
    gap: 10,
  },
  iconSlot: {
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionHeaderSubtitle: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0.2,
  },
});
