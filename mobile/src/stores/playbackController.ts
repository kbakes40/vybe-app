import { create } from 'zustand';
import { AppState, AppStateStatus } from 'react-native';
import { Audio, AVPlaybackStatus, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { Track, TrackSource, RepeatMode } from '@/types/music';
import * as Haptics from 'expo-haptics';
import { isEventObject, isValidTrack, isValidId } from '@/lib/eventGuard';
import { useRecentsStore } from '@/stores/recentsStore';
import { updateNowPlaying, updateNowPlayingProgress, clearNowPlaying, registerRemoteHandlers, setNowPlayingArtwork } from '@/lib/NowPlayingManager';
import { startNowPlayingActivity, updateNowPlayingActivity, endNowPlayingActivity, formatTime } from '@/lib/NowPlayingActivityManager';
import { usePlaybackSettingsStore } from '@/stores/playbackSettingsStore';
import { useDownloadsStore, downloadSoundCloudTrack, enqueueDownload } from '@/stores/downloadsStore';
// Lazy-cached refs to avoid circular dependency + dynamic require overhead
let _subStore: any = null;
let _adStore: any = null;
function getSubStore() { return _subStore ?? (_subStore = require('./subscriptionStore').useSubscriptionStore); }
function getAdStore() { return _adStore ?? (_adStore = require('../lib/ads/use-ad-break').useAdBreakStore); }

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

// ONE PLAYER RULE: monotonically increasing ID for each playTrack call.
// Each call captures its own ID; before starting audio it checks if it's
// still the latest request. If not, it bails out immediately.
let playRequestCounter = 0;

// ── Crossfade state ───────────────────────────────────────────────────────────
let crossfadeSound: Audio.Sound | null = null;   // next track being faded in
let oldFadingSound: Audio.Sound | null = null;   // current track being faded out
let crossfadeFadeInterval: ReturnType<typeof setInterval> | null = null;
let crossfadeTriggeredForTrackId: string | null = null;

function clearCrossfadeState() {
  if (crossfadeFadeInterval) { clearInterval(crossfadeFadeInterval); crossfadeFadeInterval = null; }
  // Only unload crossfadeSound if it hasn't already become vybeSound
  if (crossfadeSound && crossfadeSound !== vybeSound) {
    crossfadeSound.stopAsync().catch(() => {});
    crossfadeSound.unloadAsync().catch(() => {});
  }
  crossfadeSound = null;
  if (oldFadingSound) {
    oldFadingSound.stopAsync().catch(() => {});
    oldFadingSound.unloadAsync().catch(() => {});
    oldFadingSound = null;
  }
  crossfadeTriggeredForTrackId = null;
}

async function triggerCrossfade(fadeSecs: number) {
  const state = usePlaybackController.getState();
  const { queue, queueIndex, repeatMode, isShuffled } = state;

  // Find next track index
  let nextIndex: number;
  if (isShuffled) {
    nextIndex = Math.floor(Math.random() * queue.length);
  } else if (queueIndex < queue.length - 1) {
    nextIndex = queueIndex + 1;
  } else if (repeatMode === 'all') {
    nextIndex = 0;
  } else {
    return; // Nothing to crossfade to
  }

  const nextTrack = queue[nextIndex];
  if (!nextTrack) return;

  // Resolve audio URI for next track
  const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
  let nextUri = '';
  const nextSource = nextTrack.source || 'vybe';

  // Always check downloads store first — a downloaded track (any source) plays from local file
  const dlNext = useDownloadsStore.getState().getDownloadedTrack(nextTrack.id);
  if (dlNext?.localFilePath) {
    nextUri = dlNext.localFilePath;
  } else if (nextTrack.audioUrl?.startsWith('file://')) {
    nextUri = nextTrack.audioUrl;
  } else if (nextSource === 'soundcloud') {
    const nextScUrl = (nextTrack as Track & { soundcloudUrl?: string }).soundcloudUrl;
    if (!nextScUrl) { crossfadeTriggeredForTrackId = null; return; }
    nextUri = `${backendBase}/api/soundcloud/audio?url=${encodeURIComponent(nextScUrl)}`;
  } else if (nextSource === 'youtube' || nextSource === 'youtube_music') {
    const ytId = (nextTrack as Track & { youtubeId?: string; youtubeMusicId?: string }).youtubeId
      || (nextTrack as Track & { youtubeId?: string; youtubeMusicId?: string }).youtubeMusicId;
    if (!ytId) return;
    nextUri = `${backendBase}/api/youtube/audio/${ytId}`;
  } else {
    nextUri = nextTrack.audioUrl || '';
  }

  if (!nextUri) return;

  try {
    const newSound = new Audio.Sound();
    crossfadeSound = newSound;
    await newSound.loadAsync({ uri: nextUri }, { shouldPlay: true, volume: 0 });

    // Update store to reflect the new current track (UI updates immediately)
    usePlaybackController.setState({
      currentTrack: nextTrack,
      queueIndex: nextIndex,
      progress: 0,
      duration: nextTrack.duration || 0,
      playbackState: 'playing',
    });

    // Same duration-override setup as playTrack — the m4a containers from
    // YouTube downloads / streams sometimes report ~2× the real audio length.
    // Without this the crossfaded-in track would play silence at the end and
    // never advance properly.
    const nextYtId = (nextTrack as Track & { youtubeId?: string; youtubeMusicId?: string }).youtubeId
      || (nextTrack as Track & { youtubeId?: string; youtubeMusicId?: string }).youtubeMusicId;
    const nextIsYt = (nextSource === 'youtube' || nextSource === 'youtube_music') && !!nextYtId;
    let nextRealDurationSec = nextTrack.duration || 0;
    if (nextIsYt && nextYtId) {
      fetch(`${backendBase}/api/youtube/info/${nextYtId}`)
        .then(r => r.ok ? r.json() : null)
        .then((j: any) => {
          const d = j?.data?.duration ?? 0;
          if (d > 0 && (nextRealDurationSec === 0 || d < nextRealDurationSec * 0.75)) {
            nextRealDurationSec = d;
            if (usePlaybackController.getState().currentTrack?.id === nextTrack.id) {
              usePlaybackController.setState({ duration: d });
            }
          }
        })
        .catch(() => {});
    }

    // Wire status updates for the incoming track
    newSound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      const { currentTrack } = usePlaybackController.getState();
      if (currentTrack?.id !== nextTrack.id) return;
      if (status.isLoaded) {
        const progressSec = status.positionMillis / 1000;
        const rawDurationSec = (status.durationMillis ?? 0) / 1000;
        const overrideDuration =
          nextIsYt && nextRealDurationSec > 0 && rawDurationSec > nextRealDurationSec * 1.5;
        const durationSec = overrideDuration ? nextRealDurationSec : rawDurationSec;
        usePlaybackController.setState({
          progress: progressSec,
          duration: durationSec,
          playbackState: status.isPlaying ? 'playing' : 'paused',
        });
        // Force-advance when the real audio has run out but AVPlayer is still
        // playing silence inside the inflated container.
        if (overrideDuration && progressSec >= nextRealDurationSec - 0.5) {
          const { repeatMode: rm } = usePlaybackController.getState();
          if (rm === 'one') { newSound.setPositionAsync(0).catch(() => {}); }
          else {
            usePlaybackController.setState({ playbackState: 'ended' });
            usePlaybackController.getState().next();
          }
          return;
        }
        if (status.didJustFinish) {
          const { repeatMode: rm } = usePlaybackController.getState();
          if (rm === 'one') {
            newSound.replayAsync();
          } else {
            usePlaybackController.setState({ playbackState: 'ended' });
            usePlaybackController.getState().next();
          }
        }
      }
    });

    // Swap sound references: new track is now the "current" vybeSound
    const fadingOut = vybeSound;
    oldFadingSound = fadingOut;
    vybeSound = newSound;

    // Equal-power crossfade: sin/cos curve avoids the volume dip of a linear fade
    // incoming: sin(t * π/2),  outgoing: cos(t * π/2)
    const STEPS_PER_SEC = 25; // 40 ms per step — smooth without hammering the audio thread
    const totalSteps = Math.ceil(fadeSecs * STEPS_PER_SEC);
    const stepMs = (fadeSecs * 1000) / totalSteps;
    let step = 0;

    crossfadeFadeInterval = setInterval(async () => {
      step++;
      const t = Math.min(step / totalSteps, 1);
      const volIn  = Math.sin(t * Math.PI / 2);           // 0 → 1 (ease in)
      const volOut = Math.cos(t * Math.PI / 2);           // 1 → 0 (ease out)
      await newSound.setVolumeAsync(volIn).catch(() => {});
      await fadingOut?.setVolumeAsync(volOut).catch(() => {});
      if (step >= totalSteps) {
        clearInterval(crossfadeFadeInterval!);
        crossfadeFadeInterval = null;
        fadingOut?.stopAsync().catch(() => {});
        fadingOut?.unloadAsync().catch(() => {});
        oldFadingSound = null;
        crossfadeSound = null;
      }
    }, stepMs);

  } catch (e) {
    console.error('[Crossfade] Error starting crossfade:', e);
    crossfadeSound = null;
    crossfadeTriggeredForTrackId = null;
  }
}

