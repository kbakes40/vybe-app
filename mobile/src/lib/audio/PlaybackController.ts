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
  updateProgress: (progress: number, statusText: string) => void;
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
