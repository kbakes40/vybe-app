import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

/**
 * Minimal outline saxophone — matches Lucide-style stroke caps / weight used on genre cards.
 */
export function GenreSaxophoneIcon({ size = 24, color = '#F59E0B', strokeWidth = 1.65 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Main body + bell curve */}
      <Path
        d="M18.75 3.75L16.85 5.65C14.9 7.6 12.85 7.35 10.95 8.55C9.1 9.7 8.05 11.85 8.05 14.05V15.35C8.05 17.45 9.75 19.25 11.85 19.55C14.05 19.85 16.1 18.45 16.85 16.35"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Bell flare */}
      <Path
        d="M5.25 16.85C4.65 17.85 5.15 19.45 6.85 19.95C8.55 20.45 10.35 19.35 10.85 17.65"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Mouthpiece / crook */}
      <Path
        d="M18.75 3.75L20.25 2.25"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Key posts — minimal circles, same visual weight as Lucide stroke icons */}
      <Circle cx="11.1" cy="10.45" r="0.65" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <Circle cx="13.35" cy="12.05" r="0.65" stroke={color} strokeWidth={strokeWidth} fill="none" />
      <Circle cx="9.75" cy="13.15" r="0.65" stroke={color} strokeWidth={strokeWidth} fill="none" />
    </Svg>
  );
}
