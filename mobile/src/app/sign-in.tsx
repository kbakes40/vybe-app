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
import { api } from '@/lib/api/api';
import { VybeIcon } from '@/components/VybeIcon';
import { useVybePopup } from '@/components/VybePopup';
import { useUpgradePromptStore } from '@/stores/upgradePromptStore';
import { usePostLoginWelcomeStore } from '@/stores/postLoginWelcomeStore';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

// Google OAuth — the dedicated Expo Google provider handles the iOS reversed-
// client-id redirect URI format automatically, so we don't have to build it
// ourselves. This is the real iOS client from Google Cloud Console (Vybe
// project, team FCXP585VH2), registered under bundle com.vibecode.vybe.
// Hardcoded so a stale EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in .env can't silently
// override it with the wrong client. The backend's auth.ts google.clientId
// MUST match this value — Better Auth verifies it against the `aud` claim.
const GOOGLE_IOS_CLIENT_ID =
  '405236221156-rg9n0cquvqrh7rcg7nrbmgc20i46kgpn.apps.googleusercontent.com';

interface UserPreferences {
  onboardingDone: boolean;
}

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
  const hasSeenPrompt = useUpgradePromptStore((s) => s.hasSeenPrompt);
  const browserOpenRef = useRef(false);

  // Google auth request — Expo's dedicated Google provider builds the correct
  // iOS redirect URI (com.googleusercontent.apps.CLIENTID:/oauthredirect)
  // automatically. Using the idToken variant so we get a JWT we can hand to
  // Better Auth's social signin without needing a server-side code exchange.
  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    scopes: ['openid', 'email', 'profile'],
  });


  // Reset loading when user comes back to app after cancelling browser auth
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && browserOpenRef.current) {
        browserOpenRef.current = false;
        setIsLoading(false);
      }
    });
    return () => sub.remove();
  }, []);

  // Handle Google response. Expo's native Google flow uses response_type=code
  // and auto-exchanges the code, so the idToken lands in either
  // `authentication.idToken` (post-exchange) or `params.id_token` (implicit).
  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken =
        (googleResponse as any)?.authentication?.idToken ??
        (googleResponse as any)?.params?.id_token;
      if (idToken) {
        handleGoogleToken(idToken);
      } else {
        setIsLoading(false);
        browserOpenRef.current = false;
      }
    } else if (googleResponse?.type === 'error' || googleResponse?.type === 'dismiss') {
      setIsLoading(false);
      browserOpenRef.current = false;
    }
  }, [googleResponse]);

  // Navigate after successful auth
  const navigateAfterAuth = async () => {
    usePostLoginWelcomeStore.getState().queueEnjoyVibes();
    try {
      const preferences = await api.get<UserPreferences>('/api/user/preferences');
      // When sign-in was opened as a modal (e.g. Settings → Accounts → Add account), close the modal stack first.
      if (router.canDismiss()) {
        router.dismissAll();
      }
      if (preferences?.onboardingDone) {
        if (!hasSeenPrompt) {
          router.replace('/(app)/upgrade');
        } else {
          router.replace('/(app)/(tabs)');
        }
      } else {
        router.replace('/onboarding');
      }
    } catch {
      if (router.canDismiss()) {
        router.dismissAll();
      }
      router.replace('/(app)/(tabs)');
    }
  };

  // Exchange Google idToken with Better Auth
  const handleGoogleToken = async (idToken: string) => {
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        idToken: { token: idToken },
      });
      if (result.error) throw new Error(result.error.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await navigateAfterAuth();
    } catch (error: any) {
      showVybePopup({
        title: 'Sign In Failed',
        message: error?.message || 'Failed to sign in with Google. Please try again.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
      browserOpenRef.current = false;
    }
  };

  // Check Apple Sign In availability
  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);
    }
  }, []);

  const handleAppleSignIn = async () => {
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

      if (credential.identityToken) {
        const result = await authClient.signIn.social({
          provider: 'apple',
          idToken: { token: credential.identityToken },
        });
        if (result.error) throw new Error(result.error.message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await navigateAfterAuth();
      }
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') return;
      showVybePopup({
        title: 'Sign In Failed',
        message: error.message || 'Failed to sign in with Apple. Please try again.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    browserOpenRef.current = true;
    try {
      await promptGoogleAsync();
      // response handled in useEffect above
    } catch (error: any) {
      showVybePopup({
        title: 'Sign In Failed',
        message: error.message || 'Failed to start Google sign in.',
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
    } catch (error: any) {
      console.error('[sign-in] sendVerificationOtp threw', error);
      showVybePopup({
        title: 'Error',
        message: error?.message || 'Failed to send verification code. Please try again.',
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
    } catch (error) {
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
                  <VybeIcon size={108} variant="primary" />
                </LogoPulse>
                <Text style={signStyles.wordmark}>VYBE</Text>
                <Text style={signStyles.tagline}>break the loop</Text>
              </View>

              <View style={[signStyles.actions, { paddingBottom: insets.bottom + 28 }]}>
                <Pressable
                  onPress={handleAppleSignIn}
                  disabled={isLoading}
                  style={({ pressed }) => [pressed && signStyles.btnPressed]}
                >
                  <BlurView intensity={24} tint="light" style={signStyles.btnBlurLight}>
                    <View style={signStyles.btnBlurInnerRow}>
                      <Text style={signStyles.appleGlyph}>{'\uF8FF'}</Text>
                      <Text style={signStyles.btnTextDark}>Continue with Apple</Text>
                    </View>
                  </BlurView>
                </Pressable>

                <Pressable
                  onPress={handleGoogleSignIn}
                  disabled={isLoading}
                  style={({ pressed }) => [pressed && signStyles.btnPressed]}
                >
                  <BlurView intensity={22} tint="dark" style={signStyles.btnBlurDark}>
                    <View style={signStyles.btnBlurInnerCenter}>
                      {isLoading ? (
                        <ActivityIndicator color="#FEF3C7" size="small" />
                      ) : (
                        <Text style={signStyles.btnTextEmber}>Continue with Google</Text>
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
  btnBlurLight: {
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
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
  btnBlurInnerCenter: {
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
  btnTextDark: {
    color: '#0A0A0A',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  appleGlyph: {
    fontSize: 20,
    marginRight: 10,
    color: '#0A0A0A',
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
});
