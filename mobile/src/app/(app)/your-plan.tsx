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
import type { LucideIcon } from 'lucide-react-native';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { VybePlusWordmark } from '@/components/VybePlusWordmark';
import { OLED_BLACK, VIBRANT_BLUE, NAV_BAR_PURPLE } from '@/constants/machinedTheme';

const CTA_BUTTON_HEIGHT = 56;
const CTA_CONTAINER_PADDING = 16;

const CYAN_BORDER = 'rgba(0,229,255,0.45)' as const;

const BENEFIT_ROWS: Array<{ key: string; Icon: LucideIcon; text: string }> = [
  { key: 'ads', Icon: X, text: 'No ads' },
  { key: 'skip', Icon: Zap, text: 'Unlimited skips' },
  { key: 'hq', Icon: Music2, text: 'High quality audio' },
  { key: 'loss', Icon: Headphones, text: 'Lossless when supported' },
  { key: 'vault', Icon: Download, text: 'Vault import for VYBE music' },
  { key: 'ai', Icon: Sparkles, text: 'Early AI releases' },
  { key: 'disc', Icon: Crown, text: 'Advanced discovery' },
];

function BenefitCard({ Icon, text }: { Icon: LucideIcon; text: string }) {
  return (
    <View style={planStyles.benefitCard}>
      <View style={planStyles.benefitIconShell}>
        <Icon size={18} color={NAV_BAR_PURPLE} strokeWidth={2} />
      </View>
      <Text style={planStyles.benefitText}>{text}</Text>
    </View>
  );
}

function BenefitGrid() {
  const rows: Array<typeof BENEFIT_ROWS> = [];
  for (let i = 0; i < BENEFIT_ROWS.length; i += 2) {
    rows.push(BENEFIT_ROWS.slice(i, i + 2));
  }
  return (
    <View>
      {rows.map((row) => (
        <View key={row.map((r) => r.key).join('-')} style={planStyles.gridRow}>
          {row.map((b) => (
            <BenefitCard key={b.key} Icon={b.Icon} text={b.text} />
          ))}
          {row.length === 1 ? <View style={planStyles.gridCellSpacer} /> : null}
        </View>
      ))}
    </View>
  );
}

