import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

/** Full-screen blurred artwork (YouTube Music–style) + OLED veil + bottom scrim only. */
const BLUR_RADIUS = 82;
const OLED_VEIL = 'rgba(0,0,0,0.6)';
const CROSSFADE_MS = 520;
const IMAGE_BLEED = 1.14;

type Props = {
  artworkUri: string;
};

export function AnimatedArtworkBackground({ artworkUri }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const iw = W * IMAGE_BLEED;
  const ih = H * IMAGE_BLEED;

  const [backUri, setBackUri] = useState(artworkUri);
  const [frontUri, setFrontUri] = useState<string | null>(null);
  const frontOpacity = useSharedValue(0);
  const fadeGeneration = useRef(0);
  const initial = useRef(true);
  const lastAppliedRef = useRef<string | null>(null);
  const latestUriRef = useRef(artworkUri);
  latestUriRef.current = artworkUri;

  const frontStyle = useAnimatedStyle(() => ({
    opacity: frontOpacity.value,
  }));

  const commitCrossfade = useCallback((generation: number) => {
    if (generation !== fadeGeneration.current) return;
    const target = latestUriRef.current;
    lastAppliedRef.current = target;
    setBackUri(target);
    setFrontUri(null);
    frontOpacity.value = 0;
  }, [frontOpacity]);

  useEffect(() => {
    if (!artworkUri) return;

    if (initial.current) {
      initial.current = false;
      lastAppliedRef.current = artworkUri;
      setBackUri(artworkUri);
      setFrontUri(null);
      frontOpacity.value = 0;
      return;
    }

    if (artworkUri === lastAppliedRef.current) return;

    const gen = ++fadeGeneration.current;
    setFrontUri(artworkUri);
    frontOpacity.value = 0;
    frontOpacity.value = withTiming(
      1,
      { duration: CROSSFADE_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (!finished) return;
        runOnJS(commitCrossfade)(gen);
      },
    );
  }, [artworkUri, commitCrossfade, frontOpacity]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]} />

      <View
        style={{
          position: 'absolute',
          width: iw,
          height: ih,
          left: (W - iw) / 2,
          top: (H - ih) / 2,
          overflow: 'hidden',
        }}
      >
        <Image
          source={{ uri: backUri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={BLUR_RADIUS}
          transition={0}
        />
        {frontUri ? (
          <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>
            <Image
              source={{ uri: frontUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              blurRadius={BLUR_RADIUS}
              transition={0}
            />
          </Animated.View>
        ) : null}
      </View>

      <View style={[StyleSheet.absoluteFill, { backgroundColor: OLED_VEIL }]} />

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.92)']}
        locations={[0, 0.45, 1]}
        style={styles.bottomScrim}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 240,
  },
});
