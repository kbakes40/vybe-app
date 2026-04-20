import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { usePillLockStore } from '@/stores/pillLockStore';

const MASK_HEIGHT = 88;

/**
 * STEALTH_FADE_V3 / AUTH_LOCK_SYNC / OLED_ROOT_FIX — solid black status-bar
 * mask shared by BOTH 14 Pro Max and 15 Pro Max. The previous gradient
 * variant faded to transparent and exposed a grey/white strip on the 15
 * Pro Max's OLED calibration; unified to the Louis-style solid band.
 * Observes `hasUser` from `pillLockStore` (not pathname).
 */
export function StealthTopMask() {
  const hasUser = usePillLockStore((s) => s.hasUser);
  if (Platform.OS !== 'ios' || !hasUser) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.host, styles.solid]}
      collapsable={false}
    />
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: MASK_HEIGHT,
    zIndex: 9998,
    elevation: 9998,
  },
  solid: {
    backgroundColor: '#000000',
  },
});
