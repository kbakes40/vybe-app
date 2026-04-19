import { NativeModules, Platform } from 'react-native';
import { usePillLockStore } from '@/stores/pillLockStore';

const { VybeNowPlayingActivity, VybeDownloadActivity } = NativeModules as {
  VybeNowPlayingActivity?: {
    startNowPlaying: (...a: unknown[]) => Promise<void>;
    updateNowPlaying: (...a: unknown[]) => void;
    endNowPlaying: () => void;
    terminateAllNowPlayingMetadata?: () => void;
    /** Theme accent — persisted for native chrome / future Live Activity theming (not MPNowPlaying tint). */
    updateAccentColor?: (hex: string) => void;
  };
  VybeDownloadActivity?: { terminateAllActivities?: () => Promise<void> };
};
const isAvailable = Platform.OS === 'ios' && !!VybeNowPlayingActivity;

function isIslandSurfaceAllowed(): boolean {
  return usePillLockStore.getState().allowIslandSurfaces;
}

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
  albumTitle: string;
} | null = null;
let throttleTimer: ReturnType<typeof setTimeout> | null = null;

function flushThrottledUpdate() {
  throttleTimer = null;
  if (!isAvailable || !isIslandSurfaceAllowed() || !pendingUpdate) {
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
      p.albumTitle,
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
  albumTitle?: string,
): Promise<void> {
  if (!isAvailable || !isIslandSurfaceAllowed()) return;
  try {
    await VybeNowPlayingActivity.startNowPlaying(
      trackName,
      artistName,
      artworkURL ?? '',
      Math.max(0, duration),
      albumTitle ?? '',
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
  albumTitle?: string,
): void {
  if (!isAvailable || !isIslandSurfaceAllowed()) return;
  pendingUpdate = {
    isPlaying,
    progress: Math.max(0, Math.min(1, progress)),
    currentTime: Math.max(0, currentTime),
    duration: Math.max(0, duration),
    trackName,
    artistName,
    albumTitle: albumTitle ?? '',
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

/**
 * PILL_LOCK_V2 — tear down native Now Playing metadata + ActivityKit download
 * Live Activities (sign out / auth surface / policy off).
 */
/**
 * Push the current UI accent to native. Apple does not expose Dynamic Island
 * pill chrome tint via `MPNowPlayingInfoCenter`; this keeps the hex on the
 * native side for consistency with in-app pill / future widgets.
 */
export function updateNativeThemeAccent(hex: string): void {
  if (Platform.OS !== 'ios') return;
  try {
    VybeNowPlayingActivity?.updateAccentColor?.(hex);
  } catch {
    /* optional bridge on older builds */
  }
}

export function terminateAllPillNative(): void {
  pendingUpdate = null;
  if (throttleTimer) {
    clearTimeout(throttleTimer);
    throttleTimer = null;
  }
  if (Platform.OS !== 'ios') return;
  try {
    VybeNowPlayingActivity?.terminateAllNowPlayingMetadata?.();
  } catch {}
  try {
    VybeDownloadActivity?.terminateAllActivities?.();
  } catch {}
}
