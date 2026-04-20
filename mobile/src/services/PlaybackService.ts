/**
 * Single-flight expo-av audio session setup (replaces ad-hoc TrackPlayer.setupPlayer patterns).
 * Prevents overlapping native `setAudioModeAsync` calls that can stall the bridge on cold start.
 */
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';

let isSetup = false;
let setupPromise: Promise<void> | null = null;

export function invalidatePlaybackSetup(): void {
  isSetup = false;
}

export async function ensurePlaybackSetup(): Promise<void> {
  if (isSetup) return;
  if (setupPromise) return setupPromise;

  const applyMode = async () => {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      allowsRecordingIOS: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    });
    isSetup = true;
  };

  setupPromise = (async () => {
    try {
      await applyMode();
    } catch (error) {
      console.error('[PlaybackService] Audio session setup failed (will retry once):', error);
      try {
        await new Promise<void>((r) => setTimeout(r, 120));
        invalidatePlaybackSetup();
        await applyMode();
      } catch (e2) {
        console.error('[PlaybackService] Audio session retry failed — UI continues without blocking:', e2);
        /* Do not rethrow: boot and navigation must not depend on native audio readiness. */
      }
    } finally {
      setupPromise = null;
    }
  })();

  return setupPromise;
}
