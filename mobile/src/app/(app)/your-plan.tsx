import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft,
  Check,
  Zap,
  Music2,
  Headphones,
  Download,
  Sparkles,
  Crown,
  X,
} from 'lucide-react-native';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { VybePlusWordmark } from '@/components/VybePlusWordmark';

// Fixed CTA button height for consistent spacing
const CTA_BUTTON_HEIGHT = 56;
const CTA_CONTAINER_PADDING = 16;

const BENEFITS = [
  { icon: <X size={18} color="#8B5CF6" />, text: 'No ads' },
  { icon: <Zap size={18} color="#8B5CF6" />, text: 'Unlimited skips' },
  { icon: <Music2 size={18} color="#8B5CF6" />, text: 'High quality audio' },
  { icon: <Headphones size={18} color="#8B5CF6" />, text: 'Lossless when supported' },
  { icon: <Download size={18} color="#8B5CF6" />, text: 'Offline downloads for VYBE music' },
  { icon: <Sparkles size={18} color="#8B5CF6" />, text: 'Early AI releases' },
  { icon: <Crown size={18} color="#8B5CF6" />, text: 'Advanced discovery' },
];

interface BenefitItemProps {
  icon: React.ReactNode;
  text: string;
}

function BenefitItem({ icon, text }: BenefitItemProps) {
  return (
    <View className="flex-row items-center py-3">
      <View className="w-8 h-8 rounded-full bg-[#8B5CF6]/20 items-center justify-center">
        {icon}
      </View>
      <Text className="text-white text-base ml-4">{text}</Text>
    </View>
  );
}

interface PricingCardProps {
  period: string;
  price: string;
  perMonth?: string;
  savings?: string;
  isSelected: boolean;
  onPress: () => void;
}

