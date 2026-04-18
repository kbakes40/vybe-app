/**
 * Subtle radial backdrop tints for playlist shells — maps editorial / Vybe keywords
 * to Shadow Sexy–aligned palettes (deep navy base + vibe-specific glow).
 */
export type VybeBackdropRadial = {
  center: string;
  edge: string;
  /** Optional third stop for LinearGradient compatibility */
  fade: string;
};

export function radialBackdropForPlaylistName(name: string): VybeBackdropRadial {
  const n = name.toLowerCase();

  if (/(noir|shadow|late night|tape)/.test(n)) {
    return { center: 'rgba(88, 28, 135, 0.35)', edge: '#050508', fade: '#000000' };
  }
  if (/(signal|electronic|edm|techno|synth)/.test(n)) {
    return { center: 'rgba(6, 182, 212, 0.22)', edge: '#05080a', fade: '#000000' };
  }
  if (/(concrete|hip|rap|trap|grit)/.test(n)) {
    return { center: 'rgba(120, 113, 108, 0.28)', edge: '#0a0908', fade: '#000000' };
  }
  if (/(still|ambient|focus|calm|chill)/.test(n)) {
    return { center: 'rgba(59, 130, 246, 0.2)', edge: '#05070c', fade: '#000000' };
  }
  if (/(burn|rock|overload|metal)/.test(n)) {
    return { center: 'rgba(220, 38, 38, 0.35)', edge: '#140502', fade: '#000000' };
  }
  if (/(pulse|pop|chart|hit)/.test(n)) {
    return { center: 'rgba(217, 70, 239, 0.22)', edge: '#0a050c', fade: '#000000' };
  }
  if (/(chill|relax|lofi|wave)/.test(n)) {
    return { center: 'rgba(245, 158, 11, 0.18)', edge: '#080604', fade: '#000000' };
  }

  return { center: 'rgba(15, 23, 42, 0.55)', edge: '#020617', fade: '#000000' };
}