// ── Auto-queue ────────────────────────────────────────────────────────────────
/**
 * Builds a related-tracks queue from the downloaded library.
 * Priority: same artist → same source → everything else (all shuffled).
 * If playNext=true, starts playing the first related track after appending.
 */
async function autoFillQueue(seedTrack: Track, currentQueue: Track[], playNext = false) {
  try {
    const downloads = useDownloadsStore.getState().downloads;

    const excludeIds = new Set(currentQueue.map(t => t.id));
    const pool = downloads.filter(d => !excludeIds.has(d.id) && d.id !== seedTrack.id);
    if (pool.length === 0) return;

    const artist = seedTrack.artist?.toLowerCase() ?? '';
    const source = seedTrack.source;
    const shuffle = <T>(arr: T[]) => [...arr].sort(() => Math.random() - 0.5);

    const sameArtist = shuffle(pool.filter(d => d.artist?.toLowerCase() === artist));
    const sameSource = shuffle(pool.filter(d => d.source === source && d.artist?.toLowerCase() !== artist));
    const rest       = shuffle(pool.filter(d => d.source !== source && d.artist?.toLowerCase() !== artist));

    const related = [...sameArtist, ...sameSource, ...rest].slice(0, 25) as Track[];
    if (related.length === 0) return;

    const state = usePlaybackController.getState();
    // Bail if the user already switched to a different track
    if (playNext && state.currentTrack?.id !== seedTrack.id) return;

    const newQueue = [...state.queue, ...related];
    usePlaybackController.setState({ queue: newQueue });

    if (playNext) {
      const nextIndex = state.queue.length; // first newly added track
      state.playTrack(related[0], newQueue);
      usePlaybackController.setState({ queueIndex: nextIndex });
    }
  } catch (e) {
    console.warn('[AutoQueue] Failed to fill queue:', e);
  }
}

