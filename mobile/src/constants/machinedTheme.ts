/** Global “Machined Blue” + neon cyan system — Search, Discover, Library, Social, Settings, tabs. */

export const VIBRANT_BLUE = '#00E5FF';
/** Secondary lines — artist, sizes, live/source labels */
export const GRAPHITE_GREY = '#666666';
export const SHADOW_BLUE = '#0891B2';
export const SHADOW_BLUE_SOFT = 'rgba(8, 145, 178, 0.55)';
export const MACHINED_BLUE_MID = '#22D3EE';

/** OLED + deep navy surfaces */
export const OLED_BLACK = '#000000';
export const NAVY_TRACK = '#061018';
export const NAVY_TRACK_ACTIVE = '#0a1c2e';

/** Subtle vertical/angled wash for category / crate tiles */
export const CATEGORY_TILE_GRADIENT = ['#0a1626', '#050c18', '#08080c'] as const;
export const CRATE_TILE_TINT_GRADIENT = ['rgba(0,229,255,0.12)', 'transparent', 'rgba(0,0,0,0.55)'] as const;

export const NEON_IOS_SHADOW = {
  shadowColor: VIBRANT_BLUE,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0.75,
  shadowRadius: 10,
} as const;
