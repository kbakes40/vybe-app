import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { VybeTextInput } from '@/components/VybeTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Mail, ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
} from 'react-native-reanimated';
import { authClient } from '@/lib/auth/auth-client';
import { api } from '@/lib/api/api';
import { VybeIcon } from '@/components/VybeIcon';
import { useVybePopup } from '@/components/VybePopup';

type AuthView = 'main' | 'email';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const [view, setView] = useState<AuthView>('main');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAppleSignIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showVybePopup({
      title: 'Coming Soon',
      message: 'Apple Sign In will be available soon.',
      type: 'info',
    });
  };

  const handleGoogleSignIn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showVybePopup({
      title: 'Coming Soon',
      message: 'Google Sign In will be available soon.',
      type: 'info',
    });
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
      await authClient.emailOtp.sendVerificationOtp({
        email,
        type: 'sign-in',
      });
      router.push({ pathname: '/verify-otp', params: { email } });
    } catch (error) {
      showVybePopup({
        title: 'Error',
        message: 'Failed to send verification code. Please try again.',
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
      if (result?.isGuest) {
        router.replace('/onboarding');
      }
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
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <LinearGradient
        colors={['#1a1a2e', '#0A0A0A', '#0A0A0A']}
        style={{ flex: 1, paddingTop: insets.top }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {view === 'email' ? (
            <Animated.View
              entering={SlideInRight.duration(300)}
              exiting={SlideOutLeft.duration(300)}
              style={{ flex: 1 }}
            >
              {/* Back Button */}
              <Pressable
                onPress={handleBack}
                className="flex-row items-center px-4 py-2"
              >
                <ChevronLeft size={24} color="#fff" />
                <Text className="text-white text-base ml-1">Back</Text>
              </Pressable>

              {/* Email Input View */}
              <View className="flex-1 px-8 justify-center">
                <Text className="text-white text-3xl font-bold mb-2">
                  Enter your email
                </Text>
                <Text className="text-white/60 text-base mb-8">
                  We will send you a verification code
                </Text>

                <View className="bg-[#1A1A1A] rounded-xl px-4 py-4 mb-6">
                  <VybeTextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="your@email.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    style={{ fontSize: 18, backgroundColor: 'transparent', padding: 0, borderWidth: 0 }}
                  />
                </View>

                <Pressable
                  onPress={handleSendCode}
                  disabled={isLoading || !email}
                  className="overflow-hidden rounded-xl"
                >
                  <LinearGradient
                    colors={email ? ['#8B5CF6', '#3B82F6'] : ['#333', '#333']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      paddingVertical: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                    }}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white font-semibold text-lg">
                        Send Code
                      </Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>
            </Animated.View>
          ) : (
            <Animated.View
              entering={FadeIn.duration(300)}
              exiting={FadeOut.duration(300)}
              style={{ flex: 1 }}
            >
              {/* Logo and Tagline */}
              <View className="flex-1 items-center justify-center px-8">
                <View className="items-center mb-16">
                  <View className="mb-6">
                    <VybeIcon size={110} variant="primary" />
                  </View>
                  <Text className="text-white text-4xl font-bold tracking-wider">
                    VYBE
                  </Text>
                  <Text className="text-white/50 text-base mt-2 italic">
                    break the loop
                  </Text>
                </View>
              </View>

              {/* Sign In Options */}
              <View
                className="px-8"
                style={{ paddingBottom: insets.bottom + 24 }}
              >
                {/* Apple Sign In */}
                <Pressable
                  onPress={handleAppleSignIn}
                  className="bg-white rounded-xl py-4 flex-row items-center justify-center mb-3"
                >
                  <Text className="text-[#0A0A0A] text-lg mr-2">
                    {'\uF8FF'}
                  </Text>
                  <Text className="text-[#0A0A0A] font-semibold text-base">
                    Continue with Apple
                  </Text>
                </Pressable>

                {/* Google Sign In */}
                <Pressable
                  onPress={handleGoogleSignIn}
                  className="bg-[#1A1A1A] border border-[#333] rounded-xl py-4 flex-row items-center justify-center mb-3"
                >
                  <Text className="text-white font-semibold text-base">
                    Continue with Google
                  </Text>
                </Pressable>

                {/* Email Sign In */}
                <Pressable
                  onPress={handleEmailContinue}
                  className="border border-[#444] rounded-xl py-4 flex-row items-center justify-center mb-6"
                >
                  <Mail size={20} color="#fff" />
                  <Text className="text-white font-semibold text-base ml-2">
                    Continue with Email
                  </Text>
                </Pressable>

                {/* Guest Login */}
                <Pressable
                  onPress={handleGuestLogin}
                  disabled={isLoading}
                  className="items-center py-2"
                >
                  {isLoading ? (
                    <ActivityIndicator color="rgba(255,255,255,0.6)" />
                  ) : (
                    <Text className="text-white/60 text-base">
                      Continue as Guest
                    </Text>
                  )}
                </Pressable>
              </View>
            </Animated.View>
          )}
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}
