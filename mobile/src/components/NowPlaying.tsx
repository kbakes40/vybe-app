/**
 * Barrel for tooling / imports that expect `src/components/NowPlaying`.
 * Implementation: `src/app/(app)/nowPlaying.tsx`.
 */
export { default as NowPlayingScreen, NowPlayingScreenContent } from '@/app/(app)/nowPlaying';
export { RotatingVinyl } from '@/components/NowPlaying/RotatingVinyl';
export {
  VybeVideoNeonIcon,
  VybeMusicNeonIcon,
  VybeWavesNeonIcon,
  prefetchVybeNowPlayingIcons,
} from '@/assets/icons';