function PricingCard({
  period,
  price,
  perMonth,
  savings,
  isSelected,
  onPress,
}: {
  period: string;
  price: string;
  perMonth?: string;
  savings?: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={[
        planStyles.pricingCard,
        {
          borderWidth: isSelected ? 2 : 1,
          borderColor: isSelected ? VIBRANT_BLUE : CYAN_BORDER,
        },
      ]}
    >
      <View style={planStyles.pricingInner}>
        {savings ? (
          <View style={planStyles.savingsPill}>
            <Text style={planStyles.savingsPillText}>{savings}</Text>
          </View>
        ) : null}
        <Text style={planStyles.pricingPeriod}>{period}</Text>
        <Text style={planStyles.pricingPrice}>{price}</Text>
        {perMonth ? <Text style={planStyles.pricingPer}>{perMonth}</Text> : null}
        {isSelected ? (
          <View style={planStyles.selectedDot}>
            <Check size={14} color={OLED_BLACK} strokeWidth={3} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function YourPlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tier = useSubscriptionStore((s) => s.tier);
  const setTier = useSubscriptionStore((s) => s.setTier);
  const [selectedPlan, setSelectedPlan] = React.useState<'monthly' | 'yearly'>('yearly');

  const isPlus = tier === 'plus';

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
    <View style={planStyles.screen}>
      <View style={[planStyles.header, { paddingTop: insets.top }]}>
        <View style={planStyles.headerRow}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={planStyles.backBtn}
          >
            <ChevronLeft size={28} color="#fff" />
          </Pressable>
          <Text style={planStyles.headerTitle}>YOUR PLAN</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={planStyles.hero}>
          <View
            style={[
              planStyles.crownRing,
              isPlus ? planStyles.crownRingPlus : planStyles.crownRingFree,
            ]}
          >
            <Crown size={36} color="#fff" strokeWidth={2} />
          </View>
          {isPlus ? (
            <View style={planStyles.plusLine}>
              <Text style={planStyles.heroPrimary}>You&apos;re subscribed to </Text>
              <VybePlusWordmark variant="inline" withPlusGlow={false} />
            </View>
          ) : (
            <Text style={planStyles.heroPrimary}>You&apos;re on the Free plan</Text>
          )}
          <Text style={planStyles.heroSub}>
            {isPlus ? 'Renews on March 8, 2026' : 'Listen with ads and limited skips.'}
          </Text>
        </View>
      </View>

      <ScrollView
        style={planStyles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {isPlus ? (
          <View style={planStyles.section}>
            <Text style={planStyles.sectionLabel}>YOUR BENEFITS</Text>
            <BenefitGrid />

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              style={planStyles.manageBtn}
            >
              <Text style={planStyles.manageBtnText}>Manage Plan</Text>
            </Pressable>

            <Pressable onPress={handleCancelPlan} style={planStyles.cancelBtn}>
              <Text style={planStyles.cancelBtnText}>Cancel Plan</Text>
            </Pressable>
          </View>
        ) : (
          <View style={planStyles.section}>
            <View style={planStyles.wordmarkBlock}>
              <VybePlusWordmark variant="hero" />
              <Text style={planStyles.tagline}>
                break the loop · Vybe+ unlocks the Vault
              </Text>
            </View>

            <Text style={[planStyles.sectionLabel, { marginTop: 8 }]}>INCLUDED</Text>
            <BenefitGrid />

            <Text style={[planStyles.sectionLabel, { marginTop: 22 }]}>CHOOSE BILLING</Text>
            <View style={planStyles.pricingGrid}>
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

            <Text style={planStyles.legal}>
              Downloads apply only to VYBE licensed content. Subscription automatically renews unless canceled at least 24 hours before the end of the current period.
            </Text>
          </View>
        )}
      </ScrollView>

      {!isPlus && (
        <View
          style={[
            planStyles.ctaWrap,
            { paddingBottom: insets.bottom + CTA_CONTAINER_PADDING },
          ]}
        >
          <View style={planStyles.ctaFade} pointerEvents="none" />
          <Pressable onPress={handleSubscribe} style={planStyles.ctaPress}>
            <View style={planStyles.ctaSolid}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={planStyles.ctaSolidText}>Start </Text>
                <VybePlusWordmark variant="inline" vybeColor={OLED_BLACK} plusColor={OLED_BLACK} />
              </View>
            </View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const planStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: OLED_BLACK,
  },
  header: {
    backgroundColor: OLED_BLACK,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3,
  },
  hero: {
    alignItems: 'center',
    paddingBottom: 28,
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  crownRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  crownRingPlus: {
    borderWidth: 1,
    borderColor: VIBRANT_BLUE,
    backgroundColor: 'rgba(0,229,255,0.08)',
  },
  crownRingFree: {
    borderWidth: 1,
    borderColor: CYAN_BORDER,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  plusLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'baseline',
  },
  heroPrimary: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  heroSub: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 6,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 22,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.2,
    marginBottom: 12,
  },
  wordmarkBlock: {
    alignItems: 'center',
    marginBottom: 20,
  },
  tagline: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
    lineHeight: 22,
  },
  gridRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  benefitCard: {
    flex: 1,
    minHeight: 108,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CYAN_BORDER,
    backgroundColor: OLED_BLACK,
    padding: 14,
    justifyContent: 'space-between',
  },
  benefitIconShell: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 10,
  },
  gridCellSpacer: {
    flex: 1,
  },
  pricingGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  pricingCard: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: OLED_BLACK,
  },
  pricingInner: {
    padding: 16,
    minHeight: 120,
  },
  savingsPill: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderBottomLeftRadius: 10,
    borderWidth: 1,
    borderColor: VIBRANT_BLUE,
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  savingsPillText: {
    color: VIBRANT_BLUE,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  pricingPeriod: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
  },
  pricingPrice: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 6,
    letterSpacing: -0.5,
  },
  pricingPer: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  selectedDot: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: VIBRANT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legal: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
    marginTop: 8,
  },
  manageBtn: {
    marginTop: 22,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CYAN_BORDER,
    backgroundColor: OLED_BLACK,
  },
  manageBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  cancelBtn: {
    marginTop: 10,
    paddingVertical: 14,
  },
  cancelBtnText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  ctaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: CTA_CONTAINER_PADDING,
  },
  ctaFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  ctaPress: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  ctaSolid: {
    height: CTA_BUTTON_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VIBRANT_BLUE,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.85)',
  },
  ctaSolidText: {
    color: OLED_BLACK,
    fontSize: 18,
    fontWeight: '900',
  },
});
