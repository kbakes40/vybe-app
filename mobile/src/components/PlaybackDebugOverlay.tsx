import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { X, Bug, RefreshCw } from 'lucide-react-native';
import { usePlaybackDebugStore } from '@/stores/playbackDebugStore';
import { usePlaybackController } from '@/stores/playbackController';

/**
 * PlaybackDebugOverlay
 *
 * A minimal, non-intrusive debug overlay for diagnosing audio playback issues.
 * Only visible when Playback Debug Mode is enabled.
 */

function DebugRow({ label, value, status }: { label: string; value: string; status?: 'good' | 'warn' | 'error' | 'neutral' }) {
  const statusColors = {
    good: 'text-green-400',
    warn: 'text-yellow-400',
    error: 'text-red-400',
    neutral: 'text-white/70',
  };

  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-white/50 text-xs">{label}</Text>
      <Text className={`text-xs font-mono ${statusColors[status || 'neutral']}`}>{value}</Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-[#8B5CF6] text-xs font-semibold mt-2 mb-1 uppercase tracking-wider">
      {title}
    </Text>
  );
}

export function PlaybackDebugOverlay() {
  const debugModeEnabled = usePlaybackDebugStore(s => s.debugModeEnabled);
  const debugOverlayVisible = usePlaybackDebugStore(s => s.debugOverlayVisible);
  const activeAudioSource = usePlaybackDebugStore(s => s.activeAudioSource);
  const audioSessionActive = usePlaybackDebugStore(s => s.audioSessionActive);
  const webViewMediaStatus = usePlaybackDebugStore(s => s.webViewMediaStatus);
  const playbackTimeAdvancing = usePlaybackDebugStore(s => s.playbackTimeAdvancing);
  const retryCount = usePlaybackDebugStore(s => s.retryCount);
  const lastPlaybackError = usePlaybackDebugStore(s => s.lastPlaybackError);
  const soundCloudDebug = usePlaybackDebugStore(s => s.soundCloudDebug);
  const youTubeMusicDebug = usePlaybackDebugStore(s => s.youTubeMusicDebug);
  const debugLogs = usePlaybackDebugStore(s => s.debugLogs);
  const toggleDebugOverlay = usePlaybackDebugStore(s => s.toggleDebugOverlay);
  const clearDebugLogs = usePlaybackDebugStore(s => s.clearDebugLogs);
  const logCurrentState = usePlaybackDebugStore(s => s.logCurrentState);

  // Get current playback state
  const playbackState = usePlaybackController(s => s.playbackState);
  const currentSource = usePlaybackController(s => s.currentSource);
  const progress = usePlaybackController(s => s.progress);
  const duration = usePlaybackController(s => s.duration);

  if (!debugModeEnabled || !debugOverlayVisible) {
    return null;
  }

  const isSoundCloud = currentSource === 'soundcloud';
  const isYouTubeMusic = currentSource === 'youtube_music';

  const sourceLabel = {
    none: 'None',
    vybe: 'VYBE Native',
    soundcloud: 'SoundCloud',
    youtube: 'YouTube',
    youtube_music: 'YouTube Music',
  }[activeAudioSource || 'none'];

  const webViewStatusLabel = {
    idle: 'Idle',
    loading: 'Loading',
    ready: 'Ready',
    playing: 'Playing',
    blocked: 'BLOCKED',
    error: 'Error',
  }[webViewMediaStatus];

  return (
    <View
      className="absolute top-0 left-0 right-0 bg-black/95 border-b border-[#8B5CF6]/30"
      style={{ zIndex: 250000, elevation: 250000 }}
    >
      <View className="px-3 pt-2 pb-1">
        {/* Header */}
        <View className="flex-row items-center justify-between mb-1">
          <View className="flex-row items-center">
            <Bug size={14} color="#8B5CF6" />
            <Text className="text-[#8B5CF6] text-xs font-semibold ml-1.5">Playback Debug</Text>
          </View>
          <View className="flex-row items-center">
            <Pressable onPress={logCurrentState} className="p-1.5 mr-1">
              <RefreshCw size={12} color="#fff" />
            </Pressable>
            <Pressable onPress={toggleDebugOverlay} className="p-1.5">
              <X size={14} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* Core Status */}
        <SectionHeader title="Audio Session" />
        <DebugRow
          label="Active Source"
          value={sourceLabel}
          status={activeAudioSource !== 'none' ? 'good' : 'neutral'}
        />
        <DebugRow
          label="Session State"
          value={audioSessionActive ? 'Active' : 'Inactive'}
          status={audioSessionActive ? 'good' : 'warn'}
        />
        <DebugRow
          label="WebView Status"
          value={webViewStatusLabel}
          status={webViewMediaStatus === 'playing' ? 'good' : webViewMediaStatus === 'blocked' || webViewMediaStatus === 'error' ? 'error' : 'neutral'}
        />
        <DebugRow
          label="Time Advancing"
          value={playbackTimeAdvancing ? 'Yes' : 'No'}
          status={playbackTimeAdvancing ? 'good' : 'warn'}
        />
        <DebugRow
          label="Playback State"
          value={playbackState}
          status={playbackState === 'playing' ? 'good' : playbackState === 'error' ? 'error' : 'neutral'}
        />
        <DebugRow
          label="Progress"
          value={`${progress.toFixed(1)}s / ${duration.toFixed(1)}s`}
          status="neutral"
        />
        {retryCount > 0 && (
          <DebugRow label="Retry Count" value={String(retryCount)} status="warn" />
        )}
        {lastPlaybackError && (
          <DebugRow label="Last Error" value={lastPlaybackError.substring(0, 30)} status="error" />
        )}

        {/* SoundCloud Specific */}
        {isSoundCloud && (
          <>
            <SectionHeader title="SoundCloud" />
            <DebugRow
              label="Embed Loaded"
              value={soundCloudDebug.embedLoaded ? 'Yes' : 'No'}
              status={soundCloudDebug.embedLoaded ? 'good' : 'neutral'}
            />
            <DebugRow
              label="Widget Ready"
              value={soundCloudDebug.widgetReady ? 'Yes' : 'No'}
              status={soundCloudDebug.widgetReady ? 'good' : 'warn'}
            />
            <DebugRow
              label="Play Cmd Sent"
              value={soundCloudDebug.playCommandSent ? 'Yes' : 'No'}
              status={soundCloudDebug.playCommandSent ? 'good' : 'neutral'}
            />
            <DebugRow
              label="Time Advancing"
              value={soundCloudDebug.currentTimeAdvancing ? 'Yes' : 'No'}
              status={soundCloudDebug.currentTimeAdvancing ? 'good' : 'warn'}
            />
            <DebugRow
              label="Silent Playback"
              value={soundCloudDebug.silentPlaybackDetected ? 'DETECTED' : 'No'}
              status={soundCloudDebug.silentPlaybackDetected ? 'error' : 'good'}
            />
            <DebugRow
              label="Last Position"
              value={`${(soundCloudDebug.lastPosition / 1000).toFixed(1)}s`}
              status="neutral"
            />
          </>
        )}

        {/* YouTube Music Specific */}
        {isYouTubeMusic && (
          <>
            <SectionHeader title="YouTube Music" />
            <DebugRow
              label="Embed Ready"
              value={youTubeMusicDebug.embedReady ? 'Yes' : 'No'}
              status={youTubeMusicDebug.embedReady ? 'good' : 'neutral'}
            />
            <DebugRow
              label="Play Acknowledged"
              value={youTubeMusicDebug.playCommandAcknowledged ? 'Yes' : 'No'}
              status={youTubeMusicDebug.playCommandAcknowledged ? 'good' : 'neutral'}
            />
            <DebugRow
              label="Audio Active"
              value={youTubeMusicDebug.audioOutputActive ? 'Yes' : 'No'}
              status={youTubeMusicDebug.audioOutputActive ? 'good' : 'warn'}
            />
            <DebugRow
              label="Embed Blocked"
              value={youTubeMusicDebug.embedBlocked ? 'BLOCKED' : 'Allowed'}
              status={youTubeMusicDebug.embedBlocked ? 'error' : 'good'}
            />
          </>
        )}

        {/* Debug Logs */}
        {debugLogs.length > 0 && (
          <>
            <View className="flex-row items-center justify-between mt-2">
              <Text className="text-[#8B5CF6] text-xs font-semibold uppercase tracking-wider">
                Logs ({debugLogs.length})
              </Text>
              <Pressable onPress={clearDebugLogs}>
                <Text className="text-white/40 text-xs">Clear</Text>
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 60 }} className="mt-1">
              {debugLogs.slice(-5).map((log, i) => (
                <Text
                  key={i}
                  className={`text-xs font-mono ${
                    log.level === 'error' ? 'text-red-400' :
                    log.level === 'warn' ? 'text-yellow-400' : 'text-white/50'
                  }`}
                  numberOfLines={1}
                >
                  {new Date(log.timestamp).toLocaleTimeString().slice(0, 8)} {log.message}
                </Text>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Compact debug indicator for MiniPlayer
 * Shows a small colored dot indicating playback health
 */
export function PlaybackDebugIndicator() {
  const debugModeEnabled = usePlaybackDebugStore(s => s.debugModeEnabled);
  const playbackTimeAdvancing = usePlaybackDebugStore(s => s.playbackTimeAdvancing);
  const lastPlaybackError = usePlaybackDebugStore(s => s.lastPlaybackError);
  const soundCloudDebug = usePlaybackDebugStore(s => s.soundCloudDebug);
  const toggleDebugOverlay = usePlaybackDebugStore(s => s.toggleDebugOverlay);

  const playbackState = usePlaybackController(s => s.playbackState);

  if (!debugModeEnabled) {
    return null;
  }

  // Determine indicator color
  let indicatorColor = '#666'; // neutral
  if (playbackState === 'playing' && playbackTimeAdvancing) {
    indicatorColor = '#22c55e'; // green - good
  } else if (playbackState === 'playing' && !playbackTimeAdvancing) {
    indicatorColor = '#eab308'; // yellow - warning (silent?)
  } else if (playbackState === 'error' || lastPlaybackError || soundCloudDebug.silentPlaybackDetected) {
    indicatorColor = '#ef4444'; // red - error
  } else if (playbackState === 'loading' || playbackState === 'buffering') {
    indicatorColor = '#8B5CF6'; // purple - loading
  }

  return (
    <Pressable onPress={toggleDebugOverlay} className="absolute top-1 right-1">
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: indicatorColor,
        }}
      />
    </Pressable>
  );
}

export default PlaybackDebugOverlay;
