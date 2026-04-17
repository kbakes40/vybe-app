import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  TextInput,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import { authClient } from '@/lib/auth/auth-client';
import { api } from '@/lib/api/api';
import { useUpgradePromptStore } from '@/stores/upgradePromptStore';
import { useVybePopup } from '@/components/VybePopup';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const CTA_H = 56;
const OTP_ROW_H = 60;

interface UserPreferences {
  onboardingDone: boolean;
}

/** e.g. kevin@gmail.com → k****@gmail.com */
function maskEmailInboxLine(email: string | undefined): string {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const first = local.charAt(0).toLowerCase();
  const stars = '*'.repeat(4);
  return `The code is in your inbox: ${first}${stars}@${domain.toLowerCase()}`;
}

/** Subtle grain + amber center glow */
function AtmosphereBackdrop() {
  return (
    <Svg
      width={SCREEN_W}
      height={SCREEN_H}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient id="amberGlow" cx="50%" cy="40%" r="65%">
          <Stop offset="0%" stopColor="#F59E0B" stopOpacity={0.2} />
          <Stop offset="42%" stopColor="#F59E0B" stopOpacity={0.05} />
          <Stop offset="100%" stopColor="#050505" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={SCREEN_W} height={SCREEN_H} fill="#050505" />
      <Rect x={0} y={0} width={SCREEN_W} height={SCREEN_H} fill="url(#amberGlow)" />
      {Array.from({ length: 18 }).map((_, i) => (
        <Line
          key={`h-${i}`}
          x1={0}
          y1={i * 48}
          x2={SCREEN_W}
          y2={i * 48 + 12}
          stroke="rgba(255,255,255,0.02)"
          strokeWidth={1}
        />
      ))}
    </Svg>
  );
}

/** Neon-green mesh lines for success flash */
function GreenMeshOverlay() {
  const step = 28;
  const linesH = Math.ceil(SCREEN_H / step) + 2;
  const linesW = Math.ceil(SCREEN_W / step) + 2;
  return (
    <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: linesH }).map((_, i) => (
        <Line
          key={`mh-${i}`}
          x1={0}
          y1={i * step}
          x2={SCREEN_W}
          y2={i * step}
          stroke="rgba(52, 211, 153, 0.35)"
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: linesW }).map((_, i) => (
        <Line
          key={`mv-${i}`}
          x1={i * step}
          y1={0}
          x2={i * step}
          y2={SCREEN_H}
          stroke="rgba(16, 185, 129, 0.28)"
          strokeWidth={1}
        />
      ))}
    </Svg>
  );
}

