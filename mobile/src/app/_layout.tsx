import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Appearance } from 'react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { VybePopupProvider } from '@/components/VybePopup';
import { FlyAnimationOverlay } from '@/components/FlyAnimationOverlay';
import { authClient } from '@/lib/auth/auth-client';

// Force dark mode globally
Appearance.setColorScheme('dark');
SystemUI.setBackgroundColorAsync('#0A0A0A');

export const unstable_settings = {
  initialRouteName: 'sign-in',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

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
    // User is logged in - show ONLY app routes (no auth screens in stack)
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0A0A0A' },
          animation: 'fade',
          gestureEnabled: false,
        }}
      >
        {/* Main app routes — gesture disabled so user can never swipe back to auth */}
        <Stack.Screen name="(app)" options={{ gestureEnabled: false }} />

        {/* Paywall - modal presentation (accessible when logged in) */}
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            gestureEnabled: true,
          }}
        />

        {/* Legacy screens - keeping for compatibility */}
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    );
  }

  // User is NOT logged in - show ONLY auth routes (no app screens in stack)
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0A0A' },
        animation: 'fade',
        // Disable swipe-back gesture on ALL auth screens
        gestureEnabled: false,
      }}
    >
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
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
          <KeyboardProvider>
            <VybePopupProvider>
              <StatusBar style="light" backgroundColor="transparent" translucent />
              <RootLayoutNav />
              <FlyAnimationOverlay />
            </VybePopupProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
