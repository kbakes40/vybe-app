/**
 * Shadow-sexy source marks for Now Playing (no third-party logos).
 * Video = red neon, Music = pink glow, Waves = orange pulse — RN View shadows + SVG cores.
 */
import React from 'react';
import { View, Platform } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Circle, G } from 'react-native-svg';

type Props = { size?: number };

function neonHost(color: string, size: number, children: React.ReactNode) {
  const r = Math.max(8, size * 0.52);
  return (
    <View
      style={{
        width: size,
        height: size,
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: Platform.OS === 'ios' ? 0.96 : 0.9,
        shadowRadius: r,
        elevation: Platform.OS === 'android' ? Math.min(22, Math.round(size * 1.05)) : 0,
      }}
    >
      {children}
    </View>
  );
}

/** Vybe Video — red neon play tile */
export function VybeVideoNeonIcon({ size = 16 }: Props) {
  const s = size;
  const p = s * 0.22;
  const play = `M ${s * 0.34} ${p} L ${s * 0.34} ${s - p} L ${s * 0.78} ${s * 0.5} Z`;
  return neonHost('#FF0033', s, (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <Defs>
        <LinearGradient id="vvGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FF3355" />
          <Stop offset="1" stopColor="#CC0000" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={s} height={s} rx={s * 0.18} fill="url(#vvGrad)" />
      <Path d={play} fill="#FFFFFF" />
    </Svg>
  ));
}

/** Vybe Music — pink glow note disc */
export function VybeMusicNeonIcon({ size = 16 }: Props) {
  const s = size;
  const cx = s * 0.5;
  const cy = s * 0.5;
  return neonHost('#FF2D95', s, (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <Defs>
        <LinearGradient id="vmGrad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FF6BB5" />
          <Stop offset="1" stopColor="#D91A72" />
        </LinearGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={s * 0.42} fill="url(#vmGrad)" />
      <Path
        d={`M ${s * 0.58} ${s * 0.28} L ${s * 0.58} ${s * 0.62} L ${s * 0.38} ${s * 0.55} L ${s * 0.38} ${s * 0.38} Z`}
        fill="#FFFFFF"
        opacity={0.95}
      />
      <Circle cx={s * 0.38} cy={s * 0.62} r={s * 0.07} fill="#FFFFFF" />
    </Svg>
  ));
}

/** Vybe Waves — orange pulse (three arcs) */
export function VybeWavesNeonIcon({ size = 16 }: Props) {
  const s = size;
  return neonHost('#FF6600', s, (
    <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <Defs>
        <LinearGradient id="vwGrad" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor="#FF8833" />
          <Stop offset="1" stopColor="#E64A00" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={s} height={s} rx={s * 0.18} fill="url(#vwGrad)" />
      <G stroke="#FFFFFF" strokeWidth={Math.max(1.2, s * 0.08)} strokeLinecap="round" fill="none">
        <Path d={`M ${s * 0.22} ${s * 0.42} Q ${s * 0.5} ${s * 0.28} ${s * 0.78} ${s * 0.42}`} />
        <Path d={`M ${s * 0.22} ${s * 0.52} Q ${s * 0.5} ${s * 0.38} ${s * 0.78} ${s * 0.52}`} />
        <Path d={`M ${s * 0.22} ${s * 0.62} Q ${s * 0.5} ${s * 0.48} ${s * 0.78} ${s * 0.62}`} />
      </G>
    </Svg>
  ));
}
