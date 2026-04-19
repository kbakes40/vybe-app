/** Default “Machined Cyan” — matches legacy `SHADOW_TAB_ACTIVE` / pill chrome. */
export const DEFAULT_ACCENT_HEX = '#00FFFF';

export function normalizeAccentHex(input: string): string | null {
  const s = input.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toUpperCase();
  return null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = normalizeAccentHex(hex.startsWith('#') ? hex : `#${hex}`) ?? DEFAULT_ACCENT_HEX;
  const c = n.slice(1);
  return {
    r: parseInt(c.slice(0, 2), 16),
    g: parseInt(c.slice(2, 4), 16),
    b: parseInt(c.slice(4, 6), 16),
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Full-saturation / full-value hue ring → `#RRGGBB` (for hue slider). */
export function hsvHueToHex(hueDeg: number): string {
  const h = ((hueDeg % 360) + 360) % 360;
  const s = 1;
  const v = 1;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const r = Math.round((rp + m) * 255);
  const g = Math.round((gp + m) * 255);
  const b = Math.round((bp + m) * 255);
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Recover hue [0,360) from an sRGB hex accent (for slider sync). */
/** Three-stop “machined” headline gradient from the live UI accent. */
export function accentMachinedGradientStops(accent: string): readonly [string, string, string] {
  const { r, g, b } = hexToRgb(accent);
  const mid = `rgb(${Math.round(r * 0.55 + 34 * 0.45)}, ${Math.round(g * 0.55 + 211 * 0.45)}, ${Math.round(
    b * 0.55 + 238 * 0.45,
  )})`;
  const end = `rgb(${Math.round(r * 0.25 + 8 * 0.75)}, ${Math.round(g * 0.25 + 145 * 0.75)}, ${Math.round(
    b * 0.25 + 178 * 0.75,
  )})`;
  return [accent, mid, end] as const;
}

export function accentHexToHue(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d < 1e-4) return 0;
  let h = 0;
  if (max === rn) h = 60 * (((gn - bn) / d) % 6);
  else if (max === gn) h = 60 * ((bn - rn) / d + 2);
  else h = 60 * ((rn - gn) / d + 4);
  return ((h % 360) + 360) % 360;
}
