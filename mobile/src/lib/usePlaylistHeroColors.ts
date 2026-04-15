import { useEffect, useState } from 'react';
import { getColors } from 'react-native-image-colors';

// Default palette while artwork is loading — matches the old hardcoded
// purple look of Vybe Mix / Vybe Beats.
const DEFAULT_PALETTE = {
  gradient: ['#3B1F6E', '#2A1550', '#1A0D38', '#0F0821', '#0A0A0A'] as const,
  locations: [0, 0.35, 0.6, 0.82, 1] as const,
  glow: '#8B5CF6',
};

export interface PlaylistHeroColors {
  gradient: readonly string[];
  locations: readonly number[];
  glow: string;
}

/**
 * Parse a CSS-style hex/rgb string into 0-255 RGB components. Returns null
 * if the input can't be parsed — `react-native-image-colors` emits both
 * `#rrggbb` and `rgb(r,g,b)` values depending on platform and field.
 */
function parseColor(input: string): { r: number; g: number; b: number } | null {
  if (!input) return null;
  const hex = input.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }
  const rgb = input.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  }
  return null;
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Mix two RGB colors by a 0–1 ratio (0 = all a, 1 = all b).
 */
function mix(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/**
 * Build a 5-stop gradient from a dominant color down to near-black,
 * mirroring the hand-picked palette we used for the purple look.
 */
function paletteFromDominant(hex: string): PlaylistHeroColors {
  const top = parseColor(hex);
  if (!top) return DEFAULT_PALETTE;
  const bottom = { r: 10, g: 10, b: 10 }; // #0A0A0A
  const stops = [0, 0.35, 0.6, 0.82, 1].map((t) => mix(top, bottom, t));
  return {
    gradient: stops.map(toHex),
    locations: [0, 0.35, 0.6, 0.82, 1],
    glow: hex,
  };
}

/**
 * Reject colors that are too dark to read as a "main" hero color — the
 * gradient still needs to be visibly colored at the top. Anything below
 * ~0.12 perceived luminance falls back to the default palette.
 */
function isTooDark(color: { r: number; g: number; b: number }): boolean {
  const lum = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
  return lum < 0.12;
}

/**
 * Extracts the dominant color from an artwork URL and returns a 5-stop
 * gradient palette + glow color for the playlist hero background. Falls
 * back to the original purple palette while loading or on error.
 *
 * The returned gradient always ends at #0A0A0A so the hero blends into
 * the track list area below, which also has backgroundColor #0A0A0A.
 */
// In-memory cache so revisiting a screen is instant
const colorCache = new Map<string, PlaylistHeroColors>();
const prefetchInFlight = new Set<string>();

/**
 * Prefetch colors for an artwork URL in the background.
 * Call this on the home screen so playlist screens load instantly.
 */
export function prefetchHeroColors(artworkUrl: string | undefined | null): void {
  if (!artworkUrl || colorCache.has(artworkUrl) || prefetchInFlight.has(artworkUrl)) return;
  prefetchInFlight.add(artworkUrl);
  getColors(artworkUrl, { fallback: '#3B1F6E', cache: true, key: artworkUrl })
    .then((result) => {
      let picked: string | null = null;
      if (result.platform === 'ios') {
        picked = result.primary ?? result.background ?? result.detail ?? null;
      } else if (result.platform === 'android') {
        picked = result.dominant ?? result.vibrant ?? result.average ?? null;
      } else if (result.platform === 'web') {
        picked = result.dominant ?? result.vibrant ?? null;
      }
      if (picked) {
        const parsed = parseColor(picked);
        if (parsed && !isTooDark(parsed)) {
          colorCache.set(artworkUrl, paletteFromDominant(toHex(parsed)));
        }
      }
    })
    .catch(() => {})
    .finally(() => prefetchInFlight.delete(artworkUrl));
}

export function usePlaylistHeroColors(artworkUrl: string | undefined | null): PlaylistHeroColors {
  const cached = artworkUrl ? colorCache.get(artworkUrl) : undefined;
  const [palette, setPalette] = useState<PlaylistHeroColors>(cached ?? DEFAULT_PALETTE);

  useEffect(() => {
    if (!artworkUrl) {
      setPalette(DEFAULT_PALETTE);
      return;
    }

    // Return cached result instantly
    const hit = colorCache.get(artworkUrl);
    if (hit) {
      setPalette(hit);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await getColors(artworkUrl, {
          fallback: '#3B1F6E',
          cache: true,
          key: artworkUrl,
        });
        if (cancelled) return;

        // Pick the most saturated/usable color from whichever platform
        // fields are available.
        let picked: string | null = null;
        if (result.platform === 'ios') {
          picked = result.primary ?? result.background ?? result.detail ?? null;
        } else if (result.platform === 'android') {
          picked = result.dominant ?? result.vibrant ?? result.average ?? null;
        } else if (result.platform === 'web') {
          picked = result.dominant ?? result.vibrant ?? null;
        }

        if (!picked) {
          setPalette(DEFAULT_PALETTE);
          return;
        }

        const parsed = parseColor(picked);
        if (!parsed || isTooDark(parsed)) {
          setPalette(DEFAULT_PALETTE);
          return;
        }

        const p = paletteFromDominant(toHex(parsed));
        colorCache.set(artworkUrl, p);
        setPalette(p);
      } catch {
        if (!cancelled) setPalette(DEFAULT_PALETTE);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artworkUrl]);

  return palette;
}
