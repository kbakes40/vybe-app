import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';

/**
 * AudioSessionManager
 *
 * Ensures only ONE audio source plays at a time across the entire app.
 * Manages audio session configuration for reliable playback.
 */

export type AudioSource = 'vybe' | 'soundcloud' | 'youtube' | 'none';

interface AudioSessionState {
  activeSource: AudioSource;
  isSessionActive: boolean;
  volume: number;
}

class AudioSessionManagerClass {
  private state: AudioSessionState = {
    activeSource: 'none',
    isSessionActive: false,
    volume: 1.0,
  };

  private listeners: Set<(state: AudioSessionState) => void> = new Set();

  // Callbacks for stopping specific sources
  private stopVybeCallback: (() => Promise<void>) | null = null;
  private stopSoundCloudCallback: (() => Promise<void>) | null = null;
  private stopYouTubeCallback: (() => Promise<void>) | null = null;

  constructor() {
    this.initializeAudioSession();
  }

  /**
   * Initialize the audio session with proper configuration
   */
  private async initializeAudioSession(): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });
      console.log('[AudioSessionManager] Audio session initialized');
      this.state.isSessionActive = true;
    } catch (error) {
      console.error('[AudioSessionManager] Failed to initialize audio session:', error);
    }
  }

  /**
   * Register stop callbacks for each audio source
   */
  registerStopCallback(source: AudioSource, callback: () => Promise<void>): void {
    switch (source) {
      case 'vybe':
        this.stopVybeCallback = callback;
        break;
      case 'soundcloud':
        this.stopSoundCloudCallback = callback;
        break;
      case 'youtube':
        this.stopYouTubeCallback = callback;
        break;
    }
    console.log(`[AudioSessionManager] Registered stop callback for ${source}`);
  }

  /**
   * Unregister stop callback for a source
   */
  unregisterStopCallback(source: AudioSource): void {
    switch (source) {
      case 'vybe':
        this.stopVybeCallback = null;
        break;
      case 'soundcloud':
        this.stopSoundCloudCallback = null;
        break;
      case 'youtube':
        this.stopYouTubeCallback = null;
        break;
    }
  }

  /**
   * Activate a specific audio source, stopping all others first
   */
  async activateSource(source: AudioSource): Promise<boolean> {
    console.log(`[AudioSessionManager] Activating source: ${source}, current: ${this.state.activeSource}`);

    // Stop all other sources first
    await this.stopAllExcept(source);

    // Ensure audio session is properly configured
    await this.ensureAudioSessionActive();

    // Update state
    this.state.activeSource = source;
    this.state.volume = 1.0;
    this.notifyListeners();

    console.log(`[AudioSessionManager] Source ${source} now active`);
    return true;
  }

  /**
   * Stop all audio sources except the specified one
   */
  private async stopAllExcept(exceptSource: AudioSource): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    if (exceptSource !== 'vybe' && this.stopVybeCallback) {
      console.log('[AudioSessionManager] Stopping VYBE audio');
      stopPromises.push(this.stopVybeCallback().catch(e => {
        console.log('[AudioSessionManager] Error stopping VYBE:', e);
      }));
    }

    if (exceptSource !== 'soundcloud' && this.stopSoundCloudCallback) {
      console.log('[AudioSessionManager] Stopping SoundCloud audio');
      stopPromises.push(this.stopSoundCloudCallback().catch(e => {
        console.log('[AudioSessionManager] Error stopping SoundCloud:', e);
      }));
    }

    if (exceptSource !== 'youtube' && this.stopYouTubeCallback) {
      console.log('[AudioSessionManager] Stopping YouTube audio');
      stopPromises.push(this.stopYouTubeCallback().catch(e => {
        console.log('[AudioSessionManager] Error stopping YouTube:', e);
      }));
    }

    await Promise.all(stopPromises);
  }

  /**
   * Stop all audio sources
   */
  async stopAll(): Promise<void> {
    console.log('[AudioSessionManager] Stopping all audio sources');
    await this.stopAllExcept('none');
    this.state.activeSource = 'none';
    this.notifyListeners();
  }

  /**
   * Ensure the audio session is active and properly configured
   */
  private async ensureAudioSessionActive(): Promise<void> {
    if (!this.state.isSessionActive) {
      await this.initializeAudioSession();
    }
  }

  /**
   * Get the currently active audio source
   */
  getActiveSource(): AudioSource {
    return this.state.activeSource;
  }

  /**
   * Check if a specific source is currently active
   */
  isSourceActive(source: AudioSource): boolean {
    return this.state.activeSource === source;
  }

  /**
   * Get current state
   */
  getState(): AudioSessionState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: AudioSessionState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener({ ...this.state }));
  }

  /**
   * Log current state for debugging
   */
  logState(): void {
    console.log('[AudioSessionManager] Current state:', {
      activeSource: this.state.activeSource,
      isSessionActive: this.state.isSessionActive,
      volume: this.state.volume,
      hasVybeCallback: !!this.stopVybeCallback,
      hasSoundCloudCallback: !!this.stopSoundCloudCallback,
      hasYouTubeCallback: !!this.stopYouTubeCallback,
    });
  }
}

// Singleton instance
export const AudioSessionManager = new AudioSessionManagerClass();
