import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Zap,
  Music2,
  Headphones,
  Download,
  Sparkles,
  Crown,
  Shield,
  Infinity,
} from 'lucide-react-native';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useUpgradePromptStore } from '@/stores/upgradePromptStore';
import { useVybePopup } from '@/components/VybePopup';
import {
  getVybePackages,
  purchasePackage,
  isPremiumActive,
  isLifetimePurchase,
  VybePackages,
} from '@/lib/purchases';

const CTA_BUTTON_HEIGHT = 56;
const CTA_CONTAINER_PADDING = 16;

const BENEFITS = [
  { icon: Shield, text: 'No ads, ever' },
  { icon: Zap, text: 'Unlimited skips' },
  { icon: Music2, text: 'High quality audio' },
  { icon: Headphones, text: 'Lossless when supported' },
  { icon: Download, text: 'Offline downloads for VYBE music' },
  { icon: Sparkles, text: 'Early AI releases' },
  { icon: Crown, text: 'Advanced discovery controls' },
];

type PlanType = 'monthly' | 'lifetime';

interface PricingCardProps {
  plan: PlanType;
  price: string;
  subtext: string;
  badge?: string;
  badgeColor?: string;
  isSelected: boolean;
  onPress: () => void;
}

function PricingCard({ plan, price, subtext, badge, badgeColor = '#8B5CF6', isSelected, onPress }: PricingCardProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={[styles.pricingCard, isSelected && styles.pricingCardSelected]}
    >
      <View style={styles.pricingCardContent}>
        <View style={styles.pricingLeft}>
          <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
            {isSelected && <View style={styles.radioInner} />}
          </View>
          <View style={styles.pricingTextContainer}>
            <View style={styles.pricingTitleRow}>
              <Text style={styles.pricingPeriod}>
                {plan === 'lifetime' ? 'Lifetime' : 'Monthly'}
              </Text>
              {badge && (
                <View style={[styles.pricingBadge, { backgroundColor: badgeColor }]}>
                  <Text style={styles.pricingBadgeText}>{badge}</Text>
                </View>
              )}
            </View>
            <Text style={styles.pricingSubtext}>{subtext}</Text>
          </View>
        </View>
        <View style={styles.priceContainer}>
          <Text style={styles.pricingPrice}>{price}</Text>
          {plan === 'lifetime' && (
            <Infinity size={14} color="rgba(255,255,255,0.4)" style={{ marginTop: 2 }} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

export default function UpgradeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const setTier = useSubscriptionStore(s => s.setTier);
  const setHasSeenPrompt = useUpgradePromptStore(s => s.setHasSeenPrompt);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('lifetime');
  const [packages, setPackages] = useState<VybePackages>({ monthly: null, lifetime: null });
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const bottomPadding = CTA_BUTTON_HEIGHT + CTA_CONTAINER_PADDING * 2 + insets.bottom + 24;

  useEffect(() => {
    setIsLoading(true);
    getVybePackages()
      .then(setPackages)
      .finally(() => setIsLoading(false));
  }, []);

  const handleNotNow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTier('free');
    setHasSeenPrompt(true);
    router.replace('/(app)/(tabs)');
  };

  const handleSubscribe = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const pkg = selectedPlan === 'lifetime' ? packages.lifetime : packages.monthly;

    if (!pkg) {
      // RevenueCat not configured yet — mock for testing
      setTier('plus');
      setHasSeenPrompt(true);
      router.replace('/(app)/(tabs)');
      return;
    }

    setIsPurchasing(true);
    try {
      const info = await purchasePackage(pkg);
      if (isPremiumActive(info)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTier('plus');
        setHasSeenPrompt(true);
        router.replace('/(app)/(tabs)');
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

  const monthlyPrice = packages.monthly?.product?.priceString ?? '$4.99';
  const lifetimePrice = packages.lifetime?.product?.priceString ?? '$49.99';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1a1a2e', '#0F0F0F', '#0A0A0A']}
        style={StyleSheet.absoluteFill}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={handleNotNow} hitSlop={16}>
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerSection}>
          <View style={styles.crownContainer}>
            <Crown size={48} color="#8B5CF6" />
          </View>
          <Text style={styles.title}>Try VYBE Plus</Text>
          <Text style={styles.subtitle}>break the loop</Text>
          <Text style={styles.supportingText}>
            Upgrade anytime. Cancel anytime.
          </Text>
        </View>

        {/* Benefits */}
        <View style={styles.benefitsContainer}>
          {BENEFITS.map((benefit, index) => (
            <View key={index} style={styles.benefitItem}>
              <View style={styles.benefitIconContainer}>
                <benefit.icon size={18} color="#8B5CF6" />
              </View>
              <Text style={styles.benefitText}>{benefit.text}</Text>
            </View>
          ))}
        </View>

        {/* Pricing */}
        <View style={styles.pricingSection}>
          <PricingCard
            plan="lifetime"
            price={lifetimePrice}
            subtext="One-time purchase · Pay once, own forever"
            badge="🔥 Limited Offer"
            badgeColor="#E11D48"
            isSelected={selectedPlan === 'lifetime'}
            onPress={() => setSelectedPlan('lifetime')}
          />
          <PricingCard
            plan="monthly"
            price={`${monthlyPrice}/mo`}
            subtext="Billed monthly · Cancel anytime"
            isSelected={selectedPlan === 'monthly'}
            onPress={() => setSelectedPlan('monthly')}
          />
        </View>

        <Text style={styles.limitedNote}>
          Lifetime price increases after launch promotion ends.
        </Text>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.ctaContainer, { paddingBottom: insets.bottom + CTA_CONTAINER_PADDING }]}>
        <LinearGradient
          colors={['transparent', '#0A0A0A']}
          style={styles.ctaGradient}
          pointerEvents="none"
        />

        <Pressable
          onPress={handleSubscribe}
          disabled={isPurchasing || isLoading}
          style={styles.ctaButton}
        >
          <LinearGradient
            colors={selectedPlan === 'lifetime' ? ['#E11D48', '#8B5CF6'] : ['#8B5CF6', '#6366F1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradientButton}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>
                {selectedPlan === 'lifetime'
                  ? `Get Lifetime · ${lifetimePrice}`
                  : `Start Monthly · ${monthlyPrice}/mo`}
              </Text>
            )}
          </LinearGradient>
        </Pressable>

        <Text style={styles.footerText}>
          Free includes ads and limited skips.{'\n'}
          Downloads apply only to VYBE music.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  notNowText: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '500' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 24 },
  headerSection: { alignItems: 'center', paddingTop: 24, paddingBottom: 32 },
  crownContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { color: '#FFFFFF', fontSize: 32, fontWeight: '700', letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { color: '#8B5CF6', fontSize: 18, fontWeight: '500', marginBottom: 8 },
  supportingText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  benefitsContainer: { paddingBottom: 24 },
  benefitItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  benefitIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  benefitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '500', flex: 1 },
  pricingSection: { gap: 12 },
  pricingCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  pricingCardSelected: { borderColor: '#8B5CF6' },
  pricingCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  pricingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  radioOuterSelected: { borderColor: '#8B5CF6' },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#8B5CF6' },
  pricingTextContainer: { gap: 2, flex: 1 },
  pricingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pricingPeriod: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  pricingBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  pricingBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  pricingSubtext: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  priceContainer: { alignItems: 'flex-end', marginLeft: 8 },
  pricingPrice: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  limitedNote: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  ctaContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: CTA_CONTAINER_PADDING,
  },
  ctaGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 150 },
  ctaButton: { borderRadius: 28, overflow: 'hidden' },
  ctaGradientButton: { height: CTA_BUTTON_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  footerText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
