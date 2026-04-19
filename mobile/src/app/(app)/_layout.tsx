import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, AppState, Linking, Text, Pressable } from 'react-native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NowPlayingSheet } from '@/components/NowPlayingSheet';
import { MiniPlayer } from '@/components/MiniPlayer';
import { AirPlayPill } from '@/components/AirPlayPill';
import { usePlaybackController } from '@/stores/playbackController';
import { SoundCloudWebViewPool, SoundCloudWebViewPoolRef } from '@/components/SoundCloudWebViewPool';
import { YouTubeWebViewPool, YouTubeWebViewPoolRef } from '@/components/YouTubeWebViewPool';
import { PlaybackDebugOverlay } from '@/components/PlaybackDebugOverlay';
import { PiPVideoOverlay } from '@/components/PiPVideoOverlay';
import { ShadowPlaybackToast } from '@/components/ShadowPlaybackToast';
import { DavinciDynamicsOverlay } from '@/components/DavinciDynamicsOverlay';
import { useSignalTracker } from '@/hooks/useSignalTracker';
import { useDiscoveryRefresh } from '@/hooks/useDiscoveryRefresh';
import { authClient } from '@/lib/auth/auth-client';
import { api } from '@/lib/api/api';
import { prewarmTopGenres } from '@/lib/genreSearchCache';
import { configurePurchases, getCustomerInfo, isPremiumActive } from '@/lib/purchases';
import { useSubscriptionStore, setVipEmail } from '@/stores/subscriptionStore';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { X } from 'lucide-react-native';

import { MINI_PLAYER_HEIGHT, MINI_PLAYER_TAB_FLUSH_OVERLAP_PX } from '@/constants/miniPlayer';
import { TAB_BAR_HEIGHT, BOTTOM_DOCK_HEIGHT } from '@/constants/Layout';

// Re-export for screens that already import from this layout file
export { MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT, BOTTOM_DOCK_HEIGHT };

// Global refs to the warm WebView pools
export let warmSoundCloudRef: React.RefObject<SoundCloudWebViewPoolRef | null> | null = null;
export let warmYouTubeRef: React.RefObject<YouTubeWebViewPoolRef | null> | null = null;

type MusicPlatform = 'soundcloud' | 'youtube_music' | 'youtube' | 'spotify' | 'apple_music';

function detectMusicPlatform(text: string): MusicPlatform | null {
  if (text.includes('music.youtube.com')) return 'youtube_music';
  if (text.includes('youtube.com/watch') || text.includes('youtu.be/')) return 'youtube';
  if (text.includes('soundcloud.com/') || text.includes('on.soundcloud.com/')) return 'soundcloud';
  if (text.includes('open.spotify.com/') || text.includes('spotify.link/')) return 'spotify';
  if (text.includes('music.apple.com/')) return 'apple_music';
  return null;
}

const PLATFORM_META: Record<MusicPlatform, { label: string; color: string; symbol: string; symbolSize: number }> = {
  soundcloud:   { label: 'SoundCloud',   color: '#FF5500', symbol: ')))', symbolSize: 11 },
  youtube_music:{ label: 'Cloud Source', color: '#FF0000', symbol: '▶',   symbolSize: 13 },
  youtube:      { label: 'Web Stream',   color: '#FF0000', symbol: '▶',   symbolSize: 13 },
  spotify:      { label: 'Spotify',      color: '#1DB954', symbol: '♫',   symbolSize: 16 },
  apple_music:  { label: 'Apple Music',  color: '#FC3C44', symbol: '♪',   symbolSize: 16 },
};