// Now Playing Live Activity update interval
let nowPlayingInterval: ReturnType<typeof setInterval> | null = null;

function startNowPlayingInterval() {
  stopNowPlayingInterval();
  nowPlayingInterval = setInterval(() => {
    const { currentTrack, playbackState, progress, duration } = usePlaybackController.getState();
    if (!currentTrack || playbackState === 'idle' || playbackState === 'error') return;
    // Update Dynamic Island Live Activity
    updateNowPlayingActivity(
      playbackState === 'playing',
      duration > 0 ? progress / duration : 0,
      progress,
      duration,
      currentTrack.title,
      currentTrack.artist,
    );
    // Update lock screen / Apple TV Now Playing info center + re-anchor
    // the native keep-alive timer so it doesn't drift. This is the main
    // heartbeat that keeps Apple TV's Now Playing card alive.
    updateNowPlayingProgress(progress, playbackState === 'playing');
  }, 1000);
}

function stopNowPlayingInterval() {
  if (nowPlayingInterval !== null) {
    clearInterval(nowPlayingInterval);
    nowPlayingInterval = null;
  }
}

// Register adapter refs
export const registerYouTubeAdapter = (adapter: PlayerAdapter | null) => {
  youtubeAdapterRef = adapter;
};

export const registerSoundCloudAdapter = (adapter: PlayerAdapter | null) => {
  soundcloudAdapterRef = adapter;
};

/** YouTube pool registers after IFrame API warms; Home taps can race this. */
const waitForYouTubeAdapter = async (maxMs: number): Promise<PlayerAdapter | null> => {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    if (youtubeAdapterRef) return youtubeAdapterRef;
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }
  return youtubeAdapterRef;
};

/** SoundCloud pool registers on mount; taps can race the widget warm-up. */
const waitForSoundCloudAdapter = async (maxMs: number): Promise<PlayerAdapter | null> => {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    if (soundcloudAdapterRef) return soundcloudAdapterRef;
    await new Promise<void>(resolve => setTimeout(resolve, 100));
  }
  return soundcloudAdapterRef;
};

