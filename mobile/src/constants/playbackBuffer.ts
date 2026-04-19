import { useSubscriptionStore } from '@/stores/subscriptionStore';

/**
 * Desired A/V buffering targets. expo-av has no TrackPlayer-style `bufferConfig`;
 * `playbackController` maps `minBufferMs` → `loadAsync(..., downloadFirst)` for YouTube proxy paths.
 */
export const VYBE_TRACK_PLAYER_BUFFER_CONFIG = {
  minBufferMs: 15_000,
  playBufferMs: 3_000,
} as const;

/** Premium: smaller buffers so CDN-backed `playAsync` starts sooner (expo-av still OS-buffered). */
const VYBE_TRACK_PLAYER_BUFFER_CONFIG_PREMIUM = {
  minBufferMs: 850,
  playBufferMs: 280,
} as const;

export function getPlaybackBufferConfig() {
  try {
    if (useSubscriptionStore.getState().tier === 'plus') {
      return VYBE_TRACK_PLAYER_BUFFER_CONFIG_PREMIUM;
    }
  } catch {
    /* store unavailable in rare test contexts */
  }
  return VYBE_TRACK_PLAYER_BUFFER_CONFIG;
}
