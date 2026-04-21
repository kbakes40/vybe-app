/**
 * PILL_IGNITION_V9 — VybeNowPlayingActivity bridge (music Now Playing / Dynamic Island).
 *
 * - **Module key:** `NativeModules.VybeNowPlayingActivity` (spelling **Vybe**, not `Vibe`;
 *   no `Module` suffix — matches `@objc(VybeNowPlayingActivity)` in Swift).
 * - **JS entry:** `startNowPlaying` = 4 args; **`updateNowPlaying`** = 6 args
 *   (`isPlaying`, `progress`, `elapsed`, `total`, `trackName`, `artistName`).
 *   On load we wrap the native methods to **truncate** extra args so a stale JS
 *   chunk (e.g. still passing `albumTitle`) cannot crash the bridge against older
 *   native binaries.
 * - **ActivityKit `VybeActivityAttributes`:** used only by **download** Live Activities
 *   (`VybeDownloadActivity`). This bridge uses **MPNowPlayingInfoCenter**, not that struct.
 */
import { NativeModules, Platform } from 'react-native';
import { usePillLockStore } from '@/stores/pillLockStore';

type VybeNowPlayingActivityModule = {
  startNowPlaying: (...a: unknown[]) => Promise<void>;
  updateNowPlaying: (...a: unknown[]) => void;
  endNowPlaying: () => void;
  terminateAllNowPlayingMetadata?: () => void;
  /** Theme accent — persisted for native chrome / future Live Activity theming (not MPNowPlaying tint). */
  updateAccentColor?: (hex: string) => void;
};

const nmTyped = NativeModules as {
  VybeNowPlayingActivity?: VybeNowPlayingActivityModule;
  VybeDownloadActivity?: { terminateAllActivities?: () => Promise<void> };
};

const islandArityPatchApplied = new WeakSet<object>();

/** Older JS sometimes passed an extra `albumTitle` / 5th `start` arg — native rejects. */
function patchVybeNowPlayingActivityArityOnce(): void {
  if (Platform.OS !== 'ios') return;
  const mod = nmTyped.VybeNowPlayingActivity as object | undefined;
  if (!mod || islandArityPatchApplied.has(mod)) return;
  try {
    const m = mod as VybeNowPlayingActivityModule;
    if (typeof m.updateNowPlaying === 'function') {
      const rawUpdate = m.updateNowPlaying.bind(m);
      m.updateNowPlaying = (...args: unknown[]) => {
        void rawUpdate(...args.slice(0, 6));
      };
    }
    if (typeof m.startNowPlaying === 'function') {
      const rawStart = m.startNowPlaying.bind(m);
      m.startNowPlaying = (...args: unknown[]) => rawStart(...args.slice(0, 4)) as Promise<void>;
    }
    islandArityPatchApplied.add(mod);
  } catch {
    /* NativeModules may be non-extensible on some builds — rely on correct call sites. */
  }
}

patchVybeNowPlayingActivityArityOnce();

const VybeNowPlayingActivity = nmTyped.VybeNowPlayingActivity;
const VybeDownloadActivity = nmTyped.VybeDownloadActivity;
const isAvailable = Platform.OS === 'ios' && !!VybeNowPlayingActivity;

if (__DEV__ && Platform.OS === 'ios') {
  const nm = NativeModules as Record<string, unknown>;
  if (!nm.VybeNowPlayingActivity) {
    console.warn(
      '[PILL_IGNITION_V9] NativeModules.VybeNowPlayingActivity is missing — clean rebuild the iOS app (VybeNowPlayingActivityModule must be in the main target).',
    );
  }
}

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
  if (!isAvailable) {
    if (__DEV__) console.log('[NowPlaying] start BLOCKED: bridge unavailable', { platform: Platform.OS, hasModule: !!VybeNowPlayingActivity });
    return;
  }
  if (!isIslandSurfaceAllowed()) {
    if (__DEV__) console.log('[NowPlaying] start BLOCKED: allowIslandSurfaces=false', { track: trackName });
    return;
  }
  if (__DEV__) {
    console.log('[NowPlaying] → startNowPlaying', {
      track: trackName,
      artist: artistName,
      artLen: (artworkURL ?? '').length,
      duration,
    });
  }
  try {
    await VybeNowPlayingActivity.startNowPlaying(
      trackName,
      artistName,
      artworkURL ?? '',
      Math.max(0, duration),
    );
    if (__DEV__) console.log('[NowPlaying] startNowPlaying OK');
  } catch (e) {
    if (__DEV__) console.log('[NowPlaying] startNowPlaying THREW', String(e));
  }
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
  if (!isAvailable || !isIslandSurfaceAllowed()) return;
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

/** STEALTH_FADE_V3 auth handshake — alias for sign-out / auth surfaces (ActivityKit + Now Playing). */
export function activityTerminateAll(): void {
  terminateAllPillNative();
}
