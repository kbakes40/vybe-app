import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, AppState, Linking, Text, Pressable } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MiniPlayer } from '@/components/MiniPlayer';
import { usePlaybackController } from '@/stores/playbackController';
import { SoundCloudWebViewPool, SoundCloudWebViewPoolRef } from '@/components/SoundCloudWebViewPool';
import { YouTubeWebViewPool, YouTubeWebViewPoolRef } from '@/components/YouTubeWebViewPool';
import { PlaybackDebugOverlay } from '@/components/PlaybackDebugOverlay';
import { useSignalTracker } from '@/hooks/useSignalTracker';
import { useDiscoveryRefresh } from '@/hooks/useDiscoveryRefresh';
import * as Clipboard from 'expo-clipboard';
import { MMKV } from 'react-native-mmkv';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { X } from 'lucide-react-native';

// Persists the last clipboard URL seen across app restarts
// so the iOS paste dialog only fires once per unique URL
const clipboardStorage = new MMKV({ id: 'vybe-clipboard-v1' });

// Mini player dimensions - exported for use in screens
export const MINI_PLAYER_HEIGHT = 66; // 48px artwork + 16px padding + 2px progress bar

// Tab bar height constant (50px + bottom safe area)
export const TAB_BAR_BASE_HEIGHT = 50;

// Global refs to the warm WebView pools
export let warmSoundCloudRef: React.RefObject<SoundCloudWebViewPoolRef | null> | null = null;
export let warmYouTubeRef: React.RefObject<YouTubeWebViewPoolRef | null> | null = null;

type MusicPlatform = 'soundcloud' | 'youtube_music' | 'youtube' | 'spotify' | 'apple_music';

function detectMusicPlatform(text: string): MusicPlatform | null {
  const t = text.trim();
  if (!t.startsWith('http')) return null;
  if (t.includes('music.youtube.com/')) return 'youtube_music';
  if (t.includes('youtube.com/watch') || t.includes('youtu.be/') || t.includes('youtube.com/playlist')) return 'youtube';
  if (/soundcloud\.com\/.+\/.+/.test(t)) return 'soundcloud';
  if (t.includes('open.spotify.com/')) return 'spotify';
  if (t.includes('music.apple.com/')) return 'apple_music';
  return null;
}

export default function AppLayout() {
  // Use the unified PlaybackController instead of the old playerStore
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const insets = useSafeAreaInsets();
  const showMiniPlayer = !!currentTrack;
  const soundcloudPoolRef = useRef<SoundCloudWebViewPoolRef>(null);
  const youtubePoolRef = useRef<YouTubeWebViewPoolRef>(null);
  const pathname = usePathname();
  const router = useRouter();

  // Clipboard banner state
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [clipboardPlatform, setClipboardPlatform] = useState<MusicPlatform | null>(null);
  const lastSeenClip = useRef<string>(clipboardStorage.getString('lastUrl') ?? '');
  const bannerY = useSharedValue(-120);
  const bannerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bannerY.value }] }));

  const showBanner = (url: string, platform: MusicPlatform) => {
    setClipboardUrl(url);
    setClipboardPlatform(platform);
    bannerY.value = withSpring(0, { damping: 18, stiffness: 200 });
  };

  const dismissBanner = () => {
    bannerY.value = withTiming(-120, { duration: 250 });
    setTimeout(() => { setClipboardUrl(null); setClipboardPlatform(null); }, 260);
  };

  const openFromBanner = () => {
    if (!clipboardUrl) return;
    dismissBanner();
    router.push({ pathname: '/(app)/add-music', params: { prefillUrl: clipboardUrl } });
  };

  // Check clipboard for music links whenever app comes to foreground
  useEffect(() => {
    const checkClipboard = async () => {
      try {
        const text = (await Clipboard.getStringAsync()).trim();
        if (!text || text === lastSeenClip.current) return;
        lastSeenClip.current = text;
        clipboardStorage.set('lastUrl', text);
        const platform = detectMusicPlatform(text);
        if (platform) showBanner(text, platform);
      } catch {}
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkClipboard();
    });
    // Check once on mount
    checkClipboard();
    return () => sub.remove();
  }, []);

  // Handle vibecode://import?url=... deep links
  useEffect(() => {
    const handleDeepLink = (url: string) => {
      try {
        const parsed = new URL(url);
        const target = parsed.searchParams.get('url');
        if (target && detectMusicPlatform(target)) {
          router.push({ pathname: '/(app)/add-music', params: { prefillUrl: target } });
        }
      } catch {}
    };

    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, [router]);

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
          name="artist-profile"
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
          name="liked-songs"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="my-playlist/[id]"
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

      {/* Clipboard music link banner */}
      {clipboardUrl && (
        <Animated.View
          style={[
            bannerStyle,
            {
              position: 'absolute',
              top: insets.top + 8,
              left: 16,
              right: 16,
              backgroundColor: '#1C1C1E',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 12,
              paddingLeft: 14,
              paddingRight: 10,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 12,
            },
          ]}
        >
          {/* Platform dot */}
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: clipboardPlatform === 'soundcloud' ? '#FF5500' : clipboardPlatform === 'spotify' ? '#1DB954' : clipboardPlatform === 'apple_music' ? '#FC3C44' : '#FF0000',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Text style={{ color: clipboardPlatform === 'spotify' ? '#000' : '#fff', fontSize: clipboardPlatform === 'soundcloud' ? 11 : 13, fontWeight: '900' }}>
              {clipboardPlatform === 'soundcloud' ? ')))' : clipboardPlatform === 'spotify' ? '♫' : '▶'}
            </Text>
          </View>

          {/* Text */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
              {clipboardPlatform === 'soundcloud' ? 'SoundCloud' : clipboardPlatform === 'youtube_music' ? 'YouTube Music' : clipboardPlatform === 'spotify' ? 'Spotify' : clipboardPlatform === 'apple_music' ? 'Apple Music' : 'YouTube'} link detected
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 1 }} numberOfLines={1}>
              {clipboardUrl}
            </Text>
          </View>

          {/* Import button */}
          <Pressable
            onPress={openFromBanner}
            style={{
              backgroundColor: '#8B5CF6',
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 7,
              marginLeft: 8,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Import</Text>
          </Pressable>

          {/* Dismiss */}
          <Pressable onPress={dismissBanner} style={{ padding: 6, marginLeft: 4 }}>
            <X size={16} color="rgba(255,255,255,0.4)" />
          </Pressable>
        </Animated.View>
      )}
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
