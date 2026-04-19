import React from 'react';
import { Text, type TextProps, type StyleProp, type TextStyle, StyleSheet, Platform } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { VIBRANT_BLUE, MACHINED_BLUE_MID, SHADOW_BLUE } from '@/constants/machinedTheme';

type Props = TextProps & {
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  /** Soft cyan bloom behind the glyph mask (iOS-optimized). */
  neonGlow?: boolean;
};

/**
 * Headline text filled with a cyan → blue “machined” gradient (library headers, social section titles).
 */
const neonMaskExtra = Platform.select({
  ios: {
    textShadowColor: `${VIBRANT_BLUE}99`,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  default: {},
});

export function MachinedGradientText({ style, children, neonGlow, ...textProps }: Props) {
  const maskStyle = [styles.maskText, neonGlow ? neonMaskExtra : null, style];
  return (
    <MaskedView
      maskElement={
        <Text {...textProps} style={maskStyle}>
          {children}
        </Text>
      }
    >
      <LinearGradient
        colors={[VIBRANT_BLUE, MACHINED_BLUE_MID, SHADOW_BLUE]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBox}
      >
        <Text {...textProps} style={[styles.invisible, style]}>
          {children}
        </Text>
      </LinearGradient>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  maskText: {
    backgroundColor: 'transparent',
  },
  invisible: {
    opacity: 0,
  },
  gradientBox: {
    alignSelf: 'flex-start',
  },
});
