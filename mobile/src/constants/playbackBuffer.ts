/**
 * Desired A/V buffering targets. expo-av has no TrackPlayer-style `bufferConfig`;
 * `playbackController` maps `minBufferMs` → `loadAsync(..., downloadFirst)` for YouTube proxy paths.
 */
export const VYBE_TRACK_PLAYER_BUFFER_CONFIG = {
  minBufferMs: 15_000,
  playBufferMs: 3_000,
} as const;
