/**
 * Playback store facade — the real implementation is `playbackController` (expo-av).
 *
 * YouTube / YouTube Music: `playTrack` normalizes `videoId` from `youtubeMusicId`,
 * `youtubeId`, or `ytm-*` / `yt-*` ids, resolves a stream URL via
 * `@/lib/audio/playbackService`, and writes it to `currentTrack.audioUrl` before decode.
 *
 * @see usePlaybackController
 */
export { VYBE_TRACK_PLAYER_BUFFER_CONFIG } from '@/constants/playbackBuffer';
export { usePlaybackController as usePlaybackStore } from './playbackController';
