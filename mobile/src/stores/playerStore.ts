import { create } from 'zustand';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Track, RepeatMode, TrackSource } from '@/types/music';
import * as Haptics from 'expo-haptics';

// Global sound object for VYBE tracks
let soundObject: Audio.Sound | null = null;

// Track the current external source for cleanup
let currentExternalCleanup: (() => void) | null = null;

// Function to register external player cleanup (called by WebView components)
export const registerExternalCleanup = (cleanup: () => void) => {
  currentExternalCleanup = cleanup;
};

// Function to clear external cleanup
export const clearExternalCleanup = () => {
  currentExternalCleanup = null;
};

// Function to stop all audio sources
export const stopAllAudio = async () => {
  // Stop VYBE native audio
  if (soundObject) {
    try {
      await soundObject.stopAsync();
      await soundObject.unloadAsync();
    } catch (e) {
      // Ignore errors during cleanup
    }
    soundObject = null;
  }

  // Call external cleanup if registered
  if (currentExternalCleanup) {
    try {
      currentExternalCleanup();
    } catch (e) {
      // Ignore errors during cleanup
    }
    currentExternalCleanup = null;
  }
};

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  queue: Track[];
  queueIndex: number;
  progress: number;
  duration: number;
  isMinimized: boolean;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  likedTracks: Set<string>;
  isLoading: boolean;
  externalSource: TrackSource | null;
  activeSourceId: string | null; // Track which source is currently active

  // Actions
  playTrack: (track: Track, queue?: Track[]) => void;
  pause: () => void;
  resume: () => void;
  next: () => void;
  previous: () => void;
  seekTo: (position: number) => void;
  setProgress: (progress: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setLoading: (loading: boolean) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  toggleMinimize: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleLike: (trackId: string) => void;
  isLiked: (trackId: string) => boolean;
  stopCurrentPlayback: () => Promise<void>;
}

// Configure audio mode
Audio.setAudioModeAsync({
  playsInSilentModeIOS: true,
  staysActiveInBackground: true,
  shouldDuckAndroid: true,
});

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentTrack: null,
  isPlaying: false,
  queue: [],
  queueIndex: 0,
  progress: 0,
  duration: 0,
  isMinimized: true,
  isShuffled: false,
  repeatMode: 'off',
  likedTracks: new Set(['t1', 't3', 't5', 't7', 't9', 't11', 't13', 't15', 't17', 't19', 't21', 'yt2', 'yt4', 'sc2', 'sc4']),
  isLoading: false,
  externalSource: null,
  activeSourceId: null,

  stopCurrentPlayback: async () => {
    // Stop all audio sources before starting a new one
    await stopAllAudio();
    set({ isPlaying: false });
  },

  playTrack: async (track: Track, queue?: Track[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const newQueue = queue ?? [track];
    const index = newQueue.findIndex(t => t.id === track.id);
    const isExternal = track.source === 'youtube' || track.source === 'youtube_music' || track.source === 'soundcloud';

    // IMPORTANT: Stop any currently playing audio before starting new playback
    await stopAllAudio();

    set({
      currentTrack: track,
      isPlaying: false,
      isLoading: true,
      queue: newQueue,
      queueIndex: index >= 0 ? index : 0,
      progress: 0,
      duration: track.duration || 0,
      externalSource: isExternal ? track.source ?? null : null,
      activeSourceId: track.id,
    });

    // For external tracks (YouTube/SoundCloud), playback is handled by embed components
    if (isExternal) {
      set({ isLoading: false, isPlaying: true });
      return;
    }

    // For VYBE tracks, use expo-av
    try {
      if (track.audioUrl) {
        const { sound } = await Audio.Sound.createAsync(
          { uri: track.audioUrl },
          { shouldPlay: true },
          (status: AVPlaybackStatus) => {
            // Only update if this track is still the active one
            const { activeSourceId } = get();
            if (activeSourceId !== track.id) return;

            if (status.isLoaded) {
              const progressSec = status.positionMillis / 1000;
              const durationSec = (status.durationMillis ?? track.duration * 1000) / 1000;

              set({
                progress: progressSec,
                duration: durationSec,
                isPlaying: status.isPlaying,
              });

              // Auto-play next track when finished
              if (status.didJustFinish) {
                const { repeatMode } = get();
                if (repeatMode === 'one') {
                  sound.replayAsync();
                } else {
                  get().next();
                }
              }
            }
          }
        );

        soundObject = sound;
        set({ isPlaying: true, isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch (error) {
      console.log('Error playing audio:', error);
      set({ isLoading: false });
    }
  },

  pause: async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { externalSource } = get();

    if (!externalSource && soundObject) {
      await soundObject.pauseAsync();
    }
    set({ isPlaying: false });
  },

  resume: async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { externalSource } = get();

    if (!externalSource && soundObject) {
      await soundObject.playAsync();
    }
    set({ isPlaying: true });
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
      set({ queueIndex: nextIndex });
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
      set({ queueIndex: prevIndex });
    }
  },

  seekTo: async (position: number) => {
    const { externalSource } = get();

    if (!externalSource && soundObject) {
      await soundObject.setPositionAsync(position * 1000);
    }
    set({ progress: position });
  },

  setProgress: (progress: number) => {
    set({ progress });
  },

  setIsPlaying: (playing: boolean) => {
    set({ isPlaying: playing });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  addToQueue: (track: Track) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    set(state => ({
      queue: [...state.queue, track],
    }));
  },

  playNext: (track: Track) => {
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

  toggleMinimize: () => {
    set(state => ({ isMinimized: !state.isMinimized }));
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

  toggleLike: (trackId: string) => {
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
}));
