import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
  type ColorValue,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { ArrowUpRight } from 'lucide-react-native';
import { vybe } from '@/theme/vybeTokens';

const { width: SCREEN_W } = Dimensions.get('window');

/** Default width for horizontal carousels — parent can override via `style`. */
export const PROMO_BANNER_CAROUSEL_WIDTH = Math.min(SCREEN_W * 0.88, 400);

const SPRING = { damping: 18, stiffness: 260, mass: 0.4 };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type LinearGradientColors = readonly [ColorValue, ColorValue, ...ColorValue[]];
type LinearGradientLocations = readonly [number, number, ...number[]];

export type PromoBannerBackground =
  | {
      kind: 'gradient';
      colors: readonly string[];
      locations?: readonly number[];
      angle?: number;
    }
  | {
      kind: 'solid';
      color: string;
    }
  | {
      kind: 'image';
      uri: string;
      /** Dark gradient overlay — first = top/leading, last = bottom. */
      overlayColors?: readonly string[];
      overlayLocations?: readonly number[];
    };

export type PromoBannerCtaVariant = 'glass' | 'solid' | 'outline';

export interface PromoBannerProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  footer?: string;
  background: PromoBannerBackground;
  ctaLabel: string;
  onCtaPress: () => void;
  /** Entire card is pressable when set (e.g. same as CTA). */
  onBannerPress?: () => void;
  ctaVariant?: PromoBannerCtaVariant;
  /** Left edge stripe — industrial / tech accent. */
  leadingStripeColor?: string;
  /** CTA text + icon tint for solid/outline variants. */
  ctaAccentColor?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

function PromoBannerInner({
  eyebrow,
  title,
  subtitle,
  footer,
  ctaLabel,
  onCtaPress,
  ctaVariant = 'solid',
  leadingStripeColor,
  ctaAccentColor = vybe.text.primary,
}: Omit<PromoBannerProps, 'background' | 'style' | 'onBannerPress' | 'testID'>) {
  const accent = ctaAccentColor;

  const renderCta = (pressed: boolean) => {
    const iconColor =
      ctaVariant === 'solid' ? (accent === '#0A0A0A' ? vybe.text.primary : '#0A0A0A') : accent;

    const labelColor =
      ctaVariant === 'solid'
        ? accent === '#0A0A0A'
          ? vybe.text.primary
          : '#0A0A0A'
        : vybe.text.primary;

    const inner = (
      <View style={styles.ctaRow}>
        <Text
          style={[
            styles.ctaLabel,
            { color: labelColor },
            ctaVariant === 'glass' && { color: vybe.text.primary },
          ]}
        >
          {ctaLabel}
        </Text>
        <ArrowUpRight color={ctaVariant === 'glass' ? vybe.text.primary : iconColor} size={18} strokeWidth={2.25} />
      </View>
    );

    if (ctaVariant === 'glass') {
      return (
        <BlurView intensity={28} tint="dark" style={styles.ctaBlur}>
          {inner}
        </BlurView>
      );
    }

    if (ctaVariant === 'outline') {
      return (
        <View style={[styles.ctaOutline, { borderColor: `${accent}99` }]}>
          {inner}
        </View>
      );
    }

    return (
      <View
        style={[
          styles.ctaSolid,
          {
            backgroundColor: accent,
            shadowColor: accent,
            shadowOpacity: pressed ? 0.55 : 0.35,
            shadowRadius: pressed ? 14 : 10,
          },
        ]}
      >
        {inner}
      </View>
    );
  };

  return (
    <View style={styles.innerColumn}>
      <View style={styles.topRow}>
        {leadingStripeColor ? (
          <View style={[styles.stripe, { backgroundColor: leadingStripeColor }]} />
        ) : null}

        <View style={styles.copyBlock}>
          {eyebrow ? (
            <Text style={styles.eyebrow} numberOfLines={1}>
              {eyebrow}
            </Text>
          ) : null}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={3}>
              {subtitle}
            </Text>
          ) : null}
          {footer ? (
            <Text style={styles.footer} numberOfLines={1}>
              {footer}
            </Text>
          ) : null}
        </View>
      </View>

      <CtaPressable onCtaPress={onCtaPress} ctaVariant={ctaVariant} renderCta={renderCta} />
    </View>
  );
}

