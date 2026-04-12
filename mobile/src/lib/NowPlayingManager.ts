import { NativeModules, NativeEventEmitter, Platform, EmitterSubscription } from 'react-native';

const { VybeNowPlaying } = NativeModules;

// Only active on iOS where the native module exists
const isAvailable = Platform.OS === 'ios' && !!VybeNowPlaying;

let emitter: NativeEventEmitter | null = null;
const subscriptions: EmitterSubscription[] = [];

if (isAvailable) {
  emitter = new NativeEventEmitter(VybeNowPlaying);
}

export interface NowPlayingInfo {
  trackTitle: string;
  artistName: string;
  artworkUrl?: string;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
}

/**
 * Push full track metadata to the iOS Now Playing Info Center.
 * Call this when the track changes. Also starts the native keep-alive
 * timer so Apple TV / AirPlay displays stay populated even when the JS
 * thread is throttled in the background.
 */
export function updateNowPlaying(info: NowPlayingInfo): void {
  if (!isAvailable) return;
  VybeNowPlaying.updateNowPlaying(
    info.trackTitle,
    info.artistName,
    info.artworkUrl ?? '',
    info.duration,
    info.currentTime,
    info.isPlaying
  );
  // Start the native 1-second keep-alive timer. It runs on the main
  // RunLoop (not the JS timer queue) so it keeps ticking even when the
  // app is backgrounded or AirPlaying. Without this, Apple TV clears
  // the Now Playing card after ~5 seconds of silence from JS.
  VybeNowPlaying.startKeepAlive(info.currentTime, info.isPlaying);
}

/**
 * Update only the playback position (cheap — no artwork re-download).
 * Call this every few seconds while playing. Also re-syncs the native
 * keep-alive timer's baseline so the elapsed-time counter stays accurate.
 */
export function updateNowPlayingProgress(currentTime: number, isPlaying: boolean): void {
  if (!isAvailable) return;
  VybeNowPlaying.updateProgress(currentTime, isPlaying);
  // Re-anchor the native timer so drift doesn't accumulate.
  VybeNowPlaying.startKeepAlive(currentTime, isPlaying);
}

/**
 * Clear Now Playing (call on stop/unload). Also stops the keep-alive
 * timer so Apple TV shows nothing when no track is active.
 */
export function clearNowPlaying(): void {
  if (!isAvailable) return;
  VybeNowPlaying.stopKeepAlive();
  VybeNowPlaying.clearNowPlaying();
}

/**
 * Force-set the artwork from a URL. Useful for re-pushing artwork
 * after AirPlay connects (Apple TV needs the image data in the info
 * dict — it can't fetch URLs on its own).
 */
export function setNowPlayingArtwork(artworkUrl: string): void {
  if (!isAvailable || !artworkUrl) return;
  VybeNowPlaying.setArtwork(artworkUrl);
}

/**
 * Register handlers for lock screen / Control Center hardware buttons.
 * Returns a cleanup function — call it when the player unmounts.
 */
export function registerRemoteHandlers(handlers: {
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (position: number) => void;
}): () => void {
  if (!isAvailable || !emitter) return () => {};

  // Clear any existing subscriptions first
  clearRemoteHandlers();

  subscriptions.push(emitter.addListener('onRemotePlay', handlers.onPlay));
  subscriptions.push(emitter.addListener('onRemotePause', handlers.onPause));
  subscriptions.push(emitter.addListener('onRemoteNext', handlers.onNext));
  subscriptions.push(emitter.addListener('onRemotePrevious', handlers.onPrevious));
  subscriptions.push(
    emitter.addListener('onRemoteSeek', (e: { position: number }) => {
      handlers.onSeek(e.position);
    })
  );

  return clearRemoteHandlers;
}

function clearRemoteHandlers(): void {
  subscriptions.forEach(s => s.remove());
  subscriptions.length = 0;
}
