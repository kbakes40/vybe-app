import { NativeModules, Platform } from 'react-native';

/**
 * iOS `VybeDownloadActivity` → ActivityKit `VybeActivityAttributes` (canonical)
 * / `VybeDownloadAttributes` (typealias). JS never sends `DownloadState` JSON;
 * Swift builds `DownloadState` after `startActivity`.
 *
 * Swift parity: `VybeDownloadActivityModule.startActivity(_:artistName:artworkURL:)`
 * seeds `VybeActivityAttributes.init(trackTitle:artistName:artworkURL:)` and the
 * initial `DownloadState` with the same title/artist/art strings.
 *
 * @see mobile/ios/vibecode/VybeActivityAttributes.swift
 */

/** Activity Feed lines mirrored into Live Activity `recentPosts` (each ≤ 60 chars for ActivityKit payload limits). */
export const VYBE_LIVE_ACTIVITY_FEED_POSTS: readonly string[] = [
  'DaVinci · Machined Cyan 2.1 — tighter vault handoffs.',
  'Krak Coffee · Winter roast — Vybe Alerts partner taps.',
  'STAK · Stacked plates pop-up — RSVP this weekend.',
] as const;

let _liveActivityFeedRotate = 0;

/** Returns the top 3 feed strings, capped at 60 chars; rotates order each call so expanded island updates “cycle” visually. */
export function takeLiveActivityFeedSnapshot(): string[] {
  const capped = VYBE_LIVE_ACTIVITY_FEED_POSTS.map((s) => (s.length > 60 ? s.slice(0, 60) : s));
  const n = _liveActivityFeedRotate % 3;
  _liveActivityFeedRotate += 1;
  return [...capped.slice(n), ...capped.slice(0, n)];
}

export interface VybeDownloadActivityStartPayload {
  /** `VybeActivityAttributes.trackTitle` */
  trackTitle: string;
  /** `VybeActivityAttributes.artistName` */
  artistName: string;
  /**
   * `VybeActivityAttributes.artworkURL` (Swift property `artworkURL`).
   * Use `''` when absent — React Native passes a real string (never `undefined`) so the
   * native selector always receives an object-safe value.
   */
  artworkUrl: string;
}

type VybeDownloadActivityNativeModule = {
  startActivity: (trackTitle: string, artistName: string, artworkUrl: string) => Promise<void> | void;
  updateProgress: (progress: number, statusText: string, recentPosts: string[]) => void;
  endActivity: (success: boolean) => void;
};

function getVybeDownloadActivity(): VybeDownloadActivityNativeModule | null {
  if (Platform.OS !== 'ios') return null;
  const m = NativeModules.VybeDownloadActivity as VybeDownloadActivityNativeModule | undefined;
  return m ?? null;
}

/** Argument order matches the Obj-C bridge: `trackTitle`, `artistName`, `artworkUrl` → Swift `artworkURL`. */
export async function startVybeDownloadLiveActivity(payload: VybeDownloadActivityStartPayload): Promise<void> {
  const bridge = getVybeDownloadActivity();
  if (!bridge) return;
  const artworkUrl = payload.artworkUrl ?? '';
  await Promise.resolve(bridge.startActivity(payload.trackTitle, payload.artistName, artworkUrl));
}

export function getVybeDownloadActivityModule(): VybeDownloadActivityNativeModule | null {
  return getVybeDownloadActivity();
}
