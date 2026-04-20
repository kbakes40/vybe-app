import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePillLockStore } from '@/stores/pillLockStore';
import { useThemeStore } from '@/stores/themeStore';
import { hexToRgba } from '@/lib/themeColorUtils';
import { isLouisDevice } from '@/constants/louisOledProfile';

/** RADIO_UNITY_V6 — matches `radio.tsx` first-row top inset under Dynamic Island. */
const RADIO_PILL_ROW_TOP_OFFSET = 64;

/**
 * INSTANT_STEALTH — top melt: scrolling content fades into the Dynamic Island band.
 * On the Radio tab, the gradient starts at the top of the geometric pill row (not screen 0).
 *
 * STEALTH_FADE: black → subtle theme-accent wash → transparent so lists read as
 * dissolving behind the pill (restored accent melt; hidden when island chrome is off).
 */
export function DynamicIslandTopFade() {
  const allowIslandSurfaces = usePillLockStore((s) => s.allowIslandSurfaces);
  const accent = useThemeStore((s) => s.accentColor);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isRadioTab = pathname?.includes('/radio') ?? false;

  const colors = useMemo(
    () =>
      ['#000000', hexToRgba(accent, 0.08), hexToRgba(accent, 0.04), 'rgba(0,0,0,0)'] as const,
    [accent],
  );
  const colorLocations = useMemo(() => [0, 0.28, 0.55, 1] as const, []);
  if (Platform.OS !== 'ios' || !allowIslandSurfaces) return null;
  if (isLouisDevice()) return null;

  const hostStyle = isRadioTab
    ? [
        styles.host,
        {
          top: insets.top + RADIO_PILL_ROW_TOP_OFFSET,
          height: 76,
        },
      ]
    : [styles.host, styles.hostDefaultMelt];

  return (
    <View pointerEvents="none" style={hostStyle} collapsable={false}>
      <LinearGradient
        pointerEvents="none"
        colors={[...colors]}
        locations={[...colorLocations]}
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
    zIndex: 9998,
    elevation: 9998,
  },
  /** Default melt height — matches {@link StealthTopMask} band + Island scroll zone. */
  hostDefaultMelt: {
    height: 112,
  },
  gradient: {
    flex: 1,
    width: '100%',
  },
});
