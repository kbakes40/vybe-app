/**
 * Vybe design tokens — dark, performance-forward, story-led.
 * Avoid playful/candy hues; keep contrast surgical.
 */
export const vybe = {
  bg: {
    base: '#0A0A0A',
    elevated: '#111113',
    card: '#141416',
  },
  border: {
    subtle: 'rgba(255,255,255,0.06)',
    crisp: 'rgba(255,255,255,0.12)',
    focus: 'rgba(255,255,255,0.22)',
  },
  text: {
    primary: '#F4F4F5',
    secondary: 'rgba(244,244,245,0.55)',
    muted: 'rgba(244,244,245,0.35)',
  },
  accent: {
    signal: '#E8E8EC',
    heat: '#C2410C',
    ice: '#94A3B8',
  },
  glass: {
    fill: 'rgba(255,255,255,0.04)',
    fillStrong: 'rgba(255,255,255,0.07)',
  },
} as const;
