import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * PILL_LOCK_V2 — “melting” top fade so scrolling content (e.g. Decades Vault)
 * dissolves before the Dynamic Island / hardware pill band. Sits at zIndex
 * 9997, below in-app pill chrome (9998) and the interactive pill (9999).
 */
export function DynamicIslandTopFade() {
  if (Platform.OS !== 'ios') return null;

  return (
    <View pointerEvents="none" style={styles.host} collapsable={false}>
      <LinearGradient
        pointerEvents="none"
        colors={['#000000', 'rgba(0,0,0,0.8)', 'transparent']}
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
    height: 100,
    zIndex: 9997,
    elevation: 9997,
  },
  gradient: {
    flex: 1,
    width: '100%',
  },
});
