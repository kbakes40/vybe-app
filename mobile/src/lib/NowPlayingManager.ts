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
 * Call this when the track changes.
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
}

/**
 * Update only the playback position (cheap — no artwork re-download).
 * Call this every few seconds while playing.
 */
export function updateNowPlayingProgress(currentTime: number, isPlaying: boolean): void {
  if (!isAvailable) return;
  VybeNowPlaying.updateProgress(currentTime, isPlaying);
}

/**
 * Clear Now Playing (call on stop/unload).
 */
export function clearNowPlaying(): void {
  if (!isAvailable) return;
  VybeNowPlaying.clearNowPlaying();
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
