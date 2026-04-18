/**
 * Playback persistence uses MMKV via `playbackController` (`vybe-playback-snapshot`).
 * Tracks are written when the queue / current track identity changes; hydration runs at module load.
 * Call `ensurePlaybackHydratedFromStorage` on sensitive UI mount if the bar can appear before store sync.
 */
export { ensurePlaybackHydratedFromStorage } from '@/stores/playbackController';
