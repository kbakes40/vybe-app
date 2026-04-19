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
  const uri =
    typeof rest.source === 'object' &&
    rest.source !== null &&
    'uri' in rest.source &&
    typeof (rest.source as { uri?: string }).uri === 'string'
      ? (rest.source as { uri: string }).uri
      : '';
  const isRemoteHttps = /^https?:\/\//i.test(uri);
  const imageProps =
    isRemoteHttps && !rest.cachePolicy
      ? {
          ...rest,
          cachePolicy: 'memory-disk' as const,
          recyclingKey: uri,
        }
      : rest;

  return (
    <View style={[style, styles.clip, containerStyle]}>
      <Image {...imageProps} style={StyleSheet.absoluteFillObject} />
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