function PricingCard({ period, price, perMonth, savings, isSelected, onPress }: PricingCardProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      className="flex-1 mx-2 rounded-xl overflow-hidden"
      style={{
        borderWidth: 2,
        borderColor: isSelected ? '#8B5CF6' : 'rgba(255,255,255,0.1)',
      }}
    >
      <View className="bg-[#1A1A1A] p-4">
        {savings ? (
          <View className="absolute top-0 right-0 bg-[#8B5CF6] px-2 py-1 rounded-bl-lg">
            <Text className="text-white text-xs font-semibold">{savings}</Text>
          </View>
        ) : null}
        <Text className="text-white/60 text-sm">{period}</Text>
        <Text className="text-white text-2xl font-bold mt-1">{price}</Text>
        {perMonth ? (
          <Text className="text-white/40 text-xs mt-1">{perMonth}</Text>
        ) : null}
        {isSelected ? (
          <View className="absolute bottom-4 right-4 w-6 h-6 rounded-full bg-[#8B5CF6] items-center justify-center">
            <Check size={14} color="#fff" strokeWidth={3} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function YourPlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tier = useSubscriptionStore(s => s.tier);
  const setTier = useSubscriptionStore(s => s.setTier);
  const [selectedPlan, setSelectedPlan] = React.useState<'monthly' | 'yearly'>('yearly');

  const isPlus = tier === 'plus';

  // Calculate bottom padding for scroll content
  // This ensures content can scroll above the fixed CTA button
  const bottomPadding = isPlus
    ? insets.bottom + 24
    : CTA_BUTTON_HEIGHT + CTA_CONTAINER_PADDING * 2 + insets.bottom + 24;

  const handleSubscribe = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTier('plus');
  };

  const handleCancelPlan = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setTier('free');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#2D1B4E', '#1a1a2e', '#0A0A0A']}
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="w-10 h-10 items-center justify-center -ml-2"
          >
            <ChevronLeft size={28} color="#fff" />
          </Pressable>
          <Text className="text-white text-xl font-bold flex-1 text-center mr-8">
            Your Plan
          </Text>
        </View>

        {/* Current Plan Status */}
        <View className="items-center pb-8 pt-4">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-4"
            style={{
              backgroundColor: isPlus ? '#8B5CF6' : 'rgba(255,255,255,0.1)',
            }}
          >
            <Crown size={40} color="#fff" />
          </View>
          {isPlus ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'baseline', paddingHorizontal: 16 }}>
              <Text className="text-white text-lg font-semibold">You're subscribed to </Text>
              <VybePlusWordmark variant="inline" withPlusGlow={false} />
            </View>
          ) : (
            <Text className="text-white text-lg font-semibold">You're on the Free plan</Text>
          )}
          <Text className="text-white/50 text-sm mt-1">
            {isPlus ? 'Renews on March 8, 2026' : 'Listen with ads and limited skips.'}
          </Text>
        </View>
      </LinearGradient>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {isPlus ? (
          /* Active Subscription View */
          <View className="px-4 pt-6">
            <View className="bg-[#1A1A1A] rounded-xl p-5">
              <Text className="text-white font-semibold text-lg mb-4">
                Your Benefits
              </Text>
              {BENEFITS.map((benefit, index) => (
                <BenefitItem key={index} icon={benefit.icon} text={benefit.text} />
              ))}
            </View>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              className="mt-6 py-4 bg-[#1A1A1A] rounded-xl"
            >
              <Text className="text-white font-semibold text-center">
                Manage Plan
              </Text>
            </Pressable>

            <Pressable
              onPress={handleCancelPlan}
              className="mt-3 py-4"
            >
              <Text className="text-white/50 text-center">
                Cancel Plan
              </Text>
            </Pressable>
          </View>
        ) : (
          /* Upsell View */
          <View className="px-4 pt-6">
            {/* Vybe+ upsell */}
            <View className="items-center mb-8">
              <VybePlusWordmark variant="hero" />
              <Text className="text-white/60 text-base mt-1 text-center px-4">
                break the loop · Vybe+ unlocks the Vault
              </Text>
            </View>

            {/* Benefits */}
            <View className="bg-[#1A1A1A] rounded-xl p-5 mb-6">
              {BENEFITS.map((benefit, index) => (
                <BenefitItem key={index} icon={benefit.icon} text={benefit.text} />
              ))}
            </View>

            {/* Pricing Options */}
            <View className="flex-row mb-6">
              <PricingCard
                period="Monthly"
                price="$4.99"
                perMonth="/month"
                isSelected={selectedPlan === 'monthly'}
                onPress={() => setSelectedPlan('monthly')}
              />
              <PricingCard
                period="Yearly"
                price="$49.99"
                perMonth="$4.17/month"
                savings="Save ~17%"
                isSelected={selectedPlan === 'yearly'}
                onPress={() => setSelectedPlan('yearly')}
              />
            </View>

            {/* Compliance Note */}
            <Text className="text-white/30 text-xs text-center px-4">
              Downloads apply only to VYBE licensed content. Subscription automatically renews unless canceled at least 24 hours before the end of the current period.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Fixed CTA Button - Only shown for free users */}
      {!isPlus && (
        <View
          style={[
            styles.ctaContainer,
            { paddingBottom: insets.bottom + CTA_CONTAINER_PADDING },
          ]}
        >
          {/* Gradient fade for content scrolling behind */}
          <LinearGradient
            colors={['transparent', '#0A0A0A']}
            style={styles.ctaGradient}
            pointerEvents="none"
          />
          <Pressable
            onPress={handleSubscribe}
            style={styles.ctaButton}
          >
            <LinearGradient
              colors={['#8B5CF6', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradientButton}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text className="text-white font-bold text-lg">Start </Text>
                <VybePlusWordmark variant="inline" vybeColor="#fff" plusColor="#fff" />
              </View>
            </LinearGradient>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  scrollView: {
    flex: 1,
  },
  ctaContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: CTA_CONTAINER_PADDING,
  },
  ctaGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 120,
  },
  ctaButton: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  ctaGradientButton: {
    height: CTA_BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
