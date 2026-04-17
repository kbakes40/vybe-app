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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  FadeIn,
} from 'react-native-reanimated';
import {
  Zap,
  Music2,
  Headphones,
  Download,
  Sparkles,
  Crown,
  Shield,
  Infinity,
  Check,
  Star,
  Radio,
  Heart,
  BarChart2,
  Globe,
} from 'lucide-react-native';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useUpgradePromptStore } from '@/stores/upgradePromptStore';
import { useVybePopup } from '@/components/VybePopup';
import {
  getVybePackages,
  purchasePackage,
  VybePackages,
} from '@/lib/purchases';

const BENEFITS = [
  { icon: Shield, text: 'No ads, ever' },
  { icon: Zap, text: 'Unlimited skips' },
  { icon: Music2, text: 'High quality audio' },
  { icon: Headphones, text: 'Lossless when supported' },
  { icon: Download, text: 'Offline downloads' },
  { icon: Sparkles, text: 'Early AI releases' },
  { icon: Crown, text: 'Advanced discovery' },
  { icon: Star, text: 'Exclusive releases' },
  { icon: Radio, text: 'Artist radio stations' },
  { icon: Globe, text: '500M+ songs' },
  { icon: Heart, text: 'Unlimited favorites' },
  { icon: BarChart2, text: 'Listening insights' },
];

type PlanType = 'monthly' | 'lifetime';

// ── Success overlay ───────────────────────────────────────────────────────────

