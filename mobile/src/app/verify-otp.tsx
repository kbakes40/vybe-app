import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { OtpInput } from 'react-native-otp-entry';
import { authClient } from '@/lib/auth/auth-client';
import { persistSessionBearerFromAuthResult } from '@/lib/auth/sessionBearer';
import { getPostAuthDestination } from '@/lib/auth/postAuthDestination';
import { useVybePopup } from '@/components/VybePopup';
import { usePostLoginWelcomeStore } from '@/stores/postLoginWelcomeStore';

export default function VerifyOtpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleVerify = async (otp: string) => {
    if (otp.length !== 6) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    try {
      // Use signIn.emailOtp — NOT emailOtp.verifyEmail. verifyEmail only marks
      // the email as verified during signup and does not create a session.
      // signIn.emailOtp actually signs the user in.
      const result = await authClient.signIn.emailOtp({
        email: email ?? '',
        otp,
      });
      if (result.error) throw new Error(result.error.message ?? 'Invalid code');

      await persistSessionBearerFromAuthResult(result);

      /** Shown on Home after navigation so the toast is not wiped by the stack transition. */
      usePostLoginWelcomeStore.getState().queueEnjoyVibes();

      if (router.canDismiss()) {
        router.dismissAll();
      }
      const dest = await getPostAuthDestination();
      router.replace(dest);
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showVybePopup({
        title: 'Invalid Code',
        message: error?.message || 'The verification code is incorrect. Please try again.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsResending(true);

    try {
      await authClient.emailOtp.sendVerificationOtp({
        email: email ?? '',
        type: 'sign-in',
      });
      showVybePopup({
        title: 'Code Sent',
        message: 'A new verification code has been sent to your email.',
        type: 'success',
      });
    } catch (error) {
      showVybePopup({
        title: 'Error',
        message: 'Failed to resend code. Please try again.',
        type: 'error',
      });
    } finally {
      setIsResending(false);
    }
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <LinearGradient
        colors={['#121212', '#0A0A0A', '#0A0A0A']}
        style={{ flex: 1, paddingTop: insets.top }}
      >
        {/* Back Button */}
        <Pressable
          onPress={handleBack}
          className="flex-row items-center px-4 py-2"
        >
          <ChevronLeft size={24} color="#fff" />
          <Text className="text-white text-base ml-1">Back</Text>
        </Pressable>

        {/* Content */}
        <View className="flex-1 px-8 justify-center">
          <Text className="text-white text-3xl font-bold mb-2">
            Check your email
          </Text>
          <Text className="text-white/60 text-base mb-2">
            We sent a verification code to
          </Text>
          <Text className="text-white font-semibold text-base mb-10">
            {email}
          </Text>

          {/* OTP Input - Dark themed with purple accent */}
          <View className="mb-8">
            <OtpInput
              numberOfDigits={6}
              onFilled={handleVerify}
              focusColor="#8B5CF6"
              autoFocus
              disabled={isLoading}
              textInputProps={{
                keyboardAppearance: 'dark',
                keyboardType: 'number-pad',
              }}
              theme={{
                containerStyle: {
                  gap: 8,
                },
                pinCodeContainerStyle: {
                  backgroundColor: '#1A1A1A',
                  borderColor: '#2A2A2A',
                  borderWidth: 1,
                  borderRadius: 12,
                  width: 48,
                  height: 56,
                },
                pinCodeTextStyle: {
                  color: '#FFFFFF',
                  fontSize: 24,
                  fontWeight: '600',
                },
                focusedPinCodeContainerStyle: {
                  borderColor: '#8B5CF6',
                  borderWidth: 2,
                  shadowColor: '#8B5CF6',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                },
                filledPinCodeContainerStyle: {
                  backgroundColor: '#1A1A1A',
                  borderColor: '#3A3A3A',
                },
              }}
            />
          </View>

          {isLoading ? (
            <View className="items-center py-4">
              <ActivityIndicator color="#8B5CF6" size="large" />
              <Text className="text-white/60 mt-3">Verifying...</Text>
            </View>
          ) : null}

          {/* Resend Code */}
          <View className="flex-row items-center justify-center mt-8">
            <Text className="text-white/50">Did not receive the code? </Text>
            <Pressable onPress={handleResendCode} disabled={isResending}>
              {isResending ? (
                <ActivityIndicator color="#8B5CF6" size="small" />
              ) : (
                <Text className="text-[#8B5CF6] font-semibold">Resend</Text>
              )}
            </Pressable>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}
