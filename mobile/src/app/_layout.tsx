import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { View, ActivityIndicator, Appearance } from 'react-native';
import { useSession } from '@/lib/auth/use-session';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { VybePopupProvider } from '@/components/VybePopup';

// Force dark mode globally
Appearance.setColorScheme('dark');
SystemUI.setBackgroundColorAsync('#0A0A0A');

export const unstable_settings = {
  initialRouteName: 'sign-in',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function LoadingScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#8B5CF6" />
    </View>
  );
}

function RootLayoutNav() {
  const { data: session, isPending, error } = useSession();
  const [timedOut, setTimedOut] = useState(false);

  // Add timeout to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      setTimedOut(true);
    }, 3000);
    return () => clearTimeout(timeout);
  }, []);

  // Hide splash screen when session is loaded, errored, or timed out
  const shouldProceed = !isPending || error || timedOut;

  useEffect(() => {
    if (shouldProceed) {
      SplashScreen.hideAsync();
    }
  }, [shouldProceed]);

  if (!shouldProceed) {
    return <LoadingScreen />;
  }

  // Determine if user is authenticated
  const isAuthenticated = true; // Temporarily disabled for testing

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
        }}
      >
        {/* Main app routes */}
        <Stack.Screen name="(app)" />

        {/* Paywall - modal presentation (accessible when logged in) */}
        <Stack.Screen
          name="paywall"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
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
            </VybePopupProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
