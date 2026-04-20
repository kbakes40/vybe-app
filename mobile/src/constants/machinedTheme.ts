/** Global machined cyan system + nav purple accents — Search, Discover, Library, Social, Settings, tabs. */

/** Spec UI_ALIGNMENT: primary machined cyan (replaces legacy “DaVinci” teal in account surfaces). */
export const MACHINED_CYAN = '#00FFFF';
/** Legacy app cyan — prefer {@link MACHINED_CYAN} on Account / Settings / Plan. */
export const VIBRANT_BLUE = '#00E5FF';
/** Bottom Doc hairline, active tab, and Vybe Discover glow — same token as {@link VIBRANT_BLUE}. */
export const DOCK_CYAN = '#00E5FF';
/** Tab bar / account list iconography — unified purple (not “DaVinci blue”). */
export const NAV_BAR_PURPLE = '#8B5CF6';
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

/** Matches Dynamic Island `metaFormatBadge` (FLAC / LOSSLESS) — settings device pills. */
export const PILL_LOSSLESS_BADGE_TEXT = {
  fontSize: 8,
  fontWeight: '900' as const,
  letterSpacing: 1.1,
  textTransform: 'uppercase' as const,
};
