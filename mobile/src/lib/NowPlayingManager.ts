import { NativeModules, NativeEventEmitter, Platform, EmitterSubscription } from 'react-native';

/**
 * Thin JS wrapper around the native VybeNowPlaying module (ios/vibecode/
 * VybeNowPlayingModule.swift). Handles MPNowPlayingInfoCenter, lock-screen
 * remote events, the keep-alive timer so Apple TV / AirPlay displays stay
 * populated when the JS is backgrounded, and the system AirPlay route picker.
 */
const { VybeNowPlaying } = NativeModules;

let emitter: NativeEventEmitter | null = null;
if (Platform.OS === 'ios' && VybeNowPlaying) {
  emitter = new NativeEventEmitter(VybeNowPlaying);
}

export interface NowPlayingInfo {
  trackTitle: string;
  artistName: string;
  artworkUrl: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
}

/** Push the current track into iOS Now Playing Center (lock screen, control
 *  center, Dynamic Island, AirPlay displays). */
export function updateNowPlaying(info: NowPlayingInfo): void {
  if (Platform.OS !== 'ios' || !VybeNowPlaying) return;
  VybeNowPlaying.updateNowPlaying(
    info.trackTitle,
    info.artistName,
    info.artworkUrl,
    info.duration,
    info.currentTime,
    info.isPlaying,
  );
  VybeNowPlaying.startKeepAlive(info.currentTime, info.isPlaying);
}

/** Update just the progress + play/pause state. Cheaper than a full
 *  updateNowPlaying and re-anchors the native keep-alive timer so the
 *  system Now Playing card keeps ticking even if JS is backgrounded. */
export function updateNowPlayingProgress(currentTime: number, isPlaying: boolean): void {
  if (Platform.OS !== 'ios' || !VybeNowPlaying) return;
  VybeNowPlaying.updateProgress(currentTime, isPlaying);
  VybeNowPlaying.startKeepAlive(currentTime, isPlaying);
}

/** Tear down Now Playing + keep-alive. Call on stop/unload. */
export function clearNowPlaying(): void {
  if (Platform.OS !== 'ios' || !VybeNowPlaying) return;
  VybeNowPlaying.stopKeepAlive();
  VybeNowPlaying.clearNowPlaying();
}

/** Re-push the album artwork specifically. Used after AirPlay connect
 *  (Apple TV can't fetch URLs on its own — it needs the image data). */
export function setNowPlayingArtwork(artworkUrl: string): void {
  if (Platform.OS !== 'ios' || !VybeNowPlaying || !artworkUrl) return;
  VybeNowPlaying.setArtwork(artworkUrl);
}

/** Present the system AirPlay / Bluetooth audio route picker. Backed by
 *  AVRoutePickerView — the only public API that actually shows the chooser
 *  sheet. Tap the Airplay icon on the nowPlaying screen to open this. */
export function showRoutePicker(): void {
  if (Platform.OS !== 'ios' || !VybeNowPlaying) return;
  VybeNowPlaying.showRoutePicker();
}

/** Subscribe to remote transport events (play/pause/next/prev/seek) fired
 *  from lock screen, Control Center, AirPlay, CarPlay, and Bluetooth
 *  remotes. Returns an unregister function. */
export function registerRemoteHandlers(handlers: {
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  onSeek?: (positionSec: number) => void;
}): () => void {
  if (!emitter) return () => {};
  const subs: EmitterSubscription[] = [];
  if (handlers.onPlay)     subs.push(emitter.addListener('onRemotePlay',     handlers.onPlay));
  if (handlers.onPause)    subs.push(emitter.addListener('onRemotePause',    handlers.onPause));
  if (handlers.onNext)     subs.push(emitter.addListener('onRemoteNext',     handlers.onNext));
  if (handlers.onPrevious) subs.push(emitter.addListener('onRemotePrevious', handlers.onPrevious));
  if (handlers.onSeek) {
    subs.push(emitter.addListener('onRemoteSeek', (e: { position: number }) => {
      handlers.onSeek!(e.position);
    }));
  }
  return () => subs.forEach(s => s.remove());
}
