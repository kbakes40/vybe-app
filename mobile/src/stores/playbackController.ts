import { create } from 'zustand';
import { Audio, AVPlaybackStatus, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { Track, TrackSource, RepeatMode } from '@/types/music';
import * as Haptics from 'expo-haptics';
import { isEventObject, isValidTrack, isValidId } from '@/lib/eventGuard';
import { useRecentsStore } from '@/stores/recentsStore';

/**
 * Unified Playback Controller
 *
 * Single source of truth for all audio playback in VYBE.
 * Ensures only one audio source plays at a time.
 * All UI subscribes to this controller for playback state.
 */

// Playback states
export type PlaybackState = 'idle' | 'loading' | 'buffering' | 'playing' | 'paused' | 'ended' | 'error';

// Adapter interface - all players must implement this
export interface PlayerAdapter {
  prepare: (track: Track) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  setVolume: (value: number) => void;
  dispose: () => Promise<void>;
  // New: for silent playback detection
  getCurrentTime?: () => Promise<number>;
}

// Adapter state change callback
export type AdapterStateCallback = (state: {
  playbackState: PlaybackState;
  progress?: number;
  duration?: number;
  error?: string;
}) => void;

// Global sound object for VYBE tracks
let vybeSound: Audio.Sound | null = null;

// Global adapter refs (set by WebView components)
let youtubeAdapterRef: PlayerAdapter | null = null;
let soundcloudAdapterRef: PlayerAdapter | null = null;

// Track if audio session is initialized
let audioSessionInitialized = false;

// Register adapter refs
export const registerYouTubeAdapter = (adapter: PlayerAdapter | null) => {
  youtubeAdapterRef = adapter;
};

export const registerSoundCloudAdapter = (adapter: PlayerAdapter | null) => {
  soundcloudAdapterRef = adapter;
};

// Initialize audio session with proper settings
const initializeAudioSession = async (): Promise<void> => {
  if (audioSessionInitialized) return;

  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    });
    audioSessionInitialized = true;
    console.log('[PlaybackController] Audio session initialized');
  } catch (error) {
    console.error('[PlaybackController] Failed to initialize audio session:', error);
  }
};

// Initialize on module load
initializeAudioSession();

interface PlaybackControllerState {
  // Current playback
  currentTrack: Track | null;
  currentSource: TrackSource | null;
  playbackState: PlaybackState;
  progress: number;
  duration: number;
  error: string | null;

  // Queue
  queue: Track[];
  queueIndex: number;

  // Settings
  isShuffled: boolean;
  repeatMode: RepeatMode;
  volume: number;

  // UI state
  likedTracks: Set<string>;

  // Preload state
  preparedTrackId: string | null;

  // Silent playback detection
  lastProgressTime: number;
  silentRetryCount: number;

  // Actions
  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  next: () => void;
  previous: () => void;

  // Queue management
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;

  // Settings
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  setVolume: (value: number) => void;
  toggleLike: (trackId: string) => void;
  isLiked: (trackId: string) => boolean;

  // State updates (called by adapters)
  setPlaybackState: (state: PlaybackState) => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  setError: (error: string | null) => void;

  // Preload
  prepareTrack: (track: Track) => Promise<void>;

  // Silent playback detection
  checkSilentPlayback: () => void;
  resetSilentRetryCount: () => void;
}

// Stop VYBE native audio only
const stopVybeAudio = async (): Promise<void> => {
  if (vybeSound) {
    try {
      await vybeSound.stopAsync();
      await vybeSound.unloadAsync();
    } catch (e) {
      // Ignore cleanup errors
    }
    vybeSound = null;
  }
};

