import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
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
import { useUpgradePromptStore } from '@/stores/upgradePromptStore';

// Fixed CTA button height
const CTA_BUTTON_HEIGHT = 56;
const CTA_CONTAINER_PADDING = 16;

const BENEFITS = [
  { icon: X, text: 'No ads' },
  { icon: Zap, text: 'Unlimited skips' },
  { icon: Music2, text: 'High quality audio' },
  { icon: Headphones, text: 'Lossless when supported' },
  { icon: Download, text: 'Offline downloads for VYBE music' },
  { icon: Sparkles, text: 'Early AI releases' },
  { icon: Crown, text: 'Advanced discovery' },
];

interface BenefitItemProps {
  Icon: typeof X;
  text: string;
}

function BenefitItem({ Icon, text }: BenefitItemProps) {
  return (
    <View style={styles.benefitItem}>
      <View style={styles.benefitIconContainer}>
        <Icon size={18} color="#8B5CF6" />
      </View>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

interface PricingCardProps {
  period: string;
  price: string;
  subtext: string;
  badge?: string;
  isSelected: boolean;
  onPress: () => void;
}

function PricingCard({ period, price, subtext, badge, isSelected, onPress }: PricingCardProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={[
        styles.pricingCard,
        isSelected && styles.pricingCardSelected,
      ]}
    >
      <View style={styles.pricingCardContent}>
        <View style={styles.pricingLeft}>
          <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
            {isSelected && <View style={styles.radioInner} />}
          </View>
          <View style={styles.pricingTextContainer}>
            <View style={styles.pricingTitleRow}>
              <Text style={styles.pricingPeriod}>{period}</Text>
              {badge && (
                <View style={styles.pricingBadge}>
                  <Text style={styles.pricingBadgeText}>{badge}</Text>
                </View>
              )}
            </View>
            <Text style={styles.pricingSubtext}>{subtext}</Text>
          </View>
        </View>
        <Text style={styles.pricingPrice}>{price}</Text>
      </View>
    </Pressable>
  );
}

export default function UpgradeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const setTier = useSubscriptionStore(s => s.setTier);
  const setHasSeenPrompt = useUpgradePromptStore(s => s.setHasSeenPrompt);
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly');

  // Calculate bottom padding for scroll content
  const bottomPadding = CTA_BUTTON_HEIGHT + CTA_CONTAINER_PADDING * 2 + insets.bottom + 24;

  const handleNotNow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTier('free');
    setHasSeenPrompt(true);
    router.replace('/(app)/(tabs)');
  };

  const handleSubscribe = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // In production, this would open Apple IAP
    // For now, mock the subscription
    setTier('plus');
    setHasSeenPrompt(true);
    router.replace('/(app)/(tabs)');
  };

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
        <View style={styles.topBarSpacer} />
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header section */}
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

        {/* Benefits list */}
        <View style={styles.benefitsContainer}>
          {BENEFITS.map((benefit, index) => (
            <BenefitItem
              key={index}
              Icon={benefit.icon}
              text={benefit.text}
            />
          ))}
        </View>

        {/* Pricing section */}
        <View style={styles.pricingSection}>
          <PricingCard
            period="Yearly"
            price="$49.99"
            subtext="$4.17/month"
            badge="Save 17%"
            isSelected={selectedPlan === 'yearly'}
            onPress={() => setSelectedPlan('yearly')}
          />
          <PricingCard
            period="Monthly"
            price="$4.99"
            subtext="per month"
            isSelected={selectedPlan === 'monthly'}
            onPress={() => setSelectedPlan('monthly')}
          />
        </View>
      </ScrollView>

      {/* Fixed CTA and footer */}
      <View
        style={[
          styles.ctaContainer,
          { paddingBottom: insets.bottom + CTA_CONTAINER_PADDING },
        ]}
      >
        {/* Gradient fade */}
        <LinearGradient
          colors={['transparent', '#0A0A0A']}
          style={styles.ctaGradient}
          pointerEvents="none"
        />

        {/* CTA Button */}
        <Pressable onPress={handleSubscribe} style={styles.ctaButton}>
          <LinearGradient
            colors={['#8B5CF6', '#6366F1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradientButton}
          >
            <Text style={styles.ctaText}>Start VYBE Plus</Text>
          </LinearGradient>
        </Pressable>

        {/* Footer microcopy */}
        <Text style={styles.footerText}>
          Free includes ads and limited skips.{'\n'}
          Downloads apply only to VYBE music.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  notNowText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '500',
  },
  topBarSpacer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  headerSection: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 32,
  },
  crownContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    color: '#8B5CF6',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  supportingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  benefitsContainer: {
    paddingBottom: 24,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  benefitIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  benefitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  pricingSection: {
    gap: 12,
  },
  pricingCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  pricingCardSelected: {
    borderColor: '#8B5CF6',
  },
  pricingCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  pricingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
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
  radioOuterSelected: {
    borderColor: '#8B5CF6',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#8B5CF6',
  },
  pricingTextContainer: {
    gap: 2,
  },
  pricingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pricingPeriod: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  pricingBadge: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pricingBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  pricingSubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
  },
  pricingPrice: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  ctaContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: CTA_CONTAINER_PADDING,
  },
  ctaGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 150,
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
  ctaText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  footerText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
