import React, { useCallback } from 'react';
import { Linking, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  PromoBanner,
  PROMO_BANNER_CAROUSEL_WIDTH,
  type PromoBannerProps,
} from '@/components/PromoBanner';

/** Canonical outbound URLs — swap when marketing domains change. */
export const PARTNER_PROMO_URLS = {
  wirelessKings: 'https://wirelesskings.com',
  mainstreetTees: 'https://mainstreettees.com',
  daVinciDynamics: 'https://davincidynamics.ai',
} as const;

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

export function WirelessKingsPromoBanner({
  style,
  testID,
}: {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const onCta = useCallback(() => openUrl(PARTNER_PROMO_URLS.wirelessKings), []);

  const background: PromoBannerProps['background'] = {
    kind: 'gradient',
    colors: ['#0A1628', '#0C0F14', '#050608'],
    locations: [0, 0.5, 1],
  };

  return (
    <PromoBanner
      testID={testID}
      style={style}
      eyebrow="Devices · plans · premium care"
      title="Wireless Kings"
      subtitle="Flagship handsets, honest rate talk, and bench repair — retail that respects the clock."
      footer="wirelesskings.com"
      background={background}
      ctaLabel="Get a Quote"
      onCtaPress={onCta}
      onBannerPress={onCta}
      ctaVariant="solid"
      leadingStripeColor="#38BDF8"
      ctaAccentColor="#E0F2FE"
    />
  );
}

export function MainstreetTeesPromoBanner({
  style,
  testID,
}: {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const onCta = useCallback(() => openUrl(PARTNER_PROMO_URLS.mainstreetTees), []);

  const background: PromoBannerProps['background'] = {
    kind: 'image',
    uri: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=900&q=80',
    overlayColors: ['rgba(18,16,14,0.35)', 'rgba(6,6,8,0.94)'],
    overlayLocations: [0, 1],
  };

  return (
    <PromoBanner
      testID={testID}
      style={style}
      eyebrow="Premium printing · apparel"
      title="Mainstreet Tees"
      subtitle="Garment-dyed blanks, honest ink, runs that hold up show after show."
      footer="Quality over noise."
      background={background}
      ctaLabel="Shop Now"
      onCtaPress={onCta}
      onBannerPress={onCta}
      ctaVariant="glass"
      leadingStripeColor="#D4A574"
      ctaAccentColor="#E8D5C4"
    />
  );
}

export function DaVinciDynamicsPromoBanner({
  style,
  testID,
}: {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const onCta = useCallback(() => openUrl(PARTNER_PROMO_URLS.daVinciDynamics), []);

  const background: PromoBannerProps['background'] = {
    kind: 'gradient',
    colors: ['#020208', '#0B0618', '#050508'],
    locations: [0, 0.45, 1],
  };

  return (
    <PromoBanner
      testID={testID}
      style={style}
      eyebrow="AI-native operations"
      title="DaVinciDynamics.AI"
      subtitle="Inference at the edge — orchestration, guardrails, and rollout you can measure."
      footer="Deploy. Observe. Iterate."
      background={background}
      ctaLabel="Access Now"
      onCtaPress={onCta}
      onBannerPress={onCta}
      ctaVariant="outline"
      leadingStripeColor="#22D3EE"
      ctaAccentColor="#67E8F9"
    />
  );
}

/**
 * Horizontal strip with snap — set each banner `style={{ width: PROMO_BANNER_CAROUSEL_WIDTH }}` (default export width).
 * Parent should allow height to shrink-wrap (`alignSelf: 'stretch'` on ScrollView).
 */
export function PartnerPromoBannersCarousel({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  const cardStyle: StyleProp<ViewStyle> = {
    width: PROMO_BANNER_CAROUSEL_WIDTH,
    marginRight: 12,
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={PROMO_BANNER_CAROUSEL_WIDTH + 12}
      snapToAlignment="start"
      style={[{ flexGrow: 0 }, style]}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}
    >
      <WirelessKingsPromoBanner style={cardStyle} testID="partner-banner-wireless-kings" />
      <MainstreetTeesPromoBanner style={cardStyle} testID="partner-banner-mainstreet" />
      <DaVinciDynamicsPromoBanner style={cardStyle} testID="partner-banner-davinci" />
    </ScrollView>
  );
}

/** Vertical stack for feeds — full-width cards. */
export function PartnerPromoBannersStack({
  style,
}: {
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: 12, paddingHorizontal: 16 }, style]}>
      <WirelessKingsPromoBanner testID="partner-banner-wireless-kings" />
      <MainstreetTeesPromoBanner testID="partner-banner-mainstreet" />
      <DaVinciDynamicsPromoBanner testID="partner-banner-davinci" />
    </View>
  );
}
