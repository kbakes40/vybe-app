import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageProps } from 'expo-image';

/** Global Shadow polish: ~20% neutral wash so magenta / neon chrome reads louder. */
export const SHADOW_ART_DESAT_STRENGTH = 0.2;

export type ShadowArtworkImageProps = ImageProps & {
  containerStyle?: StyleProp<ViewStyle>;
  /** Opt out of the global wash (rare). */
  noDesaturate?: boolean;
};

/**
 * Album / track artwork with a subtle grayscale blend. Outer `style` should
 * define size + `borderRadius` (overflow hidden clips the bitmap + wash).
 */
export function ShadowArtworkImage({
  style,
  containerStyle,
  noDesaturate,
  ...rest
}: ShadowArtworkImageProps) {
  return (
    <View style={[style, styles.clip, containerStyle]}>
      <Image {...rest} style={StyleSheet.absoluteFillObject} />
      {!noDesaturate ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: `rgba(138, 138, 146, ${SHADOW_ART_DESAT_STRENGTH})` },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
});
