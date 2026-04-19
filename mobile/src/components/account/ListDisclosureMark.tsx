import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { NAV_BAR_PURPLE } from '@/constants/machinedTheme';

/** Corporate-minimal list affordance — single purple mark (no iOS chevron). */
export function ListDisclosureMark({ size = 14 }: { size?: number }) {
  const h = Math.round(size * 1.14);
  return (
    <Svg width={size} height={h} viewBox="0 0 14 16" accessibilityIgnoresInvertColors>
      <Path
        d="M4 2 L10 8 L4 14"
        stroke={NAV_BAR_PURPLE}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
