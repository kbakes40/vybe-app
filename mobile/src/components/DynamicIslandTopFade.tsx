import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePillLockStore } from '@/stores/pillLockStore';
import { useThemeStore } from '@/stores/themeStore';
import { hexToRgba } from '@/lib/themeColorUtils';

/**
 * INSTANT_STEALTH — top melt: scrolling content (Decades Vault, cards) fades to
 * transparent into the Dynamic Island band. Hidden on login/onboarding with the pill.
 */
export function DynamicIslandTopFade() {
  const allow = usePillLockStore((s) => s.allowIslandSurfaces);
  const accent = useThemeStore((s) => s.accentColor);
  /** True black → accent @ 10% → transparent (Stealth Fade). */
  const colors = useMemo(
    () => ['#000000', hexToRgba(accent, 0.1), 'rgba(0,0,0,0)'] as const,
    [accent],
  );
  if (Platform.OS !== 'ios' || !allow) return null;

  return (
    <View pointerEvents="none" style={styles.host} collapsable={false}>
      <LinearGradient
        pointerEvents="none"
        colors={[...colors]}
        style={styles.gradient}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    zIndex: 9998,
    elevation: 9998,
  },
  gradient: {
    flex: 1,
    width: '100%',
  },
});