// Stop all audio sources - the ONE PLAYER RULE
const stopAllSources = async (): Promise<void> => {
  console.log('[PlaybackController] Stopping all audio sources');

  // Stop VYBE native audio
  await stopVybeAudio();

  // Stop YouTube adapter
  if (youtubeAdapterRef) {
    try {
      await youtubeAdapterRef.stop();
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  // Stop SoundCloud adapter
  if (soundcloudAdapterRef) {
    try {
      await soundcloudAdapterRef.stop();
    } catch (e) {
      // Ignore cleanup errors
    }
  }
};

// Get the appropriate adapter for a track source
const getAdapterForSource = (source: TrackSource | undefined): PlayerAdapter | null => {
  switch (source) {
    case 'youtube':
    case 'youtube_music':
      return youtubeAdapterRef;
    case 'soundcloud':
      return soundcloudAdapterRef;
    default:
      return null; // VYBE uses native audio
  }
};

export const usePlaybackController = create<PlaybackControllerState>((set, get) => ({
  // Initial state
  currentTrack: null,
  currentSource: null,
  playbackState: 'idle',
  progress: 0,
  duration: 0,
  error: null,
  queue: [],
  queueIndex: 0,
  isShuffled: false,
  repeatMode: 'off',
  volume: 1,
  likedTracks: new Set(['t1', 't3', 't5', 't7', 't9', 't11', 't13', 't15', 't17', 't19', 't21', 'yt2', 'yt4', 'sc2', 'sc4']),
  preparedTrackId: null,
  lastProgressTime: 0,
  silentRetryCount: 0,

  playTrack: async (track: Track, queue?: Track[]) => {
    // Guard against event objects being passed as track
    if (isEventObject(track) || !isValidTrack(track)) {
      if (__DEV__) {
        console.warn('[PlaybackController] playTrack received invalid payload:', typeof track);
      }
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const newQueue = queue ?? [track];
    const index = newQueue.findIndex(t => t.id === track.id);
    const source = track.source || 'vybe';

    console.log('[PlaybackController] Playing track:', track.title, 'source:', source);

    // Add to recents
    useRecentsStore.getState().addToRecents(track);

    // SOUNDCLOUD SEARCH HANDOFF: Do NOT attempt in-app playback for SoundCloud tracks
    // SoundCloud tracks use search handoff only - no embedded player
    if (source === 'soundcloud' || track.externalSource === 'SOUNDCLOUD') {
      console.log('[PlaybackController] SoundCloud track - search handoff only, no in-app playback');

      // Stop any current playback
      await stopAllSources();

      // Update state to show track info but NOT attempt playback
      set({
        currentTrack: track,
        currentSource: source,
        playbackState: 'paused', // Show as paused, not loading/playing
        progress: 0,
        duration: track.duration || 0,
        error: null,
        queue: newQueue,
        queueIndex: index >= 0 ? index : 0,
      });

      // Do NOT call any adapter or attempt playback
      return;
    }

    // Ensure audio session is active
    await initializeAudioSession();

    // ONE PLAYER RULE: Stop all sources before starting new playback
    await stopAllSources();

    // Update state immediately for instant UI feedback
    set({
      currentTrack: track,
      currentSource: source,
      playbackState: 'loading',
      progress: 0,
      duration: track.duration || 0,
      error: null,
      queue: newQueue,
      queueIndex: index >= 0 ? index : 0,
      lastProgressTime: Date.now(),
      silentRetryCount: 0,
    });

    // Get adapter for this source
    const adapter = getAdapterForSource(source);

    if (adapter) {
      // External source (YouTube) - adapter handles playback
      try {
        await adapter.prepare(track);
        await adapter.play();
      } catch (e) {
        console.log('[PlaybackController] Adapter error:', e);
        set({ playbackState: 'error', error: 'Failed to start playback' });
      }
    } else {
      // VYBE native audio
      try {
        if (track.audioUrl) {
          console.log('[PlaybackController] Loading VYBE audio:', track.audioUrl);

          // Validate the audio URL before loading
          const isValidUrl = track.audioUrl.startsWith('http://') ||
                            track.audioUrl.startsWith('https://') ||
                            track.audioUrl.startsWith('file://');
          if (!isValidUrl) {
            console.error('[PlaybackController] Invalid audio URL:', track.audioUrl);
            set({ playbackState: 'error', error: 'Invalid audio URL' });
            return;
          }

          const { sound, status } = await Audio.Sound.createAsync(
            { uri: track.audioUrl },
            { shouldPlay: true, volume: get().volume },
            (status: AVPlaybackStatus) => {
              // Only update if this track is still active
              const { currentTrack } = get();
              if (currentTrack?.id !== track.id) return;

              if (status.isLoaded) {
                const progressSec = status.positionMillis / 1000;
                const durationSec = (status.durationMillis ?? track.duration * 1000) / 1000;

                set({
                  progress: progressSec,
                  duration: durationSec,
                  playbackState: status.isPlaying ? 'playing' : 'paused',
                });

                // Auto-play next track when finished
                if (status.didJustFinish) {
                  const { repeatMode } = get();
                  if (repeatMode === 'one') {
                    sound.replayAsync();
                  } else {
                    set({ playbackState: 'ended' });
                    get().next();
                  }
                }
              } else if ('error' in status && status.error) {
                console.error('[PlaybackController] Playback status error:', status.error);
                set({ playbackState: 'error', error: 'Playback failed' });
              }
            }
          );

          // Verify sound loaded successfully before setting as playing
          if (status.isLoaded) {
            vybeSound = sound;
            console.log('[PlaybackController] Audio loaded successfully, duration:', status.durationMillis);
            set({ playbackState: 'playing' });
          } else {
            console.error('[PlaybackController] Audio failed to load:', status);
            set({ playbackState: 'error', error: 'Failed to load audio' });
          }
        } else {
          console.error('[PlaybackController] No audioUrl for track:', track.id);
          set({ playbackState: 'error', error: 'No audio URL' });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[PlaybackController] VYBE audio error:', errorMessage, error);
        set({ playbackState: 'error', error: `Failed to load audio: ${errorMessage}` });
      }
    }
  },

  play: async () => {
    const { currentTrack, currentSource } = get();
    if (!currentTrack) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Ensure audio session is active before playing
    await initializeAudioSession();

    const adapter = getAdapterForSource(currentSource ?? undefined);

    if (adapter) {
      await adapter.play();
    } else if (vybeSound) {
      await vybeSound.playAsync();
      set({ playbackState: 'playing' });
    }
  },

  pause: async () => {
    const { currentSource } = get();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const adapter = getAdapterForSource(currentSource ?? undefined);

    if (adapter) {
      await adapter.pause();
    } else if (vybeSound) {
      await vybeSound.pauseAsync();
      set({ playbackState: 'paused' });
    }
  },

  stop: async () => {
    await stopAllSources();
    set({
      playbackState: 'idle',
      progress: 0,
    });
  },

  seekTo: async (seconds: number) => {
    const { currentSource } = get();

    const adapter = getAdapterForSource(currentSource ?? undefined);

    if (adapter) {
      await adapter.seek(seconds);
    } else if (vybeSound) {
      await vybeSound.setPositionAsync(seconds * 1000);
    }

    set({ progress: seconds });
  },

  next: () => {
    const { queue, queueIndex, repeatMode, isShuffled } = get();
    if (queue.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let nextIndex: number;
    if (isShuffled) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (queueIndex < queue.length - 1) {
      nextIndex = queueIndex + 1;
    } else if (repeatMode === 'all') {
      nextIndex = 0;
    } else {
      return;
    }

    const nextTrack = queue[nextIndex];
    if (nextTrack) {
      get().playTrack(nextTrack, queue);
    }
  },

  previous: () => {
    const { queue, queueIndex, progress } = get();
    if (queue.length === 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // If more than 3 seconds in, restart current track
    if (progress > 3) {
      get().seekTo(0);
      return;
    }

    const prevIndex = queueIndex > 0 ? queueIndex - 1 : queue.length - 1;
    const prevTrack = queue[prevIndex];
    if (prevTrack) {
      get().playTrack(prevTrack, queue);
    }
  },

  addToQueue: (track: Track) => {
    // Guard against event objects
    if (isEventObject(track) || !isValidTrack(track)) {
      if (__DEV__) {
        console.warn('[PlaybackController] addToQueue received invalid payload');
      }
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    set(state => ({
      queue: [...state.queue, track],
    }));
  },

  playNext: (track: Track) => {
    // Guard against event objects
    if (isEventObject(track) || !isValidTrack(track)) {
      if (__DEV__) {
        console.warn('[PlaybackController] playNext received invalid payload');
      }
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    set(state => {
      const newQueue = [...state.queue];
      newQueue.splice(state.queueIndex + 1, 0, track);
      return { queue: newQueue };
    });
  },

  removeFromQueue: (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    set(state => {
      const newQueue = [...state.queue];
      newQueue.splice(index, 1);

      let newQueueIndex = state.queueIndex;
      if (index < state.queueIndex) {
        newQueueIndex = state.queueIndex - 1;
      } else if (index === state.queueIndex && index >= newQueue.length) {
        newQueueIndex = Math.max(0, newQueue.length - 1);
      }

      return { queue: newQueue, queueIndex: newQueueIndex };
    });
  },

  reorderQueue: (fromIndex: number, toIndex: number) => {
    set(state => {
      const newQueue = [...state.queue];
      const [removed] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, removed);

      let newQueueIndex = state.queueIndex;
      if (fromIndex === state.queueIndex) {
        newQueueIndex = toIndex;
      } else if (fromIndex < state.queueIndex && toIndex >= state.queueIndex) {
        newQueueIndex = state.queueIndex - 1;
      } else if (fromIndex > state.queueIndex && toIndex <= state.queueIndex) {
        newQueueIndex = state.queueIndex + 1;
      }

      return { queue: newQueue, queueIndex: newQueueIndex };
    });
  },

  clearQueue: () => {
    set({ queue: [], queueIndex: 0 });
  },

  toggleShuffle: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    set(state => ({ isShuffled: !state.isShuffled }));
  },

  toggleRepeat: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    set(state => {
      const modes: RepeatMode[] = ['off', 'all', 'one'];
      const currentIndex = modes.indexOf(state.repeatMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      return { repeatMode: modes[nextIndex] };
    });
  },

  setVolume: (value: number) => {
    set({ volume: value });
    if (vybeSound) {
      vybeSound.setVolumeAsync(value);
    }
  },

  toggleLike: (trackId: string) => {
    // Guard against event objects being passed as trackId
    if (!isValidId(trackId)) {
      if (__DEV__) {
        console.warn('[PlaybackController] toggleLike received invalid trackId:', typeof trackId);
      }
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    set(state => {
      const newLikedTracks = new Set(state.likedTracks);
      if (newLikedTracks.has(trackId)) {
        newLikedTracks.delete(trackId);
      } else {
        newLikedTracks.add(trackId);
      }
      return { likedTracks: newLikedTracks };
    });
  },

  isLiked: (trackId: string) => {
    return get().likedTracks.has(trackId);
  },

  // State updates from adapters
  setPlaybackState: (state: PlaybackState) => {
    const currentState = get().playbackState;
    // Only update and log if state actually changed
    if (currentState !== state) {
      console.log('[PlaybackController] State change:', state);
      set({ playbackState: state });
    }
  },

  setProgress: (progress: number) => {
    const prevProgress = get().progress;
    // Track when progress actually changes for silent playback detection
    if (progress !== prevProgress && progress > 0) {
      set({ progress, lastProgressTime: Date.now() });
    } else {
      set({ progress });
    }
  },

  setDuration: (duration: number) => {
    set({ duration });
  },

  setError: (error: string | null) => {
    const currentError = get().error;
    // Only update if error changed
    if (currentError !== error) {
      set({ error, playbackState: error ? 'error' : get().playbackState });
    }
  },

  // Preload track without playing
  prepareTrack: async (track: Track) => {
    const source = track.source || 'vybe';
    const adapter = getAdapterForSource(source);

    if (adapter) {
      try {
        await adapter.prepare(track);
        set({ preparedTrackId: track.id });
      } catch (e) {
        console.log('[PlaybackController] Prepare error:', e);
      }
    }
  },

  // Silent playback detection
  checkSilentPlayback: () => {
    const { playbackState, lastProgressTime, silentRetryCount, currentSource } = get();

    // Only check for SoundCloud
    if (currentSource !== 'soundcloud') return;

    // Only check if we think we're playing
    if (playbackState !== 'playing') return;

    const timeSinceProgress = Date.now() - lastProgressTime;

    // If no progress update in 600ms while "playing", something is wrong
    if (timeSinceProgress > 600) {
      console.log('[PlaybackController] Silent playback detected! No progress for', timeSinceProgress, 'ms');
      console.log('[PlaybackController] Current retry count:', silentRetryCount);

      if (silentRetryCount < 1) {
        // Auto-retry once
        console.log('[PlaybackController] Auto-retrying playback...');
        set({ silentRetryCount: silentRetryCount + 1 });
        // Signal to adapter to retry
        return; // Caller should handle retry
      } else {
        // Max retries reached
        console.log('[PlaybackController] Max silent retries reached, showing error');
        set({
          playbackState: 'error',
          error: 'SoundCloud is being stubborn. Try again or open it in SoundCloud.',
        });
      }
    }
  },

  resetSilentRetryCount: () => {
    set({ silentRetryCount: 0 });
  },
}));

// Export helper for checking if playing
export const isPlaying = () => usePlaybackController.getState().playbackState === 'playing';

// Export helper for getting current track
export const getCurrentTrack = () => usePlaybackController.getState().currentTrack;

// Export helper to stop VYBE audio (for AudioSessionManager)
export const stopVybeNativeAudio = stopVybeAudio;