function CtaPressable({
  onCtaPress,
  ctaVariant,
  renderCta,
}: {
  onCtaPress: () => void;
  ctaVariant: PromoBannerCtaVariant;
  renderCta: (pressed: boolean) => React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    shadowOpacity: 0.2 + glow.value * 0.25,
  }));

  const onPressIn = useCallback(() => {
    scale.value = withSpring(1.03, SPRING);
    glow.value = withSpring(1, SPRING);
  }, [glow, scale]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, SPRING);
    glow.value = withSpring(0, SPRING);
  }, [glow, scale]);

  return (
    <AnimatedPressable
      onPress={onCtaPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[styles.ctaWrap, animatedStyle]}
    >
      {(state) => renderCta(state.pressed)}
    </AnimatedPressable>
  );
}

export function PromoBanner({
  eyebrow,
  title,
  subtitle,
  footer,
  background,
  ctaLabel,
  onCtaPress,
  onBannerPress,
  ctaVariant = 'solid',
  leadingStripeColor,
  ctaAccentColor,
  style,
  testID,
}: PromoBannerProps) {
  const cardScale = useSharedValue(1);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const onCardIn = useCallback(() => {
    cardScale.value = withSpring(0.985, SPRING);
  }, [cardScale]);

  const onCardOut = useCallback(() => {
    cardScale.value = withSpring(1, SPRING);
  }, [cardScale]);

  const handleCta = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCtaPress();
  }, [onCtaPress]);

  const content = (
    <PromoBannerInner
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      footer={footer}
      ctaLabel={ctaLabel}
      onCtaPress={handleCta}
      ctaVariant={ctaVariant}
      leadingStripeColor={leadingStripeColor}
      ctaAccentColor={ctaAccentColor}
    />
  );

  if (background.kind === 'gradient') {
    return (
      <Animated.View style={[styles.cardOuter, cardStyle, style]} testID={testID}>
        <Pressable
          onPress={onBannerPress}
          onPressIn={onCardIn}
          onPressOut={onCardOut}
          disabled={!onBannerPress}
          style={styles.pressFill}
        >
          <LinearGradient
            colors={background.colors as unknown as LinearGradientColors}
            locations={
              background.locations
                ? (background.locations as unknown as LinearGradientLocations)
                : undefined
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientFill}
          >
            {content}
          </LinearGradient>
        </Pressable>
      </Animated.View>
    );
  }

  if (background.kind === 'solid') {
    return (
      <Animated.View style={[styles.cardOuter, cardStyle, style]} testID={testID}>
        <Pressable
          onPress={onBannerPress}
          onPressIn={onCardIn}
          onPressOut={onCardOut}
          disabled={!onBannerPress}
          style={[styles.pressFill, styles.solidFill, { backgroundColor: background.color }]}
        >
          {content}
        </Pressable>
      </Animated.View>
    );
  }

  const overlay =
    background.overlayColors ?? ['rgba(0,0,0,0.45)', 'rgba(5,5,8,0.92)'];

  return (
    <Animated.View style={[styles.cardOuter, cardStyle, style]} testID={testID}>
      <Pressable
        onPress={onBannerPress}
        onPressIn={onCardIn}
        onPressOut={onCardOut}
        disabled={!onBannerPress}
        style={styles.imageShell}
      >
        <Image
          source={{ uri: background.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
        <LinearGradient
          colors={overlay as unknown as LinearGradientColors}
          locations={
            (background.overlayLocations
              ? background.overlayLocations
              : ([0, 1] as const)) as unknown as LinearGradientLocations
          }
          style={StyleSheet.absoluteFill}
        />
        {content}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: vybe.border.crisp,
  },
  pressFill: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  solidFill: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    minHeight: 168,
  },
  gradientFill: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    minHeight: 168,
  },
  imageShell: {
    minHeight: 168,
    paddingVertical: 18,
    paddingHorizontal: 16,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: 14,
  },
  innerColumn: {
    flex: 1,
    gap: 14,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  stripe: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 2,
    opacity: 0.95,
  },
  copyBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 6,
  },
  eyebrow: {
    color: vybe.text.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: vybe.text.primary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 24,
  },
  subtitle: {
    color: vybe.text.secondary,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    letterSpacing: -0.1,
  },
  footer: {
    marginTop: 2,
    color: vybe.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  ctaWrap: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  ctaBlur: {
    borderRadius: 999,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: vybe.border.crisp,
  },
  ctaOutline: {
    borderRadius: 999,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: vybe.glass.fill,
  },
  ctaSolid: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    elevation: 4,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  ctaLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
