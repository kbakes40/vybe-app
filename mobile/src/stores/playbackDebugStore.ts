import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDavinciDynamicsStore } from '@/stores/davinciDynamicsStore';

/**
 * Playback Debug Store
 *
 * Manages debug state for diagnosing audio playback issues.
 * Only visible to developers when enabled.
 */

export interface SoundCloudDebugState {
  embedLoaded: boolean;
  playCommandSent: boolean;
  currentTimeAdvancing: boolean;
  silentPlaybackDetected: boolean;
  lastPosition: number;
  widgetReady: boolean;
}

export interface YouTubeMusicDebugState {
  embedReady: boolean;
  playCommandAcknowledged: boolean;
  audioOutputActive: boolean;
  embedBlocked: boolean;
}

export interface PlaybackDebugState {
  // Debug mode settings
  debugModeEnabled: boolean;
  debugOverlayVisible: boolean;
  unlockTapCount: number;
  lastUnlockTapTime: number;

  // Audio session state
  activeAudioSource: 'none' | 'vybe' | 'soundcloud' | 'youtube' | 'youtube_music';
  audioSessionActive: boolean;

  // WebView state
  webViewMediaStatus: 'idle' | 'loading' | 'ready' | 'playing' | 'blocked' | 'error';

  // Playback tracking
  playbackTimeAdvancing: boolean;
  retryCount: number;
  lastPlaybackError: string | null;

  // Source-specific debug state
  soundCloudDebug: SoundCloudDebugState;
  youTubeMusicDebug: YouTubeMusicDebugState;

  // Debug log entries (last 20)
  debugLogs: Array<{ timestamp: number; message: string; level: 'info' | 'warn' | 'error' }>;

  // Actions
  setDebugModeEnabled: (enabled: boolean) => void;
  toggleDebugOverlay: () => void;
  handleUnlockTap: () => boolean; // Returns true if unlocked
  setActiveAudioSource: (source: PlaybackDebugState['activeAudioSource']) => void;
  setAudioSessionActive: (active: boolean) => void;
  setWebViewMediaStatus: (status: PlaybackDebugState['webViewMediaStatus']) => void;
  setPlaybackTimeAdvancing: (advancing: boolean) => void;
  setRetryCount: (count: number) => void;
  setLastPlaybackError: (error: string | null) => void;
  updateSoundCloudDebug: (update: Partial<SoundCloudDebugState>) => void;
  updateYouTubeMusicDebug: (update: Partial<YouTubeMusicDebugState>) => void;
  addDebugLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
  clearDebugLogs: () => void;
  resetDebugState: () => void;
  logCurrentState: () => void;
}

const initialSoundCloudDebug: SoundCloudDebugState = {
  embedLoaded: false,
  playCommandSent: false,
  currentTimeAdvancing: false,
  silentPlaybackDetected: false,
  lastPosition: 0,
  widgetReady: false,
};

const initialYouTubeMusicDebug: YouTubeMusicDebugState = {
  embedReady: false,
  playCommandAcknowledged: false,
  audioOutputActive: false,
  embedBlocked: false,
};

