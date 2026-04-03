import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '@/components/MiniPlayer';
import { usePlaybackController } from '@/stores/playbackController';
import { SoundCloudWebViewPool, SoundCloudWebViewPoolRef } from '@/components/SoundCloudWebViewPool';
import { YouTubeWebViewPool, YouTubeWebViewPoolRef } from '@/components/YouTubeWebViewPool';
import { PlaybackDebugOverlay } from '@/components/PlaybackDebugOverlay';
import { useSignalTracker } from '@/hooks/useSignalTracker';
import { useDiscoveryRefresh } from '@/hooks/useDiscoveryRefresh';

// Mini player dimensions - exported for use in screens
export const MINI_PLAYER_HEIGHT = 66; // 48px artwork + 16px padding + 2px progress bar

// Tab bar height constant (50px + bottom safe area)
export const TAB_BAR_BASE_HEIGHT = 50;

// Global refs to the warm WebView pools
export let warmSoundCloudRef: React.RefObject<SoundCloudWebViewPoolRef | null> | null = null;
export let warmYouTubeRef: React.RefObject<YouTubeWebViewPoolRef | null> | null = null;

export default function AppLayout() {
  // Use the unified PlaybackController instead of the old playerStore
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const insets = useSafeAreaInsets();
  const showMiniPlayer = !!currentTrack;
  const soundcloudPoolRef = useRef<SoundCloudWebViewPoolRef>(null);
  const youtubePoolRef = useRef<YouTubeWebViewPoolRef>(null);
  const pathname = usePathname();

  // Discovery system hooks - track listening signals and refresh on app open
  useSignalTracker();
  useDiscoveryRefresh();

  // Expose the warm WebView refs globally
  useEffect(() => {
    warmSoundCloudRef = soundcloudPoolRef;
    warmYouTubeRef = youtubePoolRef;
    console.log('[AppLayout] Warm WebView pools initialized');
    return () => {
      warmSoundCloudRef = null;
      warmYouTubeRef = null;
    };
  }, []);

  // Check if we're on a tab screen (tabs have the tab bar visible)
  const isTabScreen = pathname === '/' || pathname === '/search' || pathname === '/library' || pathname === '/discover';

  // Tab bar height (only applies on tab screens)
  const tabBarHeight = TAB_BAR_BASE_HEIGHT + insets.bottom;

  // Mini player bottom position:
  // - On tab screens: sits directly above the tab bar
  // - On non-tab screens: sits at the bottom with safe area inset
  const miniPlayerBottom = isTabScreen ? tabBarHeight : insets.bottom;

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0A0A0A' },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="nowPlaying"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            contentStyle: { backgroundColor: '#0A0A0A' },
          }}
        />
        <Stack.Screen
          name="upgrade"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="artist/[id]"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="album/[id]"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="playlist/[id]"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="profile"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="listening-stats"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="accounts"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="your-plan"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="soundcloud-import"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="beat-match-radio"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="taste-dna"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="downloads"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="import-audio"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="discover-onboarding"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="vybe-originals"
          options={{
            animation: 'slide_from_right',
          }}
        />
      </Stack>

      {/* Hidden warm WebView pools - preload APIs for instant playback */}
      {/* SoundCloud pool - loads widget API */}
      <SoundCloudWebViewPool
        ref={soundcloudPoolRef}
        visible={false}
      />

      {/* YouTube pool - loads IFrame API for YouTube and YouTube Music */}
      <YouTubeWebViewPool
        ref={youtubePoolRef}
        visible={false}
      />

      {/* Global Mini Player - fixed to bottom, above tab bar on tab screens */}
      {showMiniPlayer && (
        <View
          style={[
            styles.miniPlayerContainer,
            { bottom: miniPlayerBottom },
          ]}
          pointerEvents="box-none"
        >
          <MiniPlayer />
        </View>
      )}

      {/* Playback Debug Overlay - only visible when debug mode is enabled */}
      <PlaybackDebugOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  miniPlayerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    overflow: 'visible',
  },
});