function SuccessOverlay({ onContinue }: { onContinue: () => void }) {
  const insets = useSafeAreaInsets();
  const crownScale = useSharedValue(0);
  const crownRotate = useSharedValue(-15);

  useEffect(() => {
    crownScale.value = withSpring(1, { damping: 12, stiffness: 180 });
    crownRotate.value = withSpring(0, { damping: 14, stiffness: 160 });
  }, []);

  const crownStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: crownScale.value },
      { rotate: `${crownRotate.value}deg` },
    ],
  }));

  return (
    <Animated.View entering={FadeIn.duration(250)} style={[StyleSheet.absoluteFill, styles.successOverlay]}>
      <LinearGradient colors={['#1a0a2e', '#0F0A1A', '#0A0A0A']} style={StyleSheet.absoluteFill} />

      <View style={[styles.successContent, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]}>
        {/* Crown */}
        <Animated.View style={[styles.successCrownWrap, crownStyle]}>
          <LinearGradient
            colors={['#F59E0B', '#8B5CF6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.successCrownGradient}
          >
            <Crown size={52} color="#fff" />
          </LinearGradient>
        </Animated.View>

        <Animated.Text entering={FadeIn.delay(200).duration(300)} style={styles.successTitle}>
          You're Vybe+
        </Animated.Text>
        <Animated.Text entering={FadeIn.delay(300).duration(300)} style={styles.successSubtitle}>
          Welcome to the good stuff.
        </Animated.Text>

        {/* Feature checks — mirrors the full Vybe+ benefit list from the
            paywall so the confirmation feels like a complete receipt of
            everything the user just unlocked. */}
        <Animated.View entering={FadeIn.delay(400).duration(300)} style={styles.successFeatures}>
          {[
            'No ads, ever',
            'Unlimited skips',
            'High quality audio',
            'Lossless when supported',
            'Offline downloads',
            'Early AI releases',
            'Exclusive releases',
            'Advanced discovery',
            'Artist radio stations',
            'Listening insights',
          ].map((f, i) => (
            <View key={i} style={styles.successFeatureRow}>
              <View style={styles.successCheck}>
                <Check size={14} color="#fff" strokeWidth={3} />
              </View>
              <Text style={styles.successFeatureText}>{f}</Text>
            </View>
          ))}
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={FadeIn.delay(550).duration(300)} style={styles.successCtaWrap}>
          <Pressable onPress={onContinue} style={styles.successCta}>
            <LinearGradient
              colors={['#8B5CF6', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.successCtaGradient}
            >
              <Text style={styles.successCtaText}>Start Listening</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// ── Pricing card ──────────────────────────────────────────────────────────────

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

// ── Main screen ───────────────────────────────────────────────────────────────

export default function UpgradeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const setTier = useSubscriptionStore(s => s.setTier);
  const setHasSeenPrompt = useUpgradePromptStore(s => s.setHasSeenPrompt);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('lifetime');
  const [packages, setPackages] = useState<VybePackages>({ monthly: null, lifetime: null });
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    getVybePackages()
      .then(setPackages)
      .finally(() => setIsLoading(false));
  }, []);

  const handleNotNow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHasSeenPrompt(true);
    router.back();
  };

  const grantPremium = () => {
    setTier('plus');
    setHasSeenPrompt(true);
    // Double haptic burst — impact then success notification
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 200);
    setShowSuccess(true);
  };

  const handleSubscribe = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const pkg = selectedPlan === 'lifetime' ? packages.lifetime : packages.monthly;

    if (!pkg) {
      // No RevenueCat products available
      showVybePopup({
        title: 'Store Unavailable',
        message: 'Could not load plans from the store. Please check your connection and try again.',
        type: 'error',
      });
      return;
    }

    setIsPurchasing(true);
    try {
      await purchasePackage(pkg);
      grantPremium();
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

      {/* Scrollable content + CTA all in one scroll view */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerSection}>
          <View style={styles.crownContainer}>
            <Crown size={36} color="#8B5CF6" />
          </View>
          <Text style={styles.title}>Try VYBE Plus</Text>
          <Text style={styles.subtitle}>break the loop</Text>
        </View>

        {/* Benefits — clean 2-col grid */}
        <View style={styles.benefitsGrid}>
          {BENEFITS.map((benefit, index) => (
            <View key={index} style={styles.benefitChip}>
              <benefit.icon size={15} color="#8B5CF6" />
              <Text style={styles.benefitChipText}>{benefit.text}</Text>
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

        {/* CTA button — inside scroll so it's never cut off */}
        <View style={styles.ctaSection}>
          <Pressable
            onPress={handleSubscribe}
            disabled={isPurchasing || isLoading}
            style={[styles.ctaButton, (isPurchasing || isLoading) && { opacity: 0.7 }]}
          >
            <LinearGradient
              colors={selectedPlan === 'lifetime' ? ['#E11D48', '#8B5CF6'] : ['#8B5CF6', '#6366F1']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradientButton}
            >
              {isPurchasing || isLoading ? (
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
      </ScrollView>

      {/* Success overlay */}
      {showSuccess && (
        <SuccessOverlay onContinue={() => router.back()} />
      )}
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
  headerSection: { alignItems: 'center', paddingTop: 16, paddingBottom: 16 },
  crownContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { color: '#FFFFFF', fontSize: 26, fontWeight: '700', letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { color: '#8B5CF6', fontSize: 15, fontWeight: '500' },
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  benefitChip: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  benefitChipText: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '500', flex: 1 },
  pricingSection: { gap: 8 },
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
    padding: 12,
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
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 0,
  },
  ctaSection: { marginTop: 16 },
  ctaButton: { borderRadius: 28, overflow: 'hidden' },
  ctaGradientButton: { height: 52, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  footerText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },

  // ── Success overlay ──────────────────────────────────────────────────────────
  successOverlay: { zIndex: 100 },
  successContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  successCrownWrap: { marginBottom: 28 },
  successCrownGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  successSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 17,
    marginBottom: 36,
  },
  successFeatures: {
    alignSelf: 'center',
    marginBottom: 28,
  },
  successFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  successCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  successFeatureText: { color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  successCtaWrap: { width: '100%' },
  successCta: { borderRadius: 28, overflow: 'hidden' },
  successCtaGradient: { height: 56, alignItems: 'center', justifyContent: 'center' },
  successCtaText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
});
