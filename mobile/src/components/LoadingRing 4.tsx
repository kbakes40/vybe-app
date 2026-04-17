import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { Svg, Circle } from 'react-native-svg';

interface LoadingRingProps {
  size?: number;
  color?: string;
  trackColor?: string;
  strokeWidth?: number;
  durationMs?: number;
}

export function LoadingRing({
  size = 28,
  color = '#3B82F6',
  trackColor = 'rgba(255,255,255,0.15)',
  strokeWidth = 2.5,
  durationMs = 2500,
}: LoadingRingProps) {
  const RADIUS = (size - strokeWidth) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const TARGET = 0.9;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const next = Math.min(TARGET, (elapsed / durationMs) * TARGET);
      setProgress(next);
      if (next >= TARGET) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [durationMs]);

  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={RADIUS}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={RADIUS}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
    </View>
  );
}
