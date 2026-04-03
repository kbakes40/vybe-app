import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  X,
  Check,
  Zap,
  Music,
  Download,
  Sparkles,
  Headphones,
  SkipForward,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useVybePopup } from '@/components/VybePopup';

type PlanType = 'monthly' | 'yearly';

const BENEFITS = [
  { icon: SkipForward, text: 'Unlimited skips' },
  { icon: Zap, text: 'No ads, ever' },
  { icon: Headphones, text: 'High quality & lossless audio' },
  { icon: Download, text: 'Offline downloads' },
  { icon: Sparkles, text: 'Early access to AI releases' },
  { icon: Music, text: 'Advanced discovery controls' },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const closePaywall = useSubscriptionStore((s) => s.closePaywall);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('yearly');
  const [isLoading, setIsLoading] = useState(false);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    closePaywall();
    router.back();
  };

  const handleSelectPlan = (plan: PlanType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPlan(plan);
  };

  const handleSubscribe = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);

    // Simulate subscription flow
    setTimeout(() => {
      setIsLoading(false);
      showVybePopup({
        title: 'Coming Soon',
        message: 'Subscription functionality will be available soon. Thank you for your interest in VYBE Plus!',
        type: 'info',
        actions: [{ text: 'OK', onPress: handleClose }]
      });
    }, 1000);
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <LinearGradient
        colors={['#1a1a2e', '#0A0A0A', '#0A0A0A']}
        style={{ flex: 1 }}
      >
        {/* Close Button */}
        <View
          className="absolute top-0 right-0 z-10"
          style={{ paddingTop: insets.top + 8, paddingRight: 16 }}
        >
          <Pressable
            onPress={handleClose}
            className="w-10 h-10 bg-white/10 rounded-full items-center justify-center"
          >
            <X size={24} color="#fff" />
          </Pressable>
        </View>

        {/* Content */}
        <View
          className="flex-1 px-6 justify-center"
          style={{ paddingTop: insets.top }}
        >
          {/* Header */}
          <View className="items-center mb-8">
            <LinearGradient
              colors={['#8B5CF6', '#3B82F6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 80,
                height: 80,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Sparkles size={40} color="#fff" />
            </LinearGradient>
            <Text className="text-white text-3xl font-bold">
              Upgrade to VYBE Plus
            </Text>
            <Text className="text-white/60 text-base mt-2 text-center">
              Unlock the full experience
            </Text>
          </View>

          {/* Benefits */}
          <View className="mb-8">
            {BENEFITS.map((benefit, index) => (
              <View key={index} className="flex-row items-center py-3">
                <View className="w-10 h-10 bg-[#8B5CF6]/20 rounded-full items-center justify-center mr-4">
                  <benefit.icon size={20} color="#8B5CF6" />
                </View>
                <Text className="text-white text-base flex-1">
                  {benefit.text}
                </Text>
                <Check size={20} color="#8B5CF6" />
              </View>
            ))}
          </View>

          {/* Plan Selection */}
          <View className="flex-row gap-3 mb-6">
            {/* Monthly Plan */}
            <Pressable
              onPress={() => handleSelectPlan('monthly')}
              className={`flex-1 rounded-xl p-4 border-2 ${
                selectedPlan === 'monthly'
                  ? 'border-[#8B5CF6] bg-[#8B5CF6]/10'
                  : 'border-[#333] bg-[#1A1A1A]'
              }`}
            >
              <Text className="text-white/60 text-sm mb-1">Monthly</Text>
              <Text className="text-white text-2xl font-bold">$4.99</Text>
              <Text className="text-white/40 text-sm">/month</Text>
            </Pressable>

            {/* Yearly Plan */}
            <Pressable
              onPress={() => handleSelectPlan('yearly')}
              className={`flex-1 rounded-xl p-4 border-2 relative overflow-hidden ${
                selectedPlan === 'yearly'
                  ? 'border-[#8B5CF6] bg-[#8B5CF6]/10'
                  : 'border-[#333] bg-[#1A1A1A]'
              }`}
            >
              {/* Best Value Badge */}
              <View className="absolute top-0 right-0 bg-[#8B5CF6] px-2 py-1 rounded-bl-lg">
                <Text className="text-white text-xs font-semibold">
                  SAVE 17%
                </Text>
              </View>
              <Text className="text-white/60 text-sm mb-1">Yearly</Text>
              <Text className="text-white text-2xl font-bold">$49.99</Text>
              <Text className="text-white/40 text-sm">/year</Text>
            </Pressable>
          </View>
        </View>

        {/* Subscribe Button */}
        <View className="px-6" style={{ paddingBottom: insets.bottom + 16 }}>
          <Pressable
            onPress={handleSubscribe}
            disabled={isLoading}
            className="overflow-hidden rounded-xl mb-4"
          >
            <LinearGradient
              colors={['#8B5CF6', '#3B82F6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                paddingVertical: 16,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-lg">
                  Subscribe{' '}
                  {selectedPlan === 'monthly' ? '$4.99/mo' : '$49.99/yr'}
                </Text>
              )}
            </LinearGradient>
          </Pressable>

          {/* Maybe Later */}
          <Pressable onPress={handleClose} className="items-center py-2">
            <Text className="text-white/50 text-base">Maybe later</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}
