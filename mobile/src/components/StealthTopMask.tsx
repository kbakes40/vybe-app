import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePillLockStore } from '@/stores/pillLockStore';
import { isLouisDevice } from '@/constants/louisOledProfile';

const MASK_HEIGHT = 88;

/**
 * STEALTH_FADE_V3 / AUTH_LOCK_SYNC — base top viewport mask (`_layout.tsx` tree).
 * Observes `hasUser` from `pillLockStore` (not pathname).
 */
export function StealthTopMask() {
  const hasUser = usePillLockStore((s) => s.hasUser);
  if (Platform.OS !== 'ios' || !hasUser) return null;

  /**
   * Louis OLED — render a SOLID pure-black band that covers the status-bar area
   * (no gradient = no off-black wash). Without this the system status bar reads
   * as a white strip on the OLED tab stack.
   */
  if (isLouisDevice()) {
    return (
      <View
        pointerEvents="none"
        style={[styles.host, styles.solidLouis]}
        collapsable={false}
      />
    );
  }

  return (
    <View pointerEvents="none" style={styles.host} collapsable={false}>
      <LinearGradient
        pointerEvents="none"
        colors={['#000000', 'rgba(0,0,0,0)']}
        locations={[0, 1]}
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
    height: MASK_HEIGHT,
    zIndex: 9998,
    elevation: 9998,
  },
  solidLouis: {
    backgroundColor: '#000000',
  },
  gradient: {
    flex: 1,
    width: '100%',
  },
});
