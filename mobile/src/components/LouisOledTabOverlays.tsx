import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { isLouisDevice, LOUIS_SCROLL_TOP_FADE_HEIGHT_PT } from '@/constants/louisOledProfile';

/**
 * Louis-only: 15–20pt pure-black linear ramp at the physical top so scroll content
 * dissolves into OLED before sliding under the in-app pill (no accent grey wash).
 */
export function LouisOledTabOverlays() {
  if (Platform.OS !== 'ios' || !isLouisDevice()) return null;

  return (
    <View pointerEvents="none" style={[styles.host, { height: LOUIS_SCROLL_TOP_FADE_HEIGHT_PT }]} collapsable={false}>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,1)', 'rgba(0,0,0,1)', 'rgba(0,0,0,0)']}
        locations={[0, 0.45, 1]}
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
    zIndex: 40,
    elevation: 40,
  },
  gradient: {
    flex: 1,
    width: '100%',
  },
});
