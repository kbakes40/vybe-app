import React from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { Cloud } from 'lucide-react-native';
import { VIBRANT_BLUE, NEON_IOS_SHADOW } from '@/constants/machinedTheme';

type Props = {
  size?: number;
  disabled?: boolean;
  strokeWidth?: number;
};

/** Glowing machined-cyan cloud — sync / vault / ingest actions. */
export function MachinedCloudIcon({ size = 22, disabled = false, strokeWidth = 2 }: Props) {
  const color = disabled ? 'rgba(255,255,255,0.35)' : VIBRANT_BLUE;
  return (
    <View
      style={[
        styles.wrap,
        !disabled && Platform.OS === 'ios' ? NEON_IOS_SHADOW : null,
        !disabled && Platform.OS === 'android' ? { elevation: 8 } : null,
      ]}
    >
      <Cloud size={size} color={color} strokeWidth={strokeWidth} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
