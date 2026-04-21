import React from 'react';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';

const STROKE = 1.5;
const CYAN = '#00E5FF';
const MUTED = 'rgba(255,255,255,0.85)';

type GlyphProps = { size?: number; color?: string };

/** Minimalist technical sine / carrier wave — Phonk / spectrum metaphor. */
export function GlyphSineWave({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  const mid = h / 2;
  const amp = h * 0.22;
  const d = `M ${w * 0.08} ${mid} Q ${w * 0.25} ${mid - amp} ${w * 0.42} ${mid} T ${w * 0.75} ${mid} T ${w * 0.92} ${mid}`;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Path d={d} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

/** ECG-style heartbeat — Gym / high-energy. */
export function GlyphHeartbeat({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  const d = `M ${w * 0.05} ${h * 0.55} L ${w * 0.2} ${h * 0.55} L ${w * 0.28} ${h * 0.35} L ${w * 0.38} ${h * 0.75} L ${w * 0.48} ${h * 0.2} L ${w * 0.58} ${h * 0.6} L ${w * 0.68} ${h * 0.45} L ${w * 0.78} ${h * 0.55} L ${w * 0.95} ${h * 0.55}`;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Path d={d} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Saxophone outline — search / jazz lane. */
export function GlyphSaxophone({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  const d = `M ${w * 0.72} ${h * 0.12} Q ${w * 0.55} ${h * 0.18} ${w * 0.48} ${h * 0.32} L ${w * 0.38} ${h * 0.62} Q ${w * 0.32} ${h * 0.78} ${w * 0.22} ${h * 0.88} M ${w * 0.48} ${h * 0.32} L ${w * 0.58} ${h * 0.38} M ${w * 0.42} ${h * 0.48} L ${w * 0.52} ${h * 0.52} M ${w * 0.65} ${h * 0.15} L ${w * 0.78} ${h * 0.08}`;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Path d={d} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Circle + user silhouette — account / identity. */
export function GlyphCircleUser({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  const cx = w / 2;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Circle cx={cx} cy={h * 0.32} r={w * 0.12} fill="none" stroke={color} strokeWidth={STROKE} />
      <Path
        d={`M ${w * 0.18} ${h * 0.92} Q ${cx} ${h * 0.58} ${w * 0.82} ${h * 0.92}`}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Midnight / industrial grid. */
export function GlyphMidnightGrid({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Path
        d={`M ${w * 0.2} ${h * 0.25} L ${w * 0.8} ${h * 0.25} M ${w * 0.2} ${h * 0.5} L ${w * 0.8} ${h * 0.5} M ${w * 0.2} ${h * 0.75} L ${w * 0.8} ${h * 0.75} M ${w * 0.35} ${h * 0.15} L ${w * 0.35} ${h * 0.85} M ${w * 0.65} ${h * 0.15} L ${w * 0.65} ${h * 0.85}`}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Ambient / flow curves. */
export function GlyphAmbientFlow({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  const d = `M ${w * 0.08} ${h * 0.65} Q ${w * 0.35} ${h * 0.25} ${w * 0.55} ${h * 0.55} T ${w * 0.92} ${h * 0.35}`;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Path d={d} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

/** All / matrix — four nodes. */
export function GlyphAllMatrix({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  const r = w * 0.06;
  const pts: [number, number][] = [
    [w * 0.28, h * 0.28],
    [w * 0.72, h * 0.28],
    [w * 0.28, h * 0.72],
    [w * 0.72, h * 0.72],
  ];
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {pts.map(([cx, cy], i) => (
        <Circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={STROKE} />
      ))}
      <Path
        d={`M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]} M ${pts[2][0]} ${pts[2][1]} L ${pts[3][0]} ${pts[3][1]} M ${pts[0][0]} ${pts[0][1]} L ${pts[2][0]} ${pts[2][1]} M ${pts[1][0]} ${pts[1][1]} L ${pts[3][0]} ${pts[3][1]}`}
        fill="none"
        stroke={color}
        strokeWidth={STROKE * 0.85}
        strokeOpacity={0.35}
      />
    </Svg>
  );
}

/** Chill — soft arc. */
export function GlyphChillArc({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  const d = `M ${w * 0.12} ${h * 0.55} Q ${w * 0.5} ${h * 0.18} ${w * 0.88} ${h * 0.55}`;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Path d={d} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  );
}

/** Late night — technical clock dial. */
export function GlyphLateNight({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  const c = w / 2;
  const cy = h / 2;
  const r = w * 0.32;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Circle cx={c} cy={cy} r={r} fill="none" stroke={color} strokeWidth={STROKE} />
      <Path
        d={`M ${c} ${cy} L ${c + r * 0.45} ${cy - r * 0.15} M ${c} ${cy} L ${c - r * 0.2} ${cy + r * 0.35}`}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Focus — crosshair. */
export function GlyphFocusCross({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  const c = w / 2;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Circle cx={c} cy={h / 2} r={w * 0.28} fill="none" stroke={color} strokeWidth={STROKE} />
      <Path
        d={`M ${c} ${h * 0.12} L ${c} ${h * 0.38} M ${c} ${h * 0.62} L ${c} ${h * 0.88} M ${w * 0.12} ${h / 2} L ${w * 0.38} ${h / 2} M ${w * 0.62} ${h / 2} L ${w * 0.88} ${h / 2}`}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Radio — antenna + concentric broadcast arcs. */
export function GlyphRadioBroadcast({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  const cx = w / 2;
  const cy = h * 0.6;
  const r = w * 0.08;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Circle cx={cx} cy={cy} r={r} fill={color} stroke="none" />
      <Path
        d={`M ${cx - w * 0.2} ${cy - h * 0.02} Q ${cx} ${cy - h * 0.3} ${cx + w * 0.2} ${cy - h * 0.02}`}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Path
        d={`M ${cx - w * 0.32} ${cy - h * 0.06} Q ${cx} ${cy - h * 0.46} ${cx + w * 0.32} ${cy - h * 0.06}`}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeOpacity={0.7}
      />
      <Path
        d={`M ${cx} ${cy - r} L ${cx} ${h * 0.12}`}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Fast — velocity ticks. */
export function GlyphFastVelocity({ size = 32, color = MUTED }: GlyphProps) {
  const w = size;
  const h = size;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Polyline
        points={`${w * 0.1},${h * 0.7} ${w * 0.35},${h * 0.45} ${w * 0.55},${h * 0.55} ${w * 0.8},${h * 0.3}`}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d={`M ${w * 0.72} ${h * 0.22} L ${w * 0.88} ${h * 0.28} L ${w * 0.82} ${h * 0.42}`} fill="none" stroke={color} strokeWidth={STROKE} strokeLinejoin="round" />
    </Svg>
  );
}

export function vibeChipGlyph(id: string, active: boolean) {
  const color = active ? CYAN : MUTED;
  const s = 28;
  switch (id) {
    case 'all':
      return <GlyphAllMatrix size={s} color={color} />;
    case 'chill':
      return <GlyphChillArc size={s} color={color} />;
    case 'phonk':
      return <GlyphSineWave size={s} color={color} />;
    case 'gym':
      return <GlyphHeartbeat size={s} color={color} />;
    case 'late':
      return <GlyphLateNight size={s} color={color} />;
    case 'focus':
      return <GlyphFocusCross size={s} color={color} />;
    case 'fast':
      return <GlyphFastVelocity size={s} color={color} />;
    case 'radio':
      return <GlyphRadioBroadcast size={s} color={color} />;
    default:
      return <GlyphSineWave size={s} color={color} />;
  }
}

export function collectionGlyph(key: 'midnight' | 'hi' | 'ambient', color = MUTED) {
  const s = 40;
  switch (key) {
    case 'midnight':
      return <GlyphMidnightGrid size={s} color={color} />;
    case 'hi':
      return <GlyphHeartbeat size={s} color={color} />;
    case 'ambient':
      return <GlyphAmbientFlow size={s} color={color} />;
    default:
      return <GlyphSineWave size={s} color={color} />;
  }
}
