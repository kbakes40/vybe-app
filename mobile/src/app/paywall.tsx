import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  X,
  Zap,
  Music,
  Download,
  Sparkles,
  Headphones,
  SkipForward,
  Shield,
  Infinity,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useVybePopup } from '@/components/VybePopup';
import {
  getVybePackages,
  purchasePackage,
  restorePurchases,
  isPremiumActive,
  VybePackages,
} from '@/lib/purchases';

type PlanType = 'monthly' | 'lifetime';

const BENEFITS = [
  { icon: Shield, text: 'No ads, ever' },
  { icon: SkipForward, text: 'Unlimited skips' },
  { icon: Headphones, text: 'High quality & lossless audio' },
  { icon: Download, text: 'Offline downloads' },
  { icon: Sparkles, text: 'Early access to AI releases' },
  { icon: Music, text: 'Advanced discovery controls' },
  { icon: Zap, text: 'Support independent music' },
];

export default function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const closePaywall = useSubscriptionStore((s) => s.closePaywall);
  const setTier = useSubscriptionStore((s) => s.setTier);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('lifetime');
  const [packages, setPackages] = useState<VybePackages>({ monthly: null, lifetime: null });
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    getVybePackages()
      .then(setPackages)
      .finally(() => setIsLoading(false));
  }, []);

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

    const pkg = selectedPlan === 'lifetime' ? packages.lifetime : packages.monthly;

    if (!pkg) {
      // RevenueCat not configured — mock for dev
      setTier('plus');
      closePaywall();
      router.back();
      return;
    }

    setIsPurchasing(true);
    try {
      const info = await purchasePackage(pkg);
      if (isPremiumActive(info)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTier('plus');
        closePaywall();
        router.back();
      }
    } catch (error: any) {
      if (error?.userCancelled) return;
      showVybePopup({
        title: 'Purchase Failed',
        message: error?.message || 'Something went wrong. Please try again.',
        type: 'error',
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsPurchasing(true);
    try {
      const info = await restorePurchases();
      if (isPremiumActive(info)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTier('plus');
        closePaywall();
        router.back();
      } else {
        showVybePopup({
          title: 'No Purchase Found',
          message: 'No previous VYBE Plus subscription was found on this account.',
          type: 'info',
        });
      }
    } catch (error: any) {
      showVybePopup({
        title: 'Restore Failed',
        message: error?.message || 'Could not restore purchases. Try again.',
        type: 'error',
      });
    } finally {
      setIsPurchasing(false);
    }
  };

  const monthlyPrice = packages.monthly?.product?.priceString ?? '$4.99';
  const lifetimePrice = packages.lifetime?.product?.priceString ?? '$49.99';

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

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View className="items-center px-6" style={{ paddingTop: insets.top + 56 }}>
            <LinearGradient
              colors={['#E11D48', '#8B5CF6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <Sparkles size={36} color="#fff" />
            </LinearGradient>
            <Text className="text-white text-3xl font-bold mb-1">VYBE Plus</Text>
            <Text className="text-white/50 text-base text-center mb-6">
              Unlock the full experience
            </Text>
          </View>

          {/* Benefits */}
          <View className="px-6 mb-6">
            {BENEFITS.map((benefit, index) => (
              <View key={index} className="flex-row items-center py-2">
                <View className="w-9 h-9 bg-[#8B5CF6]/15 rounded-full items-center justify-center mr-3">
                  <benefit.icon size={18} color="#8B5CF6" />
                </View>
                <Text className="text-white text-base flex-1">{benefit.text}</Text>
              </View>
            ))}
          </View>

          {/* Plan Selection */}
          <View className="px-6 gap-3">
            {/* Lifetime Plan */}
            <Pressable
              onPress={() => handleSelectPlan('lifetime')}
              className={`rounded-xl border-2 overflow-hidden ${
                selectedPlan === 'lifetime' ? 'border-[#E11D48]' : 'border-[#333]'
              }`}
              style={{ backgroundColor: selectedPlan === 'lifetime' ? 'rgba(225,29,72,0.08)' : '#1A1A1A' }}
            >
              {/* Limited badge */}
              <View style={{ backgroundColor: '#E11D48' }} className="px-3 py-1">
                <Text className="text-white text-xs font-bold text-center">
                  🔥 LIMITED OFFER — FOUNDING MEMBER PRICE
                </Text>
              </View>
              <View className="flex-row items-center justify-between p-4">
                <View className="flex-row items-center flex-1">
                  <View className={`w-[22px] h-[22px] rounded-full border-2 items-center justify-center mr-3 ${
                    selectedPlan === 'lifetime' ? 'border-[#E11D48]' : 'border-white/30'
                  }`}>
                    {selectedPlan === 'lifetime' && (
                      <View className="w-3 h-3 rounded-full bg-[#E11D48]" />
                    )}
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-white text-lg font-semibold">Lifetime</Text>
                      <Infinity size={14} color="rgba(255,255,255,0.5)" />
                    </View>
                    <Text className="text-white/50 text-xs">One-time · Pay once, own forever</Text>
                  </View>
                </View>
                <Text className="text-white text-xl font-bold ml-2">{lifetimePrice}</Text>
              </View>
            </Pressable>

            {/* Monthly Plan */}
            <Pressable
              onPress={() => handleSelectPlan('monthly')}
              className={`rounded-xl border-2 p-4 ${
                selectedPlan === 'monthly'
                  ? 'border-[#8B5CF6] bg-[#8B5CF6]/10'
                  : 'border-[#333] bg-[#1A1A1A]'
              }`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center flex-1">
                  <View className={`w-[22px] h-[22px] rounded-full border-2 items-center justify-center mr-3 ${
                    selectedPlan === 'monthly' ? 'border-[#8B5CF6]' : 'border-white/30'
                  }`}>
                    {selectedPlan === 'monthly' && (
                      <View className="w-3 h-3 rounded-full bg-[#8B5CF6]" />
                    )}
                  </View>
                  <View>
                    <Text className="text-white text-lg font-semibold">Monthly</Text>
                    <Text className="text-white/50 text-xs">Billed monthly · Cancel anytime</Text>
                  </View>
                </View>
                <View className="items-end ml-2">
                  <Text className="text-white text-xl font-bold">{monthlyPrice}</Text>
                  <Text className="text-white/40 text-xs">/ month</Text>
                </View>
              </View>
            </Pressable>
          </View>

          <Text className="text-white/30 text-xs text-center mt-4 px-6">
            Lifetime price increases after launch promotion ends.
          </Text>

          {/* Subscribe Button */}
          <View className="px-6 mt-6">
            <Pressable
              onPress={handleSubscribe}
              disabled={isPurchasing || isLoading}
              className="overflow-hidden rounded-2xl mb-3"
            >
              <LinearGradient
                colors={selectedPlan === 'lifetime' ? ['#E11D48', '#8B5CF6'] : ['#8B5CF6', '#3B82F6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ paddingVertical: 16, alignItems: 'center', justifyContent: 'center' }}
              >
                {isPurchasing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-bold text-lg">
                    {selectedPlan === 'lifetime'
                      ? `Get Lifetime · ${lifetimePrice}`
                      : `Start Monthly · ${monthlyPrice}/mo`}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            {/* Restore & Maybe Later */}
            <View className="flex-row items-center justify-center gap-6 mt-2">
              <Pressable onPress={handleRestore} disabled={isPurchasing} className="py-2">
                <Text className="text-white/40 text-sm">Restore Purchase</Text>
              </Pressable>
              <Pressable onPress={handleClose} className="py-2">
                <Text className="text-white/40 text-sm">Maybe Later</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </View>
  );
}
