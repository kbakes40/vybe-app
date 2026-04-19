import { Asset } from 'expo-asset';

// Static SVG modules — `Asset.fromModule` warms the native asset cache when Metro serves them as assets.
const vybeVideo = require('./vybe-video.svg');
const vybeMusic = require('./vybe-music.svg');
const vybeWaves = require('./vybe-waves.svg');

/**
 * Warm Metro / native asset pipeline for vault source marks (vectors + on-disk SVG).
 * Safe to call more than once.
 */
let started = false;

export async function prefetchVybeNowPlayingIcons(): Promise<void> {
  if (started) return;
  started = true;
  // Ensure TSX glyph modules are linked (side-effect).
  await import('./VybeNeonSourceIcons');
  try {
    const ids = [vybeVideo, vybeMusic, vybeWaves] as unknown as number[];
    await Promise.all(ids.map((id) => Asset.fromModule(id).downloadAsync()));
  } catch {
    // Some Metro configs treat `.svg` as React components — neon icons still render from VybeNeonSourceIcons.tsx.
  }
}
