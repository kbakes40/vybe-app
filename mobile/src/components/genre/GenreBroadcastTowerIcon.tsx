import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

/**
 * Distinct broadcast-tower glyph for the Global Radio browse tile — an
 * A-frame transmitter mast with twin signal arcs and a filled emitter at the
 * apex. Differs from Lucide's stock `Radio` (a pulse / boombox silhouette)
 * so the Radio tile reads as "broadcast", not "generic".
 *
 * 24×24 viewBox, same stroke caps / weight as {@link GenreSaxophoneIcon}.
 */
export function GenreBroadcastTowerIcon({
  size = 24,
  color = '#00E5FF',
  strokeWidth = 1.65,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Inner signal arcs — tight pair flanking the emitter */}
      <Path
        d="M 10 4.6 A 2.8 2.8 0 0 0 10 9.4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M 14 4.6 A 2.8 2.8 0 0 1 14 9.4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      {/* Outer signal arcs — wider sweep for the "broadcasting" read */}
      <Path
        d="M 8 2.7 A 5.2 5.2 0 0 0 8 11.3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M 16 2.7 A 5.2 5.2 0 0 1 16 11.3"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      {/* Emitter pulse — filled so it pops against the grain-noise tile */}
      <Circle cx="12" cy="7" r="1.35" fill={color} />
      {/* A-frame tower — legs converge to the emitter, short cross-brace
          mid-span, landing on a stubby ground line. */}
      <Path
        d="M 8 21 L 12 8.3 L 16 21"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M 10 15 L 14 15"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M 6.5 21 L 17.5 21"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
