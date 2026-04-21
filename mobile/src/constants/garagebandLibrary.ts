/** Dynamic Island–aligned chrome (progress, accents). */
export const PILL_CYAN = '#00E5FF';

/** Neon accent stops for primary Play controls. */
export const SEXY_FIRE_GRADIENT = ['#FF2D55', '#FF6B00', '#FFB020'] as const;

/**
 * One GarageBand bounce + cover. Metro requires static `require()` per file —
 * add rows here after exporting to `assets/music/garageband/`.
 *
 * @example
 * ```ts
 * {
 *   id: 'late-night-mix-1',
 *   title: 'Late Night Mix',
 *   artist: 'You',
 *   audioModule: require('../../assets/music/garageband/late_night_mix.m4a'),
 *   artModule: require('../../assets/music/garageband/late_night_mix.jpg'),
 *   mixedAt: Date.now(),
 * }
 * ```
 */
export type GarageBandVinylDefinition = {
  id: string;
  title: string;
  artist: string;
  /** `require('./track.m4a')` or `.mp3` */
  audioModule: number;
  /** `require('./track.jpg')` — 4K OK; home list decodes smaller for 60fps scroll */
  artModule: number;
  mixedAt?: number;
};

/** Empty until you register `require()` pairs (see README in assets folder). */
export const GARAGEBAND_VINYLS: GarageBandVinylDefinition[] = [];
