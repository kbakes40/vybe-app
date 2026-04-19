import { getColors } from 'react-native-image-colors';
import { normalizeAccentHex } from '@/lib/themeColorUtils';

function parseRgbLike(input: string): { r: number; g: number; b: number } | null {
  if (!input) return null;
  const hex = input.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  const rgb = input.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  return null;
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const h = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function isTooDark(color: { r: number; g: number; b: number }): boolean {
  const lum = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
  return lum < 0.1;
}

/**
 * Best-effort dominant sRGB hex from remote artwork (album cover).
 * Returns normalized `#RRGGBB` or null if extraction fails / color unusable.
 */
export async function pickArtworkAccentHex(artworkUrl: string): Promise<string | null> {
  const trimmed = artworkUrl.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const result = await getColors(trimmed, {
      fallback: '#00FFFF',
      cache: true,
      key: trimmed,
    });
    let picked: string | null = null;
    if (result.platform === 'ios') {
      picked = result.primary ?? result.background ?? result.detail ?? null;
    } else if (result.platform === 'android') {
      picked = result.dominant ?? result.vibrant ?? result.average ?? null;
    } else if (result.platform === 'web') {
      picked = result.dominant ?? result.vibrant ?? null;
    }
    if (!picked) return null;
    const rgb = parseRgbLike(picked);
    if (!rgb || isTooDark(rgb)) return null;
    const hex = toHex(rgb);
    return normalizeAccentHex(hex);
  } catch {
    return null;
  }
}
