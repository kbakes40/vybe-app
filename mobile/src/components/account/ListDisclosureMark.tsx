import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { NAV_BAR_PURPLE } from '@/constants/machinedTheme';

/**
 * Corporate-minimal list affordance — primary purple “V” (nav visualizer mark),
 * not an iOS chevron.
 */
export function ListDisclosureMark({ size = 15 }: { size?: number }) {
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
          stroke={NAV_BAR_PURPLE}
          strokeWidth={2.35}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
