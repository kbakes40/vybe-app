// Entry bootstrap — keep order: polyfill → better-auth stub (before auth-client) → reanimated → styles.
import 'react-native-get-random-values';
import '@/lib/auth/install-online-manager-stub';
import 'react-native-reanimated';
import '../../global.css';

// RevenueCat: loading this module runs `bootstrapPurchases()` (see purchases.ts); we also
// call `configurePurchases()` once on mount so the native singleton exists before any child tree runs.
import { configurePurchases } from '@/lib/purchases';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Appearance, Keyboard, LogBox, Platform } from 'react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { VybePopupProvider } from '@/components/VybePopup';
import { ShadowInputAccessory } from '@/components/ShadowInputAccessory';
import { DynamicIslandChrome } from '@/components/DynamicIslandChrome';
import { StealthTopMask } from '@/components/StealthTopMask';
import { DynamicIslandTopFade } from '@/components/DynamicIslandTopFade';
import { DynamicIsland } from '@/components/DynamicIsland';
import { ThemeArtworkAccentSync } from '@/components/ThemeArtworkAccentSync';
import { PillLockSync } from '@/components/PillLockSync';
import { LoginMorphOverlay } from '@/components/LoginMorphOverlay';
import { authClient } from '@/lib/auth/auth-client';
import { useKeyboardChromeStore } from '@/stores/keyboardChromeStore';
import { useThemeStore } from '@/stores/themeStore';

LogBox.ignoreLogs(['Expo AV has been deprecated', 'Disconnected from Metro']);

// Force dark mode globally
Appearance.setColorScheme('dark');
SystemUI.setBackgroundColorAsync('#000000');

export const unstable_settings = {
  /** `app/index.tsx` — routes signed-out → sign-in, signed-in → tabs or onboarding. */
  initialRouteName: 'index',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function GlobalKeyboardChrome() {
  useEffect(() => {
    if (Platform.OS === 'ios') {
      try {
        const K = Keyboard as unknown as { setKeyboardAppearance?: (a: 'light' | 'dark') => void };
        K.setKeyboardAppearance?.('dark');
      } catch {
        /* optional API — per-field keyboardAppearance still applies */
      }
    }
    const show = Keyboard.addListener('keyboardDidShow', () => {
      useKeyboardChromeStore.getState().setKeyboardVisible(true);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      useKeyboardChromeStore.getState().setKeyboardVisible(false);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return <ShadowInputAccessory />;
}

function RootLayoutNav() {
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Only treat the user as authenticated once we've confirmed they have a
  // real session. While the session check is in flight we render the auth
  // stack so first-time users (no stored session) land on the sign-in
  // screen immediately instead of briefly flashing the app stack.
  const isAuthenticated = !isPending && !!session?.user;

  // CRITICAL: Render ONLY auth stack OR app stack - never both
  // This prevents swipe-back from app to auth screens
  if (isAuthenticated) {
    // User is logged in — strict flow: optional onboarding (no back to auth) → (app)
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#000000' },
          animation: 'fade',
          gestureEnabled: false,
        }}
      >
        <Stack.Screen name="index" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen
          name="onboarding"
          options={{ gestureEnabled: false, animation: 'fade' }}
        />
        {/* Main app — gesture disabled so user cannot swipe back to onboarding/auth */}
        <Stack.Screen name="(app)" options={{ gestureEnabled: false }} />

        {/* Paywall - modal presentation (accessible when logged in) */}
        <Stack.Screen
          name="paywall"
          options={{
            headerShown: false,
            presentation: 'modal',
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />

        {/* Same screens as the auth stack — required so in-app navigation (e.g. Settings → Accounts → Add Account) can open sign-in while logged in. */}
        <Stack.Screen
          name="sign-in"
          options={{
            headerShown: false,
            presentation: 'modal',
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />
        <Stack.Screen
          name="verify-otp"
          options={{
            headerShown: false,
            presentation: 'modal',
            animation: 'slide_from_right',
            gestureEnabled: true,
          }}
        />

        {/* Legacy screens - keeping for compatibility */}
        <Stack.Screen name="modal" options={{ headerShown: false, presentation: 'modal' }} />
      </Stack>
    );
  }

  // User is NOT logged in - show ONLY auth routes (no app screens in stack)
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000000' },
        animation: 'fade',
        // Disable swipe-back gesture on ALL auth screens
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="index" options={{ gestureEnabled: false, animation: 'fade' }} />
      {/* Auth routes - gestures disabled */}
      <Stack.Screen
        name="sign-in"
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen
        name="verify-otp"
        options={{ gestureEnabled: false }}
      />

      {/* Onboarding - part of auth flow */}
      <Stack.Screen
        name="onboarding"
        options={{ gestureEnabled: false }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    configurePurchases();
  }, []);

  useEffect(() => {
    void useThemeStore.getState().hydrateTheme();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
          {/* SafeAreaProvider must wrap everything that calls useSafeAreaInsets
              (DynamicIsland, MiniPlayer, tab bar, etc). Without it, insets.top
              returns 0 and the DI pill renders behind the iPhone notch. */}
          <SafeAreaProvider>
            <KeyboardProvider>
              <VybePopupProvider>
                <GlobalKeyboardChrome />
                <StatusBar style="light" translucent backgroundColor="transparent" />
                {/* AUTH_LOCK_SYNC: PillLockSync runs first so `pillLockStore.hasUser` is set before app chrome (MiniPlayer, top masks, Island). */}
                <PillLockSync />
                <RootLayoutNav />
                <ThemeArtworkAccentSync />
                <StealthTopMask />
                <DynamicIslandTopFade />
                <DynamicIslandChrome />
                <DynamicIsland />
                <LoginMorphOverlay />
              </VybePopupProvider>
            </KeyboardProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