export const usePlaybackDebugStore = create<PlaybackDebugState>()(
  persist(
    (set, get) => ({
      // Initial state
      debugModeEnabled: false,
      debugOverlayVisible: false,
      unlockTapCount: 0,
      lastUnlockTapTime: 0,
      activeAudioSource: 'none',
      audioSessionActive: false,
      webViewMediaStatus: 'idle',
      playbackTimeAdvancing: false,
      retryCount: 0,
      lastPlaybackError: null,
      soundCloudDebug: { ...initialSoundCloudDebug },
      youTubeMusicDebug: { ...initialYouTubeMusicDebug },
      debugLogs: [],

      setDebugModeEnabled: (enabled) => {
        set({ debugModeEnabled: enabled });
        if (!enabled) {
          set({ debugOverlayVisible: false });
        }
        console.log('[PlaybackDebug] Debug mode:', enabled ? 'ENABLED' : 'DISABLED');
      },

      toggleDebugOverlay: () => {
        const { debugModeEnabled, debugOverlayVisible } = get();
        if (debugModeEnabled) {
          set({ debugOverlayVisible: !debugOverlayVisible });
        }
      },

      handleUnlockTap: () => {
        const { unlockTapCount, lastUnlockTapTime, debugModeEnabled } = get();
        const now = Date.now();

        // If already unlocked, just toggle overlay
        if (debugModeEnabled) {
          get().toggleDebugOverlay();
          return true;
        }

        // Reset count if more than 2 seconds since last tap
        if (now - lastUnlockTapTime > 2000) {
          set({ unlockTapCount: 1, lastUnlockTapTime: now });
          return false;
        }

        const newCount = unlockTapCount + 1;
        set({ unlockTapCount: newCount, lastUnlockTapTime: now });

        // Unlock after 5 taps
        if (newCount >= 5) {
          set({ debugModeEnabled: true, unlockTapCount: 0 });
          console.log('[PlaybackDebug] Debug mode UNLOCKED via tap sequence');
          return true;
        }

        return false;
      },

      setActiveAudioSource: (source) => {
        set({ activeAudioSource: source });
        get().addDebugLog(`Audio source: ${source}`);
      },

      setAudioSessionActive: (active) => {
        set({ audioSessionActive: active });
        get().addDebugLog(`Audio session: ${active ? 'active' : 'inactive'}`);
      },

      setWebViewMediaStatus: (status) => {
        set({ webViewMediaStatus: status });
        get().addDebugLog(`WebView status: ${status}`);
      },

      setPlaybackTimeAdvancing: (advancing) => {
        const prev = get().playbackTimeAdvancing;
        if (prev !== advancing) {
          set({ playbackTimeAdvancing: advancing });
          if (!advancing) {
            get().addDebugLog('Playback time STOPPED advancing', 'warn');
          }
        }
      },

      setRetryCount: (count) => {
        set({ retryCount: count });
        if (count > 0) {
          get().addDebugLog(`Retry count: ${count}`, 'warn');
        }
      },

      setLastPlaybackError: (error) => {
        set({ lastPlaybackError: error });
        if (error) {
          get().addDebugLog(`Error: ${error}`, 'error');
        }
      },

      updateSoundCloudDebug: (update) => {
        set(state => ({
          soundCloudDebug: { ...state.soundCloudDebug, ...update },
        }));

        // Log significant changes
        if (update.silentPlaybackDetected) {
          get().addDebugLog('SoundCloud: Silent playback detected!', 'error');
        }
        if (update.widgetReady) {
          get().addDebugLog('SoundCloud: Widget ready');
        }
        if (update.currentTimeAdvancing === true) {
          get().addDebugLog('SoundCloud: Time advancing');
        }
      },

      updateYouTubeMusicDebug: (update) => {
        set(state => ({
          youTubeMusicDebug: { ...state.youTubeMusicDebug, ...update },
        }));

        if (update.embedBlocked) {
          get().addDebugLog('YouTube Music: Embed blocked', 'error');
        }
      },

      addDebugLog: (message, level = 'info') => {
        useDavinciDynamicsStore.getState().push(`[PlaybackDebug] ${message}`, level);

        const { debugLogs, debugModeEnabled } = get();
        if (!debugModeEnabled) {
          const prefix = '[PlaybackDebug]';
          if (level === 'error') console.error(prefix, message);
          else if (level === 'warn') console.warn(prefix, message);
          else console.log(prefix, message);
          return;
        }

        const newLog = {
          timestamp: Date.now(),
          message,
          level,
        };

        const newLogs = [...debugLogs, newLog].slice(-20);
        set({ debugLogs: newLogs });

        const prefix = '[PlaybackDebug]';
        if (level === 'error') {
          console.error(prefix, message);
        } else if (level === 'warn') {
          console.warn(prefix, message);
        } else {
          console.log(prefix, message);
        }
      },

      clearDebugLogs: () => {
        set({ debugLogs: [] });
      },

      resetDebugState: () => {
        set({
          activeAudioSource: 'none',
          audioSessionActive: false,
          webViewMediaStatus: 'idle',
          playbackTimeAdvancing: false,
          retryCount: 0,
          lastPlaybackError: null,
          soundCloudDebug: { ...initialSoundCloudDebug },
          youTubeMusicDebug: { ...initialYouTubeMusicDebug },
        });
      },

      logCurrentState: () => {
        const state = get();
        console.log('[PlaybackDebug] Current state:', {
          activeSource: state.activeAudioSource,
          audioSessionActive: state.audioSessionActive,
          webViewStatus: state.webViewMediaStatus,
          timeAdvancing: state.playbackTimeAdvancing,
          retryCount: state.retryCount,
          lastError: state.lastPlaybackError,
          soundCloud: state.soundCloudDebug,
          youTubeMusic: state.youTubeMusicDebug,
        });
      },
    }),
    {
      name: 'playback-debug-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        debugModeEnabled: state.debugModeEnabled,
      }),
    }
  )
);