/** Magenta breathing CTA — ~0.5Hz (2s full cycle) */
function PulseButton({
  onPress,
  disabled,
  loading,
  label,
}: {
  onPress: () => void;
  disabled: boolean;
  loading: boolean;
  label: string;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (disabled) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [disabled, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: disabled ? 0 : 0.55 + 0.4 * pulse.value,
    shadowRadius: disabled ? 0 : 22 + 28 * pulse.value,
    transform: [{ scale: disabled ? 1 : 1 + 0.014 * pulse.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.ctaShadow,
        Platform.OS === 'ios'
          ? { shadowColor: '#D946EF', shadowOffset: { width: 0, height: 0 } }
          : { elevation: disabled ? 0 : 18 },
        glowStyle,
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => [
          styles.cta,
          disabled && styles.ctaDisabled,
          pressed && !disabled && styles.ctaPressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#0A0A0A" />
        ) : (
          <Text style={styles.ctaText}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

function MachinedOtpCell({
  digit,
  active,
  disabled,
}: {
  digit: string;
  active: boolean;
  disabled: boolean;
}) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 650, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 650, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [active, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    shadowOpacity: active ? 0.5 + 0.45 * pulse.value : 0,
    shadowRadius: active ? 12 + 18 * pulse.value : 0,
  }));

  return (
    <Animated.View
      style={[
        styles.otpBox,
        active && styles.otpBoxActiveBase,
        pulseStyle,
        disabled && styles.otpBoxDisabled,
      ]}
    >
      <Text style={styles.otpText}>{digit || ''}</Text>
    </Animated.View>
  );
}

export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [inputFocused, setInputFocused] = useState(true);
  const hiddenInputRef = useRef<TextInput>(null);
  const lastDigitCountRef = useRef(0);
  const hasSeenPrompt = useUpgradePromptStore((s) => s.hasSeenPrompt);

  const enterBlurOpacity = useSharedValue(1);
  const enterStyle = useAnimatedStyle(() => ({ opacity: enterBlurOpacity.value }));

  const flashOpacity = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  useEffect(() => {
    enterBlurOpacity.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    const t = setTimeout(() => hiddenInputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [enterBlurOpacity]);

  const routeAfterVerify = useCallback(async () => {
    try {
      const preferences = await api.get<UserPreferences>('/api/user/preferences');
      if (preferences?.onboardingDone) {
        if (!hasSeenPrompt) router.replace('/(app)/upgrade');
        else router.replace('/(app)/(tabs)');
      } else {
        router.replace('/onboarding');
      }
    } catch {
      router.replace('/onboarding');
    }
  }, [hasSeenPrompt, router]);

  const handleVerify = useCallback(
    async (otp: string) => {
      if (otp.length !== 6 || !email) return;

      setIsLoading(true);

      try {
        const { error } = await authClient.signIn.emailOtp({
          email,
          otp,
        });
        if (error) throw new Error(error.message ?? 'Invalid code');

        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        flashOpacity.value = withSequence(
          withTiming(1, { duration: 160, easing: Easing.out(Easing.quad) }),
          withDelay(140, withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })),
        );
        setTimeout(() => {
          void routeAfterVerify();
        }, 520);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Verification failed';
        console.error('[verify-otp] verify failed', err);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showVybePopup({
          title: 'Invalid Code',
          message: message || 'The verification code is incorrect. Please try again.',
          type: 'error',
        });
        setCode('');
        lastDigitCountRef.current = 0;
      } finally {
        setIsLoading(false);
      }
    },
    [flashOpacity, email, routeAfterVerify, showVybePopup],
  );

  const onCodeChange = useCallback(
    (text: string) => {
      const clean = text.replace(/\D/g, '').slice(0, 6);
      if (clean.length > lastDigitCountRef.current) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      lastDigitCountRef.current = clean.length;
      setCode(clean);
      if (clean.length === 6) {
        void handleVerify(clean);
      }
    },
    [handleVerify],
  );

  const handleResendCode = useCallback(async () => {
    if (!email) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsResending(true);
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });
      if (error) throw new Error(error.message ?? 'Failed to resend');
      showVybePopup({
        title: 'Code Sent',
        message: 'A new verification code is on its way.',
        type: 'success',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resend code';
      showVybePopup({
        title: 'Error',
        message,
        type: 'error',
      });
    } finally {
      setIsResending(false);
    }
  }, [email, showVybePopup]);

  const handleBack = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, [router]);

  const activeCellIndex = inputFocused ? Math.min(code.length, 5) : -1;
  const bottomPad = insets.bottom + 16;

  return (
    <View style={styles.root}>
      <AtmosphereBackdrop />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.safeTop, { paddingTop: insets.top }]}>
          <Pressable onPress={handleBack} style={styles.backRow}>
            <ChevronLeft size={24} color="#F4F4F5" />
            <Text style={styles.backText}>Back</Text>
          </Pressable>

          <View style={[styles.body, { paddingBottom: bottomPad + CTA_H + 24 }]}>
            <Text style={styles.kicker}>ACCESS YOUR VIBE</Text>
            <Text style={styles.sub}>{maskEmailInboxLine(email)}</Text>

            <Pressable
              style={styles.otpWrap}
              onPress={() => hiddenInputRef.current?.focus()}
            >
              <TextInput
                ref={hiddenInputRef}
                value={code}
                onChangeText={onCodeChange}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                keyboardType="number-pad"
                keyboardAppearance="dark"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                editable={!isLoading}
                caretHidden
                style={styles.hiddenOtpInput}
              />
              <View style={styles.otpRow}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <MachinedOtpCell
                    key={i}
                    digit={code[i] ?? ''}
                    active={activeCellIndex === i}
                    disabled={isLoading}
                  />
                ))}
              </View>
            </Pressable>

            <View style={styles.resendRow}>
              <Text style={styles.resendMuted}>Didn't get it? </Text>
              <Pressable onPress={handleResendCode} disabled={isResending}>
                {isResending ? (
                  <ActivityIndicator color="#FDE68A" size="small" />
                ) : (
                  <Text style={styles.resendLink}>Resend</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <View
        style={[
          styles.ctaDock,
          {
            paddingBottom: bottomPad,
            paddingTop: 12,
          },
        ]}
        pointerEvents="box-none"
      >
        <PulseButton
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            void handleVerify(code);
          }}
          disabled={code.length !== 6 || isLoading}
          loading={isLoading}
          label="Verify"
        />
      </View>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.enterBlurLayer, enterStyle]}
      >
        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.greenFlash, flashStyle]}
      >
        <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
        <GreenMeshOverlay />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050505',
  },
  flex: { flex: 1 },
  safeTop: { flex: 1 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backText: {
    color: '#F4F4F5',
    fontSize: 15,
    marginLeft: 2,
    fontWeight: '500',
  },
  body: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 40,
  },
  kicker: {
    color: '#FAFAFA',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  sub: {
    marginTop: 14,
    color: 'rgba(148, 163, 184, 0.92)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
    textAlign: 'center',
    lineHeight: 18,
  },
  otpWrap: {
    marginTop: 44,
    minHeight: OTP_ROW_H,
    position: 'relative',
  },
  hiddenOtpInput: {
    position: 'absolute',
    opacity: 0.02,
    width: SCREEN_W,
    height: OTP_ROW_H,
    left: 0,
    top: 0,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  otpBox: {
    width: 48,
    height: OTP_ROW_H,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#0B1726',
    backgroundColor: 'rgba(28, 28, 32, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  otpBoxActiveBase: {
    borderBottomWidth: 2,
    borderBottomColor: '#FBBF24',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    ...Platform.select({ android: { elevation: 12 } }),
  },
  otpBoxDisabled: {
    opacity: 0.55,
  },
  otpText: {
    color: '#FAFAFA',
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  resendRow: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendMuted: {
    color: 'rgba(148, 163, 184, 0.55)',
    fontSize: 13,
  },
  resendLink: {
    color: '#FDE68A',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  ctaDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 28,
    backgroundColor: 'transparent',
  },
  ctaShadow: {
    borderRadius: 4,
  },
  cta: {
    backgroundColor: '#D946EF',
    paddingVertical: 17,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    backgroundColor: 'rgba(217, 70, 239, 0.25)',
  },
  ctaPressed: {
    opacity: 0.88,
  },
  ctaText: {
    color: '#0A0A0A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  enterBlurLayer: {
    zIndex: 40,
  },
  greenFlash: {
    zIndex: 50,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
});
