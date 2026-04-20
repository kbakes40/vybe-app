import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useThemeStore } from '@/stores/themeStore';

/**
 * Corporate-minimal list affordance — “V” mark (nav visualizer), not an iOS chevron.
 * Stroke follows the live theme accent (machined cyan on Infinite Black).
 */
export function ListDisclosureMark({ size = 15 }: { size?: number }) {
  const accent = useThemeStore((s) => s.accentColor);
  const h = Math.round(size * 1.05);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="More"
      style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={h} viewBox="0 0 16 16">
        <Path
          d="M3 3 L8 13 L13 3"
          stroke={accent}
          strokeWidth={2.35}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
