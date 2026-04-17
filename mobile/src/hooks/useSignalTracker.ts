import { useEffect, useRef, useCallback } from 'react';
import { useDiscoveryAlgorithmStore } from '@/stores/discoveryAlgorithmStore';
import { usePlaybackController } from '@/stores/playbackController';
import type { SignalType } from '@/types/discovery';

/**
 * Hook that automatically tracks listening signals
 * Attach this to the main app layout to track all playback
 */
export function useSignalTracker() {
  const recordSignal = useDiscoveryAlgorithmStore(s => s.recordSignal);
  const flushSignalQueue = useDiscoveryAlgorithmStore(s => s.flushSignalQueue);

  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playbackState = usePlaybackController(s => s.playbackState);
  const progress = usePlaybackController(s => s.progress);
  const duration = usePlaybackController(s => s.duration);

  // Track the current track being monitored
  const trackingRef = useRef<{
    trackId: string | null;
    startTime: number;
    hasRecordedPlay: boolean;
    hasRecordedComplete: boolean;
    maxProgress: number;
  }>({
    trackId: null,
    startTime: 0,
    hasRecordedPlay: false,
    hasRecordedComplete: false,
    maxProgress: 0,
  });

  // Record a signal
  const record = useCallback((signalType: SignalType, overrides?: { skipPosition?: number }) => {
    if (!currentTrack) return;

    const tracking = trackingRef.current;
    const listenDuration = Math.floor((Date.now() - tracking.startTime) / 1000);

    recordSignal({
      trackId: currentTrack.id,
      signalType,
      listenDuration,
      trackDuration: Math.floor(duration || currentTrack.duration || 180),
      skipPosition:
        overrides?.skipPosition != null
          ? Math.floor(overrides.skipPosition)
          : undefined,
    });
  }, [currentTrack, duration, recordSignal]);

  // Track changes
  useEffect(() => {
    if (!currentTrack) return;

    const tracking = trackingRef.current;

    // New track started
    if (tracking.trackId !== currentTrack.id) {
      // Check if previous track was skipped
      if (tracking.trackId && tracking.hasRecordedPlay && !tracking.hasRecordedComplete) {
        // Previous track was changed before completion - record skip
        recordSignal({
          trackId: tracking.trackId,
          signalType: 'skip',
          listenDuration: Math.floor((Date.now() - tracking.startTime) / 1000),
          trackDuration: Math.floor(duration || 180),
          skipPosition: Math.floor(tracking.maxProgress),
        });
      }

      // Reset tracking for new track
      tracking.trackId = currentTrack.id;
      tracking.startTime = Date.now();
      tracking.hasRecordedPlay = false;
      tracking.hasRecordedComplete = false;
      tracking.maxProgress = 0;
    }
  }, [currentTrack?.id, duration, recordSignal]);

  // Track playback state
  useEffect(() => {
    const tracking = trackingRef.current;
    if (!currentTrack || tracking.trackId !== currentTrack.id) return;

    if (playbackState === 'playing' && !tracking.hasRecordedPlay) {
      // Record play signal
      record('play');
      tracking.hasRecordedPlay = true;
    }
  }, [playbackState, currentTrack, record]);

  // Track progress for completion detection
  useEffect(() => {
    const tracking = trackingRef.current;
    if (!currentTrack || tracking.trackId !== currentTrack.id) return;

    // Update max progress
    if (progress > tracking.maxProgress) {
      tracking.maxProgress = progress;
    }

    // Check for completion (listened to 90%+ of track)
    const trackDuration = duration || currentTrack.duration || 180;
    const completionThreshold = trackDuration * 0.9;
    if (progress >= completionThreshold && tracking.hasRecordedPlay && !tracking.hasRecordedComplete) {
      record('complete');
      tracking.hasRecordedComplete = true;
    }
  }, [progress, duration, currentTrack, record]);

  // Flush queue when component unmounts
  useEffect(() => {
    return () => {
      flushSignalQueue();
    };
  }, [flushSignalQueue]);

  // Return manual signal recording for UI actions
  return {
    recordSave: useCallback(() => record('save'), [record]),
    recordReplay: useCallback(() => record('replay'), [record]),
    recordUnlike: useCallback(() => record('unlike'), [record]),
    recordSkip: useCallback((position: number) => record('skip', { skipPosition: position }), [record]),
  };
}
