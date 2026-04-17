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

// ── Throttle native updates (iOS rate-limits Now Playing churn; seeks can flood) ─

const NATIVE_UPDATE_MIN_MS = 500;
let lastNativeUpdateAt = 0;
let pendingUpdate: {
  isPlaying: boolean;
  progress: number;
  currentTime: number;
  duration: number;
  trackName: string;
  artistName: string;
} | null = null;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;

function flushThrottledUpdate() {
  throttleTimer = null;
  if (!isAvailable || !pendingUpdate) {
    pendingUpdate = null;
    return;
  }
  const p = pendingUpdate;
  pendingUpdate = null;
  lastNativeUpdateAt = Date.now();
  try {
    VybeNowPlayingActivity.updateNowPlaying(
      p.isPlaying,
      p.progress,
      p.currentTime,
      p.duration,
      p.trackName,
      p.artistName,
    );
  } catch {}
}

// ── Module API ─────────────────────────────────────────────────────────────────

/**
 * Start Now Playing / Dynamic Island metadata for the current track.
 * Uses seconds for duration (must match native `double` — not a "M:SS" string).
 */
export async function startNowPlayingActivity(
  trackName: string,
  artistName: string,
  artworkURL: string,
  duration: number,
): Promise<void> {
  if (!isAvailable) return;
  try {
    await VybeNowPlayingActivity.startNowPlaying(
      trackName,
      artistName,
      artworkURL ?? '',
      Math.max(0, duration),
    );
  } catch {}
}

/**
 * Push progress + metadata to native. Throttled to at most ~2 Hz to avoid
 * iOS throttling / churn during rapid seeks while keeping the latest state.
 */
export function updateNowPlayingActivity(
  isPlaying: boolean,
  progress: number,
  currentTime: number,
  duration: number,
  trackName: string,
  artistName: string,
): void {
  if (!isAvailable) return;
  pendingUpdate = {
    isPlaying,
    progress: Math.max(0, Math.min(1, progress)),
    currentTime: Math.max(0, currentTime),
    duration: Math.max(0, duration),
    trackName,
    artistName,
  };
  const now = Date.now();
  if (now - lastNativeUpdateAt >= NATIVE_UPDATE_MIN_MS) {
    if (throttleTimer) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
    }
    flushThrottledUpdate();
    return;
  }
  if (!throttleTimer) {
    throttleTimer = setTimeout(flushThrottledUpdate, NATIVE_UPDATE_MIN_MS - (now - lastNativeUpdateAt));
  }
}

/**
 * End the Now Playing activity bridge — stops native updates until the next start.
 */
export function endNowPlayingActivity(): void {
  if (!isAvailable) return;
  pendingUpdate = null;
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  try {
    VybeNowPlayingActivity.endNowPlaying();
  } catch {}
}