// Initialize audio session with proper settings
const initializeAudioSession = async (): Promise<void> => {
  if (audioSessionInitialized) return;

  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      allowsRecordingIOS: false,
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

// Register lock screen / Control Center remote handlers once at startup
registerRemoteHandlers({
  onPlay:     () => usePlaybackController.getState().play(),
  onPause:    () => usePlaybackController.getState().pause(),
  onNext:     () => usePlaybackController.getState().next(),
  onPrevious: () => usePlaybackController.getState().previous(),
  onSeek:     (pos) => usePlaybackController.getState().seekTo(pos),
});

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

  // Ad-break pending track (track queued while ad was playing)
  pendingTrackAfterAd: Track | null;
  pendingQueueAfterAd: Track[] | null;

  // Silent playback detection
  lastProgressTime: number;
  silentRetryCount: number;

  // AirPlay route state — set by the native onAirPlayConnected/Disconnected
  // events. Used by the top-right AirPlay pill on the root layout.
  isAirPlayConnected: boolean;

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
  clearCrossfadeState();
  if (vybeSound) {
    try {
      await vybeSound.stopAsync();
      await vybeSound.unloadAsync();
    } catch (e) {
      // Ignore cleanup errors
    }
    vybeSound = null;
    // Reset flag so the next track re-activates the iOS audio session
    audioSessionInitialized = false;
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
  likedTracks: new Set<string>(),
  preparedTrackId: null,
  pendingTrackAfterAd: null,
  pendingQueueAfterAd: null,
  lastProgressTime: 0,
  silentRetryCount: 0,
  isAirPlayConnected: false,

  playTrack: async (track: Track, queue?: Track[]) => {
    // Guard against event objects being passed as track
    if (isEventObject(track) || !isValidTrack(track)) {
      if (__DEV__) {
        console.warn('[PlaybackController] playTrack received invalid payload:', typeof track);
      }
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // If an ad is currently playing, block all new playback
    try {
      const adState = getAdStore().getState();
      if (adState.isAdBreak && !adState.resumingFromAd) return;

      // Free tier: check if ad break should fire
      if (!adState.resumingFromAd) {
        const subState = getSubStore().getState();
        if (subState.tier === 'free') {
          const shouldShowAd = subState.recordTrackPlay();
          if (shouldShowAd) {
            // Store track as pending — play it after the ad finishes
            set({ pendingTrackAfterAd: track, pendingQueueAfterAd: queue ?? [track] });
            adState.startAdBreak();
            return;
          }
        }
      }
    } catch {}

    // Claim this play slot — any in-flight playTrack call with an older ID will abort
    const myRequestId = ++playRequestCounter;
    const isStillCurrent = () => myRequestId === playRequestCounter;

    const newQueue = queue ?? [track];
    const index = newQueue.findIndex(t => t.id === track.id);
    const source = track.source || 'vybe';

    console.log('[PlaybackController] Playing track:', track.title, 'source:', source);

    // Add to recents
    useRecentsStore.getState().addToRecents(track);

    // ONE PLAYER RULE: Stop all sources before starting new playback
    // (this may deactivate the iOS audio session)
    await stopAllSources();

    // Another playTrack was called while we were stopping — bail out
    if (!isStillCurrent()) return;

    // Re-activate audio session after stopping (unloadAsync deactivates it on iOS)
    await initializeAudioSession();

    // Bail again after async session init
    if (!isStillCurrent()) { await stopVybeAudio(); return; }

    // Update state immediately for instant UI feedback
    const trackIndex = index >= 0 ? index : 0;
    set({
      currentTrack: track,
      currentSource: source,
      playbackState: 'loading',
      progress: 0,
      duration: track.duration || 0,
      error: null,
      queue: newQueue,
      queueIndex: trackIndex,
      lastProgressTime: Date.now(),
      silentRetryCount: 0,
    });

    // Auto-fill queue with related downloaded tracks if no upcoming songs
    const upcomingCount = newQueue.length - trackIndex - 1;
    if (upcomingCount === 0) {
      autoFillQueue(track, newQueue);
    }

    // Update Now Playing Info Center (lock screen metadata + remote controls)
    updateNowPlaying({
      trackTitle: track.title,
      artistName: track.artist,
      artworkUrl: track.artwork ?? '',
      duration: track.duration || 0,
      currentTime: 0,
      isPlaying: true,
    });

    // Start / update Now Playing Live Activity (Dynamic Island)
    startNowPlayingActivity(track.title, track.artist, track.artwork ?? '', track.duration || 0);
    startNowPlayingInterval();

    // If the track has been downloaded locally, always play from the local file
    // regardless of its original source (handles downloaded SoundCloud/YouTube tracks)
    if (track.audioUrl?.startsWith('file://')) {
      const ytVideoIdForDownload = track.youtubeId || track.youtubeMusicId;
      const isYt = (source === 'youtube' || source === 'youtube_music') && !!ytVideoIdForDownload;
      // Mutable so the background /info fetch below can correct an inflated
      // value without re-creating the sound. The status callback reads this
      // by closure so updates take effect on the next status tick.
      let realDurationSec = track.duration || 0;
      if (isYt && realDurationSec > 0) set({ duration: realDurationSec });

      // YouTube/YT Music downloads sometimes store an inflated duration that
      // matches the m4a container's bogus mvhd value. Fetch the truth from
      // /info in the background — non-blocking so play is still instant.
      // If we get a real duration that's clearly smaller (<0.75× stored),
      // overwrite realDurationSec so the override logic in the status
      // callback can trigger end-of-track at the correct point.
      if (isYt && ytVideoIdForDownload) {
        const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
        fetch(`${backendBase}/api/youtube/info/${ytVideoIdForDownload}`)
          .then(r => r.ok ? r.json() : null)
          .then((j: any) => {
            const d = j?.data?.duration ?? 0;
            if (d > 0 && (realDurationSec === 0 || d < realDurationSec * 0.75)) {
              realDurationSec = d;
              if (get().currentTrack?.id === track.id) set({ duration: d });
            }
          })
          .catch(() => {});
      }

      try {
        const { sound, status } = await Audio.Sound.createAsync(
          { uri: track.audioUrl },
          { shouldPlay: true, volume: get().volume },
          (status: AVPlaybackStatus) => {
            const { currentTrack } = get();
            if (currentTrack?.id !== track.id) return;
            if (status.isLoaded) {
              const progressSec = status.positionMillis / 1000;
              const rawDurationSec = (status.durationMillis ?? track.duration * 1000) / 1000;

              // Only override when we're confident the container lied
              // (> 1.5x real). Protects SoundCloud and non-YT downloads.
              const overrideDuration =
                isYt && realDurationSec > 0 && rawDurationSec > realDurationSec * 1.5;
              const durationSec = overrideDuration ? realDurationSec : rawDurationSec;

              set({ progress: progressSec, duration: durationSec, playbackState: status.isPlaying ? 'playing' : 'paused' });
              const { crossfadeEnabled, crossfadeDuration } = usePlaybackSettingsStore.getState();
              if (crossfadeEnabled && crossfadeTriggeredForTrackId !== track.id && durationSec > 0 && progressSec > 0 && durationSec - progressSec <= crossfadeDuration) {
                crossfadeTriggeredForTrackId = track.id;
                triggerCrossfade(crossfadeDuration);
              }

              // Force-advance when overridden duration runs out. Otherwise
              // AVPlayer would play silence until its (wrong) didJustFinish.
              if (
                overrideDuration &&
                progressSec >= realDurationSec - 0.5 &&
                crossfadeTriggeredForTrackId !== track.id
              ) {
                const { repeatMode } = get();
                if (repeatMode === 'one') {
                  sound.setPositionAsync(0).catch(() => {});
                } else {
                  set({ playbackState: 'ended' });
                  get().next();
                }
                return;
              }

              if (status.didJustFinish) {
                const { repeatMode } = get();
                if (repeatMode === 'one') { sound.replayAsync(); }
                else if (crossfadeTriggeredForTrackId !== track.id) { set({ playbackState: 'ended' }); get().next(); }
              }
            } else if ('error' in status && status.error) {
              set({ playbackState: 'error', error: 'Playback failed' });
            }
          }
        );
        if (!isStillCurrent()) { sound.stopAsync().catch(() => {}); sound.unloadAsync().catch(() => {}); return; }
        if (status.isLoaded) { vybeSound = sound; set({ playbackState: 'playing' }); }
        else { set({ playbackState: 'error', error: 'Failed to load audio' }); }
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        set({ playbackState: 'error', error: `Failed to load audio: ${msg}` });
      }
      return;
    }

    // YouTube tracks: stream via backend yt-dlp proxy (IFrame API blocks most embeds)
    const ytVideoId = track.youtubeId || track.youtubeMusicId;
    if ((source === 'youtube' || source === 'youtube_music') && ytVideoId) {
      const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
      const audioUrl = `${backendBase}/api/youtube/audio/${ytVideoId}`;
      console.log('[PlaybackController] YouTube via backend proxy:', audioUrl);

      // Fetch the real video duration from /info. Some YouTube DASH audio
      // formats ship an m4a container whose mvhd duration is ~2x the actual
      // audio length — AVPlayer believes that duration and plays silence
      // for the second half until it finally hits `didJustFinish`. Having
      // the real duration lets us (1) display the correct time bar and
      // (2) advance to the next track as soon as audio actually ends.
      let realDurationSec = track.duration || 0;
      if (realDurationSec <= 0) {
        try {
          const infoResp = await fetch(`${backendBase}/api/youtube/info/${ytVideoId}`);
          if (infoResp.ok) {
            const infoJson = (await infoResp.json()) as { data?: { duration?: number } };
            const d = infoJson.data?.duration ?? 0;
            if (d > 0) realDurationSec = d;
          }
        } catch {
          // non-fatal — we'll fall back to whatever AVPlayer reports
        }
      }

      // Bail if the user switched tracks while we were fetching /info.
      if (!isStillCurrent()) { await stopVybeAudio(); return; }

      // Publish the real duration up-front so the time bar is correct
      // before the first audio status update arrives.
      if (realDurationSec > 0) {
        set({ duration: realDurationSec });
      }

      try {
        const sound = new Audio.Sound();
        // Set vybeSound immediately so play/pause controls work during buffering
        vybeSound = sound;

        sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
          const { currentTrack } = get();
          if (currentTrack?.id !== track.id) return;
          if (status.isLoaded) {
            const progressSec = status.positionMillis / 1000;
            const rawDurationSec = (status.durationMillis ?? 0) / 1000;

            // Trust /info over AVPlayer when AVPlayer's duration is clearly
            // wrong (more than 1.5× the YouTube-reported length). This keeps
            // the UI honest AND gives us a real end-of-track signal without
            // waiting for AVPlayer's padded silence to run out.
            const overrideDuration =
              realDurationSec > 0 && rawDurationSec > realDurationSec * 1.5;
            const durationSec = overrideDuration ? realDurationSec : rawDurationSec;

            set({
              progress: progressSec,
              duration: durationSec,
              playbackState: status.isPlaying ? 'playing' : 'paused',
            });

            // Crossfade trigger — uses the trusted duration so it fires at
            // the real tail of the song, not the silence at the end.
            const { crossfadeEnabled, crossfadeDuration } = usePlaybackSettingsStore.getState();
            if (
              crossfadeEnabled &&
              crossfadeTriggeredForTrackId !== track.id &&
              durationSec > 0 &&
              progressSec > 0 &&
              durationSec - progressSec <= crossfadeDuration
            ) {
              crossfadeTriggeredForTrackId = track.id;
              triggerCrossfade(crossfadeDuration);
            }

            // Force-advance when we're using an overridden duration and the
            // real audio has ended. Without this the track would sit in
            // silence until AVPlayer hits its own (wrong) didJustFinish.
            if (
              overrideDuration &&
              progressSec >= realDurationSec - 0.5 &&
              crossfadeTriggeredForTrackId !== track.id
            ) {
              const { repeatMode } = get();
              if (repeatMode === 'one') {
                sound.setPositionAsync(0).catch(() => {});
              } else {
                set({ playbackState: 'ended' });
                get().next();
              }
              return;
            }

            if (status.didJustFinish) {
              const { repeatMode } = get();
              if (repeatMode === 'one') {
                sound.replayAsync();
              } else if (crossfadeTriggeredForTrackId !== track.id) {
                // Only call next() if crossfade didn't already handle it
                set({ playbackState: 'ended' });
                get().next();
              }
            }
          } else if ('error' in status && status.error) {
            console.error('[PlaybackController] Playback error:', status.error);
            set({ playbackState: 'error', error: 'Playback failed' });
          }
        });

        await sound.loadAsync({ uri: audioUrl }, { shouldPlay: false, volume: get().volume });
        if (!isStillCurrent()) {
          sound.stopAsync().catch(() => {});
          sound.unloadAsync().catch(() => {});
          // Only clear the global ref if it still points to us — otherwise a
          // newer playTrack already took over and we'd orphan its sound.
          if (vybeSound === sound) vybeSound = null;
          return;
        }
        await sound.playAsync();
        set({ playbackState: 'playing' });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[PlaybackController] YouTube proxy error:', msg);
        set({ playbackState: 'error', error: `Failed to play: ${msg}` });
      }
      return;
    }

    // SoundCloud tracks: stream low-quality first for fast start,
    // then background-download the HQ version and seamlessly switch.
    const scUrl = (track as Track & { soundcloudUrl?: string }).soundcloudUrl;
    if (source === 'soundcloud' && scUrl) {
      const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
      // Low-quality stream loads ~3x faster than best audio
      const lqUrl = `${backendBase}/api/soundcloud/audio?url=${encodeURIComponent(scUrl)}&quality=low`;
      console.log('[PlaybackController] SoundCloud LQ stream start:', lqUrl);

      const makeSCStatusCallback = (snd: Audio.Sound) => (status: AVPlaybackStatus) => {
        const { currentTrack } = get();
        if (currentTrack?.id !== track.id) return;
        if (status.isLoaded) {
          const progressSec = status.positionMillis / 1000;
          const durationSec = (status.durationMillis ?? 0) / 1000;
          set({ progress: progressSec, duration: durationSec, playbackState: status.isPlaying ? 'playing' : 'paused' });
          const { crossfadeEnabled, crossfadeDuration } = usePlaybackSettingsStore.getState();
          if (crossfadeEnabled && crossfadeTriggeredForTrackId !== track.id && durationSec > 0 && progressSec > 0 && durationSec - progressSec <= crossfadeDuration) {
            crossfadeTriggeredForTrackId = track.id;
            triggerCrossfade(crossfadeDuration);
          }
          if (status.didJustFinish) {
            const { repeatMode } = get();
            if (repeatMode === 'one') { snd.replayAsync(); }
            else if (crossfadeTriggeredForTrackId !== track.id) { set({ playbackState: 'ended' }); get().next(); }
          }
        } else if ('error' in status && status.error) {
          console.error('[PlaybackController] SoundCloud error:', status.error);
          set({ playbackState: 'error', error: 'Playback failed' });
        }
      };

      try {
        const sound = new Audio.Sound();
        vybeSound = sound;
        sound.setOnPlaybackStatusUpdate(makeSCStatusCallback(sound));
        await sound.loadAsync({ uri: lqUrl }, { shouldPlay: false, volume: get().volume });
        if (!isStillCurrent()) {
          sound.stopAsync().catch(() => {});
          sound.unloadAsync().catch(() => {});
          if (vybeSound === sound) vybeSound = null;
          return;
        }
        await sound.playAsync();
        set({ playbackState: 'playing' });

        // Background: download HQ version, then seamlessly switch to it
        (async () => {
          try {
            // downloadSoundCloudTrack and enqueueDownload now statically imported
            enqueueDownload(track.id, async () => {
              const result = await downloadSoundCloudTrack(
                track as Track & { soundcloudUrl?: string },
                backendBase,
                undefined,
                true, // silent — no loading UI, just Dynamic Island progress
              );
              if (!result.success) return;

              // Only upgrade if this track is still active
              const state = usePlaybackController.getState();
              if (state.currentTrack?.id !== track.id) return;

              const downloaded = useDownloadsStore.getState().getDownloadedTrack(track.id);
              if (!downloaded?.localFilePath) return;

              const savedProgress = state.progress;
              console.log('[PlaybackController] SoundCloud HQ upgrade at', savedProgress.toFixed(1), 's');

              // Stop LQ stream
              clearCrossfadeState();
              if (vybeSound) {
                try { await vybeSound.stopAsync(); await vybeSound.unloadAsync(); } catch {}
                vybeSound = null;
                audioSessionInitialized = false;
              }
              await initializeAudioSession();

              // Load HQ local file at same position
              const hqSound = new Audio.Sound();
              hqSound.setOnPlaybackStatusUpdate(makeSCStatusCallback(hqSound));
              try {
                await hqSound.loadAsync({ uri: downloaded.localFilePath }, { shouldPlay: false, volume: get().volume });
                await hqSound.setPositionAsync(Math.round(savedProgress * 1000));
                await hqSound.playAsync();
                vybeSound = hqSound;
                set({ playbackState: 'playing' });
                console.log('[PlaybackController] SoundCloud switched to HQ local file');
              } catch (e) {
                console.warn('[PlaybackController] HQ upgrade failed, staying on LQ stream:', e);
                try { await hqSound.unloadAsync(); } catch {}
              }
            });
          } catch (e) {
            console.warn('[PlaybackController] HQ upgrade setup failed:', e);
          }
        })();

      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[PlaybackController] SoundCloud stream error:', msg);
        set({ playbackState: 'error', error: `Failed to play: ${msg}` });
      }
      return;
    }

    // Fallback: adapter-based playback (WebView embed)
    const adapter = getAdapterForSource(source);

    if (adapter) {
      try {
        await adapter.prepare(track);
        await adapter.play();
        set({ playbackState: 'playing' });
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

                // Crossfade trigger
                const { crossfadeEnabled, crossfadeDuration } = usePlaybackSettingsStore.getState();
                if (
                  crossfadeEnabled &&
                  crossfadeTriggeredForTrackId !== track.id &&
                  durationSec > 0 &&
                  progressSec > 0 &&
                  durationSec - progressSec <= crossfadeDuration
                ) {
                  crossfadeTriggeredForTrackId = track.id;
                  triggerCrossfade(crossfadeDuration);
                }

                // Auto-play next track when finished
                if (status.didJustFinish) {
                  const { repeatMode } = get();
                  if (repeatMode === 'one') {
                    sound.replayAsync();
                  } else if (crossfadeTriggeredForTrackId !== track.id) {
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
          if (!isStillCurrent()) { sound.stopAsync().catch(() => {}); sound.unloadAsync().catch(() => {}); return; }
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

    // Prefer native sound (vybe or youtube-via-proxy) over WebView adapters
    if (vybeSound) {
      await vybeSound.playAsync();
      set({ playbackState: 'playing' });
      updateNowPlayingProgress(get().progress, true);
      return;
    }

    const adapter = getAdapterForSource(currentSource ?? undefined);
    if (adapter) {
      await adapter.play();
      set({ playbackState: 'playing' });
      updateNowPlayingProgress(get().progress, true);
    }
  },

  pause: async () => {
    const { currentSource } = get();

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Prefer native sound (vybe or youtube-via-proxy) over WebView adapters
    if (vybeSound) {
      await vybeSound.pauseAsync();
      set({ playbackState: 'paused' });
      updateNowPlayingProgress(get().progress, false);
      return;
    }

    const adapter = getAdapterForSource(currentSource ?? undefined);
    if (adapter) {
      await adapter.pause();
      set({ playbackState: 'paused' });
      updateNowPlayingProgress(get().progress, false);
    }
  },

  stop: async () => {
    await stopAllSources();
    clearNowPlaying();
    stopNowPlayingInterval();
    endNowPlayingActivity();
    set({
      playbackState: 'idle',
      progress: 0,
    });
  },

  seekTo: async (seconds: number) => {
    const { currentSource } = get();

    if (vybeSound) {
      await vybeSound.setPositionAsync(seconds * 1000);
    } else {
      const adapter = getAdapterForSource(currentSource ?? undefined);
      if (adapter) {
        await adapter.seek(seconds);
      }
    }

    set({ progress: seconds });
  },

  next: () => {
    const { queue, queueIndex, repeatMode, isShuffled } = get();
    if (queue.length === 0) return;

    // Free tier: enforce skip limit (6/day) — VIP/plus users pass instantly
    try {
      const sub = getSubStore().getState();
      if (sub.tier === 'free' && !sub.useSkip()) return;
    } catch {}

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let nextIndex: number;
    if (isShuffled) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (queueIndex < queue.length - 1) {
      nextIndex = queueIndex + 1;
    } else if (repeatMode === 'all') {
      nextIndex = 0;
    } else {
      // Queue exhausted — auto-fill with related tracks and keep playing
      const seedTrack = queue[queueIndex];
      if (seedTrack) autoFillQueue(seedTrack, queue, true);
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
      // Update Now Playing elapsed time every ~2 seconds to avoid excessive native calls
      if (Math.abs(progress - prevProgress) >= 2) {
        updateNowPlayingProgress(progress, get().playbackState === 'playing');
      }
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

// ── AppState handler: keep audio alive across background/foreground transitions ─
AppState.addEventListener('change', async (nextState: AppStateStatus) => {
  if (nextState === 'background') {
    // Re-apply audio mode so iOS keeps the session active while suspended.
    // This is the critical call that prevents iOS from killing the audio session.
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        allowsRecordingIOS: false,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });
    } catch {}
  } else if (nextState === 'active') {
    // App came back to foreground — reset flag so session re-inits cleanly.
    audioSessionInitialized = false;
    await initializeAudioSession();

    // Restart the Live Activity interval (it stops when JS is suspended).
    const { currentTrack, playbackState } = usePlaybackController.getState();
    if (currentTrack && playbackState !== 'idle' && playbackState !== 'error') {
      startNowPlayingInterval();

      // Re-push Now Playing info to lock screen (iOS clears it while suspended).
      updateNowPlaying({
        trackTitle: currentTrack.title,
        artistName: currentTrack.artist,
        artworkUrl: currentTrack.artwork ?? '',
        duration: usePlaybackController.getState().duration || 0,
        currentTime: usePlaybackController.getState().progress,
        isPlaying: playbackState === 'playing',
      });
    }
  }
});

// Export helper to stop VYBE audio (for AudioSessionManager)
export const stopVybeNativeAudio = stopVybeAudio;

// ── AirPlay artwork re-push ──────────────────────────────────────────────────
// When AirPlay connects, Apple TV needs the album artwork pushed again
// because it can't fetch URLs on its own — it needs the image data.
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
if (Platform.OS === 'ios') {
  try {
    const { VybeNowPlaying } = NativeModules;
    if (VybeNowPlaying) {
      const airplayEmitter = new NativeEventEmitter(VybeNowPlaying);
      console.log('[AirPlay] Listener registered, waiting for onAirPlayConnected event');
      airplayEmitter.addListener('onAirPlayConnected', () => {
        const { currentTrack, progress, duration, playbackState } = usePlaybackController.getState();
        console.log('[AirPlay] 🎵 onAirPlayConnected fired. currentTrack:', currentTrack?.title, 'artwork:', currentTrack?.artwork);
        usePlaybackController.setState({ isAirPlayConnected: true });
        if (currentTrack) {
          console.log('[AirPlay] Connected — re-pushing full Now Playing info + artwork');
          updateNowPlaying({
            trackTitle: currentTrack.title,
            artistName: currentTrack.artist,
            artworkUrl: currentTrack.artwork ?? '',
            duration: duration || 0,
            currentTime: progress,
            isPlaying: playbackState === 'playing',
          });
          if (currentTrack.artwork) {
            setNowPlayingArtwork(currentTrack.artwork);
          }
        }
      });
      airplayEmitter.addListener('onAirPlayDisconnected', () => {
        console.log('[AirPlay] 🔇 onAirPlayDisconnected fired');
        usePlaybackController.setState({ isAirPlayConnected: false });
      });
    }
  } catch (e) {
    console.warn('[AirPlay] Failed to register listener:', e);
  }
}
