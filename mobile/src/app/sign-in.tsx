import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  AppState,
  StyleSheet,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import { VybeTextInput } from '@/components/VybeTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Mail, ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  Easing,
  useAnimatedStyle,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { authClient } from '@/lib/auth/auth-client';
import { persistSessionBearerFromAuthResult } from '@/lib/auth/sessionBearer';
import { getPostAuthDestination } from '@/lib/auth/postAuthDestination';
import { VybeIcon } from '@/components/VybeIcon';
import { useVybePopup } from '@/components/VybePopup';
import { usePostLoginWelcomeStore } from '@/stores/postLoginWelcomeStore';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useLoginMorphStore } from '@/stores/loginMorphStore';
import { DOCK_CYAN, OLED_BLACK as THEME_OLED_BLACK } from '@/constants/machinedTheme';

function GoogleGlyph({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_IOS_CLIENT_ID =
  '405236221156-rg9n0cquvqrh7rcg7nrbmgc20i46kgpn.apps.googleusercontent.com';

type AuthView = 'main' | 'email';

type LoadingProvider = 'apple' | 'google' | 'email' | 'sendCode' | null;
type SnakeMode = 'idle' | 'busy' | 'success';

const LOGO_GLOW_CYAN = '#00E5FF';
const OLED_BLACK = THEME_OLED_BLACK;
/** Semi-transparent login tiles (Apple / Google / Email). */
const LOGIN_TILE_BG = 'rgba(255,255,255,0.05)';
const LOGIN_TILE_BORDER = 'rgba(255,255,255,0.1)';
/** Matches `loginTile` / `borderRadius: 12` so the snake hugs the same box curve. */
const LOGIN_TILE_CORNER_RADIUS_PT = 12;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One clockwise rounded-rect outline (same geometry as each login tile border). */
function roundedRectOutlineD(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(Math.max(0, r), w / 2, h / 2);
  if (w <= 2 || h <= 2) return '';
  return [
    `M${x + rr},${y}`,
    `H${x + w - rr}`,
    `A${rr},${rr},0,0,1,${x + w},${y + rr}`,
    `V${y + h - rr}`,
    `A${rr},${rr},0,0,1,${x + w - rr},${y + h}`,
    `H${x + rr}`,
    `A${rr},${rr},0,0,1,${x},${y + h - rr}`,
    `V${y + rr}`,
    `A${rr},${rr},0,0,1,${x + rr},${y}`,
    'Z',
  ].join('');
}

function roundedRectOutlineLength(w: number, h: number, r: number): number {
  const rr = Math.min(Math.max(0, r), w / 2, h / 2);
  return 2 * (w - 2 * rr) + 2 * (h - 2 * rr) + 2 * Math.PI * rr;
}

/**
 * Three separate rounded rectangles (Apple → Google → Email) in one SVG path.
 * The dash animates along each box edge in order — like the old single-tile rings, chained.
 */
function buildThreeRoundedBoxSnakePath(
  clusterW: number,
  rowLayouts: { y: number; height: number }[],
  cornerRadius: number,
  strokeInset: number,
): { d: string; length: number } | null {
  if (clusterW <= 24 || rowLayouts.length < 3) return null;
  const innerW = Math.max(8, clusterW - 2 * strokeInset);
  const ix = strokeInset;

  let d = '';
  let length = 0;
  for (let i = 0; i < 3; i++) {
    const { y, height } = rowLayouts[i];
    if (height < 8) return null;
    d += roundedRectOutlineD(ix, y, innerW, height, cornerRadius);
    length += roundedRectOutlineLength(innerW, height, cornerRadius);
  }
  return { d, length: Math.max(80, length) };
}

function ProviderSnakeTrack({
  width,
  height,
  pathD,
  pathLength,
  mode,
}: {
  width: number;
  height: number;
  pathD: string;
  pathLength: number;
  mode: SnakeMode;
}) {
  const dashOffset = useSharedValue(0);
  const strokeW = useSharedValue(2);

  useEffect(() => {
    cancelAnimation(dashOffset);
    cancelAnimation(strokeW);
    if (width <= 0 || pathLength <= 0) return;

    if (mode === 'success') {
      strokeW.value = withSequence(
        withTiming(4, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(2, { duration: 400 }),
      );
      dashOffset.value = 0;
      const successMs = Math.min(2300, Math.max(780, pathLength * 0.95));
      dashOffset.value = withTiming(pathLength, { duration: successMs, easing: Easing.out(Easing.cubic) });
      return;
    }

    /** Lap duration — higher = slower snake. */
    const dur = mode === 'busy'
      ? Math.min(11500, Math.max(2700, pathLength * 1.22))
      : Math.min(20000, Math.max(4600, pathLength * 1.78));
    dashOffset.value = 0;
    dashOffset.value = withRepeat(
      withTiming(pathLength, { duration: dur, easing: Easing.linear }),
      -1,
      false,
    );
    strokeW.value = withTiming(mode === 'busy' ? 3 : 2, { duration: 220 });
  }, [mode, pathLength, width, dashOffset, strokeW]);

  const ap = useAnimatedProps(() => ({
    strokeDashoffset: -dashOffset.value,
    strokeWidth: strokeW.value,
  }));

  const headFrac = 0.14;
  const dashGap = `${pathLength * headFrac} ${pathLength * (1 - headFrac)}`;

  if (width <= 0 || height <= 0 || !pathD) return null;

  return (
    <Svg
      width={width}
      height={height}
      style={[StyleSheet.absoluteFillObject, { zIndex: 3 }]}
      pointerEvents="none"
    >
      <AnimatedPath
        d={pathD}
        fill="none"
        stroke={mode === 'success' ? '#7DF9FF' : LOGO_GLOW_CYAN}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dashGap}
        animatedProps={ap}
      />
    </Svg>
  );
}

function ProviderSignInButton({
  label,
  disabled,
  onPress,
  onRowLayout,
  children,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
  onRowLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <View style={signStyles.providerWrap} onLayout={onRowLayout}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          signStyles.loginTile,
          disabled && signStyles.authBtnDisabled,
          pressed && !disabled && signStyles.loginTilePressed,
        ]}
      >
        <View style={signStyles.authBtnInner}>
          <View style={signStyles.iconSlot}>{children}</View>
          <Text style={signStyles.btnTextPrimary}>{label}</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Continuous cyan pulse behind mark — +20% vs prior glow strength/spread. */
function LogoPulse({ children }: { children: React.ReactNode }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [pulse]);
  const anim = useAnimatedStyle(() => {
    const s = 1 + 0.04 * pulse.value;
    const glow = (0.28 + 0.42 * pulse.value) * 1.2;
    const spread = (12 + 16 * pulse.value) * 1.2;
    return {
      transform: [{ scale: s }],
      shadowOpacity: Math.min(1, glow),
      shadowRadius: spread,
    };
  });
  return (
    <Animated.View
      style={[
        {
          shadowColor: LOGO_GLOW_CYAN,
          shadowOffset: { width: 0, height: 0 },
        },
        Platform.OS === 'android' ? { elevation: 8 } : null,
        anim,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const [view, setView] = useState<AuthView>('main');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  /** Which provider is active — drives HUD ring + disabled siblings without blocking email sub-view `isLoading`. */
  const [activeProvider, setActiveProvider] = useState<LoadingProvider>(null);
  const [loginSuccessPhase, setLoginSuccessPhase] = useState(false);
  /** Row layouts relative to the snake cluster (Apple, Google, Email). */
  const [snakeRows, setSnakeRows] = useState([{ y: 0, height: 0 }, { y: 0, height: 0 }, { y: 0, height: 0 }]);
  const [snakeClusterW, setSnakeClusterW] = useState(0);
  const [snakeClusterH, setSnakeClusterH] = useState(0);
  const browserOpenRef = useRef(false);
  const logoRef = useRef<View>(null);
  const successScale = useSharedValue(1);
  const burstOpacity = useSharedValue(0);

  const authSurfaceBusy = isLoading || activeProvider !== null;
  const snakeModeResolved: SnakeMode = loginSuccessPhase ? 'success' : authSurfaceBusy ? 'busy' : 'idle';

  const onSnakeClusterLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSnakeClusterW(width);
    setSnakeClusterH(height);
  }, []);

  const onSnakeRowLayout = useCallback((index: 0 | 1 | 2) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    setSnakeRows((prev) => {
      const next = [...prev];
      next[index] = { y, height };
      return next;
    });
  }, []);

  const snakePath = (() => {
    if (snakeClusterW < 40) return null;
    if (!snakeRows.every((r) => r.height > 10)) return null;
    return buildThreeRoundedBoxSnakePath(
      snakeClusterW,
      snakeRows,
      LOGIN_TILE_CORNER_RADIUS_PT,
      1,
    );
  })();

  const logoSuccessStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
  }));

  const burstAnimStyle = useAnimatedStyle(() => ({
    opacity: burstOpacity.value,
  }));

  const runCelebrationThen = async (go: () => Promise<void>) => {
    setLoginSuccessPhase(true);
    successScale.value = withSequence(
      withTiming(1.07, { duration: 240, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }),
    );
    burstOpacity.value = withSequence(
      withTiming(0.28, { duration: 160, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 480 }),
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await new Promise<void>((r) => setTimeout(r, 680));
    await go();
  };

  const [_googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    scopes: ['openid', 'email', 'profile'],
  });

  /**
   * Dev-only bypass: when `EXPO_PUBLIC_DEV_VAULT_ENTRY=1`, skip the sign-in chrome
   * and drop into `/onboarding` so the standard onboarding → tabs flow still runs
   * (previously jumped straight to tabs and skipped onboarding entirely).
   * Never ship to production stores.
   */
  useEffect(() => {
    if (!__DEV__) return;
    if (process.env.EXPO_PUBLIC_DEV_VAULT_ENTRY !== '1') return;
    const id = requestAnimationFrame(() => {
      void getPostAuthDestination().then((dest) => router.replace(dest));
    });
    return () => cancelAnimationFrame(id);
  }, [router]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && browserOpenRef.current) {
        browserOpenRef.current = false;
        setActiveProvider(null);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken =
        (googleResponse as { authentication?: { idToken?: string } })?.authentication?.idToken ??
        (googleResponse as { params?: { id_token?: string } })?.params?.id_token;
      if (idToken) {
        void handleGoogleToken(idToken);
      } else {
        setActiveProvider(null);
        browserOpenRef.current = false;
      }
    } else if (googleResponse?.type === 'error' || googleResponse?.type === 'dismiss') {
      setActiveProvider(null);
      browserOpenRef.current = false;
    }
  }, [googleResponse]);

  const replaceWithOptionalMorph = (href: '/(app)/(tabs)/discover' | '/(app)/upgrade' | '/onboarding') => {
    if (href === '/(app)/(tabs)/discover' && logoRef.current) {
      logoRef.current.measureInWindow((x, y, w, h) => {
        const { width: sw, height: sh } = Dimensions.get('window');
        useLoginMorphStore.getState().start({
          fromX: x,
          fromY: y,
          fromW: w,
          fromH: h,
          screenW: sw,
          screenH: sh,
          insetBottom: insets.bottom,
        });
        requestAnimationFrame(() => {
          router.replace(href);
        });
      });
      return;
    }
    router.replace(href);
  };

  /** Success path: `getPostAuthDestination()` resolves to MainTabs (`/(app)/(tabs)/…`, usually discover). */
  const navigateAfterAuth = async () => {
    usePostLoginWelcomeStore.getState().queueEnjoyVibes();
    if (router.canDismiss()) {
      router.dismissAll();
    }
    const dest = await getPostAuthDestination();
    replaceWithOptionalMorph(dest);
  };

  const handleGoogleToken = async (idToken: string) => {
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        idToken: { token: idToken },
      });
      if (result.error) throw new Error(result.error.message);
      await persistSessionBearerFromAuthResult(result);
      await runCelebrationThen(navigateAfterAuth);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to sign in with Google. Please try again.';
      showVybePopup({
        title: 'Sign In Failed',
        message,
        type: 'error',
      });
    } finally {
      setActiveProvider(null);
      browserOpenRef.current = false;
    }
  };

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);
    }
  }, []);

  /** Native ASAuthorization flow — used by `AppleAuthenticationButton` and the non-native fallback. */
  const runAppleCredentialExchange = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (Platform.OS !== 'ios') {
      showVybePopup({
        title: 'Not Available',
        message: 'Apple Sign In is only available on iOS devices.',
        type: 'info',
      });
      return;
    }

    if (!isAppleAvailable) {
      showVybePopup({
        title: 'Not Available',
        message: 'Apple Sign In requires a native build. Please use Email or Google sign in for now.',
        type: 'info',
      });
      return;
    }

    setActiveProvider('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        showVybePopup({
          title: 'Apple Sign-In',
          message: 'No identity token — the credential did not include an identity token.',
          type: 'warning',
          visualTone: 'vybe',
        });
        return;
      }

      const result = await authClient.signIn.social({
        provider: 'apple',
        idToken: { token: credential.identityToken },
      });
      if (result.error) {
        const serverMsg = result.error.message ?? JSON.stringify(result.error);
        showVybePopup({
          title: 'Apple Sign-In',
          message: `Better Auth error:\n\n${serverMsg}`,
          type: 'error',
          visualTone: 'vybe',
        });
        throw new Error(serverMsg);
      }
      await persistSessionBearerFromAuthResult(result);
      await runCelebrationThen(navigateAfterAuth);
    } catch (error: unknown) {
      const e = error as {
        code?: string;
        message?: string;
        nativeErrorCode?: string | number;
      };
      const code = String(e?.code ?? e?.nativeErrorCode ?? 'UNKNOWN');
      if (code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      const msg = e?.message ?? (error instanceof Error ? error.message : String(error));
      showVybePopup({
        title: 'Sign In Failed',
        message:
          __DEV__ && code !== 'UNKNOWN'
            ? `code: ${code}\n\n${msg || 'Failed to sign in with Apple. Please try again.'}`
            : msg || 'Failed to sign in with Apple. Please try again.',
        type: 'error',
        visualTone: 'vybe',
      });
    } finally {
      setActiveProvider(null);
    }
  };

  const handleAppleSignIn = () => {
    void runAppleCredentialExchange();
  };

  const handleGoogleSignIn = async () => {
    if (authSurfaceBusy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveProvider('google');
    browserOpenRef.current = true;
    try {
      await promptGoogleAsync();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to start Google sign in.';
      showVybePopup({
        title: 'Sign In Failed',
        message,
        type: 'error',
      });
      setActiveProvider(null);
      browserOpenRef.current = false;
    }
  };

  const handleEmailContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setView('email');
  };

  const handleSendCode = async () => {
    if (!email || !email.includes('@')) {
      showVybePopup({
        title: 'Invalid Email',
        message: 'Please enter a valid email address.',
        type: 'warning',
      });
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
      if (result?.error) {
        console.error('[sign-in] sendVerificationOtp error', result.error);
        showVybePopup({
          title: 'Could not send code',
          message:
            result.error.message ||
            `Server error${result.error.status ? ` (${result.error.status})` : ''}. Try Apple or Google sign-in while we fix this.`,
          type: 'error',
        });
        return;
      }
      router.push({ pathname: '/verify-otp', params: { email } });
    } catch (error: unknown) {
      console.error('[sign-in] sendVerificationOtp threw', error);
      const message = error instanceof Error ? error.message : 'Failed to send verification code. Please try again.';
      showVybePopup({
        title: 'Error',
        message,
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setView('main');
    setEmail('');
    setIsLoading(false);
    browserOpenRef.current = false;
  };

  return (
    <View style={signStyles.screen}>
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          { zIndex: 5, backgroundColor: LOGO_GLOW_CYAN },
          burstAnimStyle,
        ]}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[signStyles.flex, { backgroundColor: OLED_BLACK }]}
      >
        <View style={[signStyles.safeTop, { paddingTop: insets.top }]}>
          {view === 'email' ? (
            <Animated.View entering={SlideInRight.duration(300)} exiting={SlideOutLeft.duration(300)} style={signStyles.flex}>
              <Pressable onPress={handleBack} style={signStyles.backRow}>
                <ChevronLeft size={24} color="#F4F4F5" />
                <Text style={signStyles.backText}>Back</Text>
              </Pressable>

              <View style={signStyles.emailBody}>
                <Text style={signStyles.emailTitle}>Enter your email</Text>
                <Text style={signStyles.emailHint}>We will send a one-time code. No spam.</Text>

                <View style={signStyles.glassField}>
                  <VybeTextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@domain.com"
                    placeholderTextColor="rgba(244,244,245,0.35)"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    style={signStyles.emailInput}
                  />
                </View>

                <Pressable
                  onPress={handleSendCode}
                  disabled={isLoading || !email}
                  style={({ pressed }) => [
                    signStyles.sendBtn,
                    (!email || isLoading) && signStyles.sendBtnDisabled,
                    pressed && email && !isLoading && signStyles.sendBtnPressed,
                  ]}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#0A0A0A" />
                  ) : (
                    <Text style={signStyles.sendBtnText}>Send code</Text>
                  )}
                </Pressable>
              </View>
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)} style={signStyles.flex}>
              <View style={signStyles.hero}>
                <Animated.View style={logoSuccessStyle}>
                  <LogoPulse>
                    <View ref={logoRef} collapsable={false} style={signStyles.logoMeasure}>
                      <VybeIcon size={108} variant="primary" />
                    </View>
                  </LogoPulse>
                </Animated.View>
                <Text style={signStyles.wordmark}>VYBE</Text>
                <Text style={signStyles.tagline}>break the loop</Text>
              </View>

              <View style={[signStyles.actions, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
                <View style={signStyles.snakeCluster} onLayout={onSnakeClusterLayout}>
                  {snakePath && snakeClusterH > 20 ? (
                    <ProviderSnakeTrack
                      width={snakeClusterW}
                      height={snakeClusterH}
                      pathD={snakePath.d}
                      pathLength={snakePath.length}
                      mode={snakeModeResolved}
                    />
                  ) : null}
                <ProviderSignInButton
                  label="Continue with Apple"
                  disabled={authSurfaceBusy && activeProvider !== 'apple'}
                  onPress={handleAppleSignIn}
                  onRowLayout={onSnakeRowLayout(0)}
                >
                  <Text style={signStyles.appleGlyph}>{'\uF8FF'}</Text>
                </ProviderSignInButton>

                <ProviderSignInButton
                  label="Continue with Google"
                  disabled={authSurfaceBusy && activeProvider !== 'google'}
                  onPress={() => void handleGoogleSignIn()}
                  onRowLayout={onSnakeRowLayout(1)}
                >
                  {activeProvider === 'google' ? (
                    <ActivityIndicator color={DOCK_CYAN} size="small" />
                  ) : (
                    <GoogleGlyph size={17} />
                  )}
                </ProviderSignInButton>

                <ProviderSignInButton
                  label="Continue with Email"
                  disabled={authSurfaceBusy}
                  onPress={handleEmailContinue}
                  onRowLayout={onSnakeRowLayout(2)}
                >
                  <Mail size={20} color="#F4F4F5" strokeWidth={1.75} />
                </ProviderSignInButton>
                </View>

                <View style={signStyles.footerSpacer} />

                <Text style={signStyles.davinciFooter} pointerEvents="none">
                  SYSTEM POWERED BY DAVINCI DYNAMICS.
                </Text>
              </View>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const signStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: OLED_BLACK,
  },
  flex: { flex: 1 },
  safeTop: {
    flex: 1,
    backgroundColor: OLED_BLACK,
  },
  logoMeasure: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backText: {
    color: '#F4F4F5',
    fontSize: 16,
    marginLeft: 4,
    fontWeight: '500',
  },
  emailBody: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
  },
  emailTitle: {
    color: '#FAFAFA',
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  emailHint: {
    color: 'rgba(244,244,245,0.85)',
    fontSize: 15,
    marginBottom: 28,
    lineHeight: 21,
  },
  glassField: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  emailInput: {
    fontSize: 17,
    color: '#F4F4F5',
    padding: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  sendBtn: {
    borderRadius: 6,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E4E4E7',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnPressed: {
    opacity: 0.88,
  },
  sendBtnText: {
    color: '#0A0A0A',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  wordmark: {
    marginTop: 28,
    color: '#FAFAFA',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 6,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0,229,255,0.4)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
      },
      default: {},
    }),
  },
  tagline: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '300',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  actions: {
    paddingHorizontal: 28,
    width: '100%',
  },
  snakeCluster: {
    position: 'relative',
    width: '100%',
    zIndex: 1,
  },
  footerSpacer: {
    flexGrow: 1,
    minHeight: 12,
    width: '100%',
  },
  appleGlyph: {
    fontSize: 22,
    color: '#F4F4F5',
    fontWeight: '400',
  },
  providerWrap: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    marginBottom: 12,
    position: 'relative',
    zIndex: 4,
  },
  authBtnDisabled: {
    opacity: 0.45,
  },
  iconSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  loginTile: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    marginBottom: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: LOGIN_TILE_BG,
    borderWidth: 1,
    borderColor: LOGIN_TILE_BORDER,
  },
  loginTilePressed: {
    opacity: 0.92,
  },
  authBtnBusy: {
    opacity: 0.45,
  },
  authBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 18,
    minHeight: 52,
  },
  btnTextPrimary: {
    color: '#F4F4F5',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  davinciFooter: {
    marginTop: 4,
    paddingBottom: 4,
    textAlign: 'center',
    color: DOCK_CYAN,
    fontSize: 9,
    fontWeight: '300',
    letterSpacing: 1.1,
    opacity: 0.75,
  },
});
