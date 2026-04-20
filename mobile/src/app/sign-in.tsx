import React, { useState, useEffect, useRef } from 'react';
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
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
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
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { authClient } from '@/lib/auth/auth-client';
import { persistSessionBearerFromAuthResult } from '@/lib/auth/sessionBearer';
import { getPostAuthDestination } from '@/lib/auth/postAuthDestination';
import { api } from '@/lib/api/api';
import { VybeIcon } from '@/components/VybeIcon';
import { useVybePopup } from '@/components/VybePopup';
import { usePostLoginWelcomeStore } from '@/stores/postLoginWelcomeStore';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path } from 'react-native-svg';
import { useLoginMorphStore } from '@/stores/loginMorphStore';

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

/** Continuous amber “heat” pulse — scale + luminous shadow (no literal flame art). */
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
    const glow = 0.28 + 0.42 * pulse.value;
    return {
      transform: [{ scale: s }],
      shadowOpacity: glow,
      shadowRadius: 12 + 16 * pulse.value,
    };
  });
  return (
    <Animated.View
      style={[
        {
          shadowColor: '#F59E0B',
          shadowOffset: { width: 0, height: 0 },
        },
        Platform.OS === 'android' ? { elevation: 6 } : null,
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
  const browserOpenRef = useRef(false);
  const logoRef = useRef<View>(null);

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
        setIsLoading(false);
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
        setIsLoading(false);
        browserOpenRef.current = false;
      }
    } else if (googleResponse?.type === 'error' || googleResponse?.type === 'dismiss') {
      setIsLoading(false);
      browserOpenRef.current = false;
    }
  }, [googleResponse]);

  const replaceWithOptionalMorph = (href: '/(app)/(tabs)' | '/(app)/upgrade' | '/onboarding') => {
    if (href === '/(app)/(tabs)' && logoRef.current) {
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await navigateAfterAuth();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to sign in with Google. Please try again.';
      showVybePopup({
        title: 'Sign In Failed',
        message,
        type: 'error',
      });
    } finally {
      setIsLoading(false);
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

    setIsLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        Alert.alert(
          'Apple Sign-In',
          'code: NO_IDENTITY_TOKEN\nThe credential did not include an identity token.',
        );
        return;
      }

      const result = await authClient.signIn.social({
        provider: 'apple',
        idToken: { token: credential.identityToken },
      });
      if (result.error) {
        const serverMsg = result.error.message ?? JSON.stringify(result.error);
        Alert.alert('Apple Sign-In', `Better Auth error:\n${serverMsg}`);
        throw new Error(serverMsg);
      }
      await persistSessionBearerFromAuthResult(result);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await navigateAfterAuth();
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
      Alert.alert('Apple Sign-In (debug)', `code: ${code}\n\n${msg}`);
      showVybePopup({
        title: 'Sign In Failed',
        message: msg || 'Failed to sign in with Apple. Please try again.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignIn = () => {
    void runAppleCredentialExchange();
  };

  const handleGoogleSignIn = async () => {
    if (isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
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
      setIsLoading(false);
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

  const handleGuestLogin = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsLoading(true);
    try {
      const result = await api.post<{ user: { id: string }; isGuest: boolean }>('/api/user/guest', {});
      if (result?.isGuest) router.replace('/onboarding');
    } catch {
      showVybePopup({
        title: 'Error',
        message: 'Failed to continue as guest. Please try again.',
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={signStyles.flex}
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
                <LogoPulse>
                  <View ref={logoRef} collapsable={false} style={signStyles.logoMeasure}>
                    <VybeIcon size={108} variant="primary" />
                  </View>
                </LogoPulse>
                <Text style={signStyles.wordmark}>VYBE</Text>
                <Text style={signStyles.tagline}>break the loop</Text>
              </View>

              <View style={[signStyles.actions, { paddingBottom: insets.bottom + 28 }]}>
                {Platform.OS === 'ios' && isAppleAvailable ? (
                  <View style={[signStyles.appleNativeWrap, isLoading && signStyles.appleNativeBusy]}>
                    <AppleAuthenticationButton
                      buttonType={AppleAuthenticationButtonType.CONTINUE}
                      buttonStyle={AppleAuthenticationButtonStyle.BLACK}
                      cornerRadius={8}
                      style={signStyles.appleNativeBtn}
                      onPress={handleAppleSignIn}
                    />
                  </View>
                ) : (
                  <Pressable
                    onPress={handleAppleSignIn}
                    disabled={isLoading}
                    style={({ pressed }) => [pressed && signStyles.btnPressed]}
                  >
                    <BlurView intensity={22} tint="dark" style={signStyles.btnBlurDark}>
                      <View style={[signStyles.btnBlurInnerRow, { transform: [{ translateX: -4 }] }]}>
                        <Text style={[signStyles.appleGlyph, signStyles.appleGlyphEmber]}>{'\uF8FF'}</Text>
                        <Text style={[signStyles.btnTextEmber, { marginLeft: 10 }]}>Continue with Apple</Text>
                      </View>
                    </BlurView>
                  </Pressable>
                )}

                <Pressable
                  onPress={handleGoogleSignIn}
                  disabled={isLoading}
                  style={({ pressed }) => [pressed && signStyles.btnPressed]}
                >
                  <BlurView intensity={22} tint="dark" style={signStyles.btnBlurDark}>
                    <View style={signStyles.btnBlurInnerRow}>
                      {isLoading ? (
                        <ActivityIndicator color="#FEF3C7" size="small" />
                      ) : (
                        <>
                          <GoogleGlyph size={17} />
                          <Text style={[signStyles.btnTextEmber, { marginLeft: 10 }]}>Continue with Google</Text>
                        </>
                      )}
                    </View>
                  </BlurView>
                </Pressable>

                <Pressable
                  onPress={handleEmailContinue}
                  style={({ pressed }) => [pressed && signStyles.btnPressed]}
                >
                  <BlurView intensity={22} tint="dark" style={signStyles.btnBlurDark}>
                    <View style={signStyles.btnBlurInnerRow}>
                      <Mail size={20} color="#FDE68A" strokeWidth={1.75} />
                      <Text style={[signStyles.btnTextEmber, { marginLeft: 10 }]}>Continue with Email</Text>
                    </View>
                  </BlurView>
                </Pressable>

                <Pressable onPress={handleGuestLogin} disabled={isLoading} style={signStyles.guest}>
                  <Text style={signStyles.guestText}>Continue as guest</Text>
                </Pressable>

                <Text style={signStyles.davinciFooter} pointerEvents="none">
                  SYSTEM POWERD_BY_DAVINCI DYNAMICS.
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
    backgroundColor: '#000000',
  },
  flex: { flex: 1 },
  safeTop: {
    flex: 1,
    backgroundColor: '#000000',
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
    color: 'rgba(244,244,245,0.45)',
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
  },
  tagline: {
    marginTop: 10,
    color: 'rgba(253,230,138,0.55)',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  actions: {
    paddingHorizontal: 28,
  },
  appleNativeWrap: {
    marginBottom: 12,
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    borderRadius: 9,
    overflow: 'hidden',
  },
  appleNativeBusy: {
    opacity: 0.45,
    pointerEvents: 'none',
  },
  appleNativeBtn: {
    width: '100%',
    height: 48,
  },
  btnBlurDark: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  btnBlurInnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  btnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  btnTextEmber: {
    color: '#FFFBEB',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  appleGlyph: {
    fontSize: 22,
    marginRight: 10,
    color: '#0A0A0A',
  },
  appleGlyphEmber: {
    color: '#FFFBEB',
  },
  guest: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  guestText: {
    color: 'rgba(244,244,245,0.38)',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  davinciFooter: {
    marginTop: 8,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.16)',
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 1.2,
  },
});
