import { NativeModules, Platform } from 'react-native';
import { useSocialActivityStore } from '@/stores/socialActivityStore';

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

/** Fallback lines used only when the live social store has nothing to show (e.g. first app launch, store unhydrated). */
export const VYBE_LIVE_ACTIVITY_FEED_POSTS: readonly string[] = [
  'DaVinci · Machined Cyan 2.1 — tighter vault handoffs.',
  'Krak Coffee · Winter roast — Vybe Alerts partner taps.',
  'STAK · Stacked plates pop-up — RSVP this weekend.',
] as const;

/**
 * Live-reads the top 3 social activePosts from the Zustand store and caps each
 * to 60 chars (ActivityKit payload limit). Falls back to the static brand
 * placeholders only when the store has zero posts. Called once per download
 * progress tick via `downloadsStore`, so the Dynamic Island expanded feed
 * naturally refreshes as new posts land.
 */
export function takeLiveActivityFeedSnapshot(): string[] {
  const posts = useSocialActivityStore.getState().activePosts;
  if (posts.length > 0) {
    const lines = posts.slice(0, 3).map((p) => {
      const who = p.userName ?? 'Vybe';
      const what = p.vybeNote ?? '';
      const line = what ? `${who} · ${what}` : who;
      return line.length > 60 ? line.slice(0, 60) : line;
    });
    return lines.filter((s) => s.length > 0);
  }
  return VYBE_LIVE_ACTIVITY_FEED_POSTS.map((s) => (s.length > 60 ? s.slice(0, 60) : s)).slice(0, 3);
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