export default function AppLayout() {
  // Unified playback store — mini player mirrors the same `currentTrack` as `MiniPlayer` / `NowPlayingSheet`.
  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const playbackRevision = usePlaybackController((s) => s.playbackRevision);
  const insets = useSafeAreaInsets();
  /** Keep now-playing shell mounted so MMKV-hydrated metadata can show on cold start. */
  const mountNowPlayingChrome = true;
  const soundcloudPoolRef = useRef<SoundCloudWebViewPoolRef>(null);
  const youtubePoolRef = useRef<YouTubeWebViewPoolRef>(null);
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();

  // Clipboard banner state
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  const [clipboardPlatform, setClipboardPlatform] = useState<MusicPlatform | null>(null);
  const lastSeenClip = useRef<string>('');
  const bannerY = useSharedValue(-120);
  const bannerStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bannerY.value }] }));

  const showBanner = (url: string, platform: MusicPlatform) => {
    bannerY.value = -120; // reset before mount
    setClipboardUrl(url);
    setClipboardPlatform(platform);
    // animation fires after mount via the effect below
  };

  // Start slide-in after the Animated.View is actually in the tree
  useEffect(() => {
    if (clipboardUrl) {
      bannerY.value = withSpring(0, { damping: 18, stiffness: 200 });
    }
  }, [clipboardUrl]);

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
    const checkClipboard = async (retryCount = 0) => {
      try {
        const text = (await Clipboard.getStringAsync()).trim();
        if (!text) {
          if (retryCount < 4) setTimeout(() => checkClipboard(retryCount + 1), 700);
          return;
        }
        if (text === lastSeenClip.current) return;
        const platform = detectMusicPlatform(text);
        if (platform) {
          lastSeenClip.current = text;
          showBanner(text, platform);
        }
      } catch {
        if (retryCount < 4) setTimeout(() => checkClipboard(retryCount + 1), 700);
      }
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkClipboard();
    });
    // Check once on mount
    checkClipboard();
    return () => sub.remove();
  }, []);

  // Handle vybe://import?url=... and vybe://downloads deep links
  useEffect(() => {
    let handledInitial = false;
    let lastHandledUrl: string | null = null;
    let lastHandledAt = 0;

    const handleDeepLink = (url: string) => {
      // De-dupe: same URL within 1s is ignored (prevents loop from getInitialURL + url event firing together)
      const now = Date.now();
      if (url === lastHandledUrl && now - lastHandledAt < 1000) return;
      lastHandledUrl = url;
      lastHandledAt = now;

      try {
        const parsed = new URL(url);
        const host = parsed.host || parsed.pathname.replace(/^\/+/, '').split('/')[0];
        // Hard-block any vybe://downloads deep link — stale pills from
        // older widget builds may still emit this. Ignore it entirely.
        if (host === 'downloads') return;
        const target = parsed.searchParams.get('url');
        if (target && detectMusicPlatform(target)) {
          router.push({ pathname: '/(app)/add-music', params: { prefillUrl: target } });
        }
      } catch {}
    };

    Linking.getInitialURL().then((url) => {
      if (url && !handledInitial) {
        handledInitial = true;
        handleDeepLink(url);
      }
    });
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => sub.remove();
  }, [router]);

  // Discovery system hooks - track listening signals and refresh on app open
  useSignalTracker();
  useDiscoveryRefresh();

  // VIP + RevenueCat subscription check — fire-and-forget on mount so it
  // never triggers a re-render of this layout component.
  useEffect(() => {
    (async () => {
      try {
        const session = await authClient.getSession();
        const email = session?.data?.user?.email;
        const userId = session?.data?.user?.id;

        // Cache email for synchronous VIP checks in subscription store
        setVipEmail(email ?? null);

        if (__DEV__) {
          configurePurchases(userId);
          useSubscriptionStore.getState().setTier('plus');
          return;
        }

        // 1. Hardcoded VIP emails — instant
        const VIP_EMAILS = ['kevin.baker88@gmail.com', 'kevin.baker88@me.com'];
        if (email && VIP_EMAILS.includes(email.toLowerCase())) {
          useSubscriptionStore.getState().setTier('plus');
          return;
        }

        // 2. Remote VIP table
        const base = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
        if (email && base) {
          const res = await fetch(`${base}/api/vip/check?email=${encodeURIComponent(email)}`).catch(() => null);
          if (res?.ok) {
            const json = await res.json();
            if (json?.data?.isVip) {
              useSubscriptionStore.getState().setTier('plus');
              return;
            }
          }
        }

        // 3. RevenueCat (may not be available in dev builds)
        try {
          configurePurchases(userId);
          const info = await getCustomerInfo();
          if (info && isPremiumActive(info)) {
            useSubscriptionStore.getState().setTier('plus');
            return;
          }
        } catch (rcErr) {
          console.warn('[Subscription] RevenueCat unavailable:', rcErr);
        }

        // No VIP or RevenueCat match — ensure free tier
        useSubscriptionStore.getState().setTier('free');
      } catch (e) {
        console.warn('[Subscription] check failed:', e);
      }
    })();
  }, []);

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

  // Prewarm the top-5 genre searches so the very first tap on a genre tile
  // renders rows without spinning. Idempotent + best-effort; runs ~2s after
  // mount to avoid contending with the warm-WebView pool boot and the
  // initial home/discover fetches.
  useEffect(() => {
    const t = setTimeout(() => {
      void prewarmTopGenres({
        get: <T,>(path: string) => api.get<T>(path),
      });
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  // Expo Router often omits `(tabs)` from `useSegments()` (e.g. `['index']` on Home). Combine checks
  // so `miniPlayerBottom` stays `tabBarHeight` on tabs — otherwise it falls back to ~insets.bottom and
  // the mini strip covers the tab icons.
  const segs = segments as string[];
  const tabLeaf = segs[segs.length - 1] ?? '';
  const isKnownTabLeaf =
    tabLeaf === 'index' ||
    tabLeaf === 'search' ||
    tabLeaf === 'library' ||
    tabLeaf === 'discover' ||
    tabLeaf === 'profile' ||
    tabLeaf === 'social';
  const pathNorm = String(pathname ?? '/').replace(/\/$/, '') || '/';
  const isTabPath =
    pathNorm === '/' ||
    pathNorm === '/index' ||
    pathNorm === '/search' ||
    pathNorm === '/library' ||
    pathNorm === '/discover' ||
    pathNorm === '/profile' ||
    pathNorm === '/social';
  const isTabScreen = segs.includes('(tabs)') || isKnownTabLeaf || isTabPath;

  const miniPlayerBottom = isTabScreen
    ? Math.max(0, TAB_BAR_HEIGHT + insets.bottom - MINI_PLAYER_TAB_FLUSH_OVERLAP_PX)
    : Math.max(insets.bottom, 0);

  return (
    <BottomSheetModalProvider>
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000000' },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="nowPlaying"
          options={{
            presentation: 'transparentModal',
            animation: 'fade',
            headerShown: false,
            headerTransparent: true,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: 'transparent' },
            gestureEnabled: true,
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
          name="playlist-detail"
          options={{
            animation: 'slide_from_right',
            gestureEnabled: true,
            fullScreenGestureEnabled: true,
            headerShown: false,
            headerTransparent: true,
            contentStyle: { backgroundColor: '#000000' },
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
        {/* discover-onboarding disabled — users no longer walk through the
            genres/moods/artists setup. Feed renders from default seeds. */}
        <Stack.Screen
          name="vybe-originals"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="vybe-beats"
          options={{
            animation: 'slide_from_right',
          }}
        />
        <Stack.Screen
          name="vybe-mix"
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

      {/* Global mini player — floats above tab bar; zIndex ensures it stacks above (tabs) stack. */}
      {mountNowPlayingChrome ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            zIndex: 10050,
            elevation: 10050,
          }}
        >
          <NowPlayingSheet miniPlayerBottom={miniPlayerBottom} />
        </View>
      ) : null}

      {mountNowPlayingChrome ? (
        <View
          key={`mini-${currentTrack?.id ?? 'none'}-${playbackRevision}`}
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            zIndex: 9999,
            elevation: 9999,
          }}
        >
          <MiniPlayer bottomLift={miniPlayerBottom} />
        </View>
      ) : null}

      {/* Playback Debug Overlay - only visible when debug mode is enabled */}
      <PlaybackDebugOverlay />
      <PiPVideoOverlay />
      <ShadowPlaybackToast />
      <DavinciDynamicsOverlay />

      {/* Floating AirPlay pill — appears top-right while AirPlay is active so
          the user stays on their current screen (no forced full-screen player) */}
      <AirPlayPill />


      {/* Clipboard music link banner */}
      {clipboardUrl ? (
        <Animated.View
          style={[
            bannerStyle,
            {
              position: 'absolute',
              top: insets.top + 8,
              left: 16,
              right: 16,
              zIndex: 250000,
              elevation: 250000,
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
              backgroundColor: clipboardPlatform ? PLATFORM_META[clipboardPlatform].color : '#8B5CF6',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Text style={{ color: '#fff', fontSize: clipboardPlatform ? PLATFORM_META[clipboardPlatform].symbolSize : 13, fontWeight: '900' }}>
              {clipboardPlatform ? PLATFORM_META[clipboardPlatform].symbol : '♫'}
            </Text>
          </View>

          {/* Text */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
              {clipboardPlatform ? PLATFORM_META[clipboardPlatform].label : ''} link detected
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
      ) : null}
    </View>
    </BottomSheetModalProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
