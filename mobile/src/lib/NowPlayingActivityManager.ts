import { NativeModules, Platform } from 'react-native';

const { VybeNowPlayingActivity } = NativeModules;
const isAvailable = Platform.OS === 'ios' && !!VybeNowPlayingActivity;

// ── Time formatting ────────────────────────────────────────────────────────────

export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Module API ─────────────────────────────────────────────────────────────────

/**
 * Start the Now Playing Live Activity (Dynamic Island / Lock Screen widget).
 * Downloads artwork, compresses to 60×60 JPEG, and starts the activity.
 * Safe to call on Android or older iOS — no-ops silently.
 */
export async function startNowPlayingActivity(
  trackName: string,
  artistName: string,
  artworkURL: string,
  duration: number
): Promise<void> {
  if (!isAvailable) return;
  try {
    await VybeNowPlayingActivity.startNowPlaying(
      trackName,
      artistName,
      artworkURL ?? '',
      formatTime(duration)
    );
  } catch {}
}

/**
 * Push a progress update to the Live Activity.
 * Call every ~1s while playing; the system throttles if updates come too fast.
 */
export function updateNowPlayingActivity(
  isPlaying: boolean,
  progress: number,
  currentTime: number,
  duration: number,
  trackName: string,
  artistName: string
): void {
  if (!isAvailable) return;
  try {
    VybeNowPlayingActivity.updateNowPlaying(
      isPlaying,
      Math.max(0, Math.min(1, progress)),
      formatTime(currentTime),
      trackName,
      artistName,
      formatTime(duration)
    );
  } catch {}
}

/**
 * End the Now Playing Live Activity immediately.
 */
export function endNowPlayingActivity(): void {
  if (!isAvailable) return;
  try {
    VybeNowPlayingActivity.endNowPlaying();
  } catch {}
}
