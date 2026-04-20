// Entry bootstrap — keep order: polyfill → better-auth stub (before auth-client) → reanimated → styles.
import 'react-native-get-random-values';
import '@/lib/auth/install-online-manager-stub';
import 'react-native-reanimated';
import '../../global.css';

// RevenueCat: loading this module runs `bootstrapPurchases()` (see purchases.ts); we also
// call `configurePurchases()` once on mount so the native singleton exists before any child tree runs.
import { configurePurchases } from '@/lib/purchases';
import { useEffect, useRef, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Appearance, AppState, Keyboard, LogBox, Platform, View } from 'react-native';
import { useKeyboardChromeStore } from '@/stores/keyboardChromeStore';
import { ErrorBoundary, InlineErrorBoundary } from '@/components/ErrorBoundary';

export { ErrorBoundary };
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

    const setShown = () => useKeyboardChromeStore.getState().setKeyboardVisible(true);
    const setHidden = () => useKeyboardChromeStore.getState().setKeyboardVisible(false);

    const show = Keyboard.addListener('keyboardDidShow', setShown);
    const hideDid = Keyboard.addListener('keyboardDidHide', setHidden);
    // iOS: willHide fires in more dismiss paths than didHide (focus changes, interactive dismiss).
    const hideWill =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillHide', setHidden)
        : null;

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        requestAnimationFrame(() => {
          if (!Keyboard.isVisible()) setHidden();
        });
      }
    });

    return () => {
      show.remove();
      hideDid.remove();
      hideWill?.remove();
      appSub.remove();
    };
  }, []);

  return <ShadowInputAccessory />;
}

function RootLayoutNav() {
  const { data: session } = authClient.useSession();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Real session drives the stack — bypass restored after mount diagnosis.
  const isAuthenticated = Boolean(session?.user);

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
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
        {/* SafeAreaProvider must wrap everything that calls useSafeAreaInsets
            (DynamicIsland, MiniPlayer, tab bar, etc). Without it, insets.top
            returns 0 and the DI pill renders behind the iPhone notch. */}
        <SafeAreaProvider>
          <KeyboardProvider>
            <VybePopupProvider>
              <GlobalKeyboardChrome />
              {/* OLED_ROOT_FIX — `backgroundColor` prop is Android-only and can
                  glitch on iOS 15 Pro Max (visible grey bar above the pill).
                  Translucent + light style is enough; root View owns the black. */}
              <StatusBar style="light" translucent />
              {/* AUTH_LOCK_SYNC: PillLockSync runs first so `pillLockStore.hasUser` is set before app chrome (MiniPlayer, top masks, Island). */}
              <InlineErrorBoundary fallback={null}>
                <PillLockSync />
              </InlineErrorBoundary>
              {/* Full-screen fallback only for route/navigation tree — not for floating chrome (Island can throw while native audio keeps playing). */}
              <ErrorBoundary>
                <RootLayoutNav />
              </ErrorBoundary>
              <InlineErrorBoundary fallback={null}>
                <ThemeArtworkAccentSync />
              </InlineErrorBoundary>
              <InlineErrorBoundary fallback={null}>
                <StealthTopMask />
              </InlineErrorBoundary>
              <InlineErrorBoundary fallback={null}>
                <DynamicIslandTopFade />
              </InlineErrorBoundary>
              <InlineErrorBoundary fallback={null}>
                <DynamicIslandChrome />
              </InlineErrorBoundary>
              <InlineErrorBoundary fallback={null}>
                <DynamicIsland />
              </InlineErrorBoundary>
              <InlineErrorBoundary fallback={null}>
                <LoginMorphOverlay />
              </InlineErrorBoundary>
            </VybePopupProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
