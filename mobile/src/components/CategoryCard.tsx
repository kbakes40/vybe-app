import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Platform, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import {
  AudioWaveform,
  Mic2,
  Speaker,
  Heart,
  Guitar,
  Wind,
  Piano,
  Headphones,
  Sparkles,
  History,
} from 'lucide-react-native';
import { Category } from '@/types/music';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type IconComp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const CARD_BG = '#0A0A0A';
const BORDER_COLOR = 'rgba(255,255,255,0.1)';

const SPRING = { damping: 16, stiffness: 380 };

type GenreVisual = { Icon: IconComp; neon: string };

function getGenreVisual(category: Category): GenreVisual {
  switch (category.id) {
    case 'c1':
      return { Icon: AudioWaveform, neon: '#22D3EE' }; // Pop — cyan
    case 'c2':
      return { Icon: Mic2, neon: '#FBBF24' }; // Hip-Hop — amber
    case 'c3':
      return { Icon: Speaker, neon: '#E879F9' }; // Electronic — magenta
    case 'c4':
      return { Icon: Heart, neon: '#FB7185' }; // R&B
    case 'c5':
      return { Icon: Guitar, neon: '#F87171' }; // Rock
    case 'c6':
      return { Icon: Wind, neon: '#F59E0B' }; // Jazz — breathy / brass
    case 'c7':
      return { Icon: Piano, neon: '#A78BFA' }; // Classical
    case 'c8':
      return { Icon: Headphones, neon: '#2DD4BF' }; // Lo-Fi
    case 'c9':
      return { Icon: Sparkles, neon: '#C084FC' }; // AI
    case 'c10':
      return { Icon: History, neon: '#FB923C' }; // Throwbacks
    default:
      return { Icon: AudioWaveform, neon: '#94A3B8' };
  }
}

function GrainNoise({ layoutId }: { layoutId: string }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setSize({ w: width, h: height });
  }, []);
  const pid = `grain-${layoutId.replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {size.w > 0 ? (
        <Svg width={size.w} height={size.h}>
          <Defs>
            {/* Tight 64×64 tile — tiny memory footprint vs full-bleed noise bitmaps */}
            <Pattern id={pid} patternUnits="userSpaceOnUse" width={64} height={64}>
              <Rect width={64} height={64} fill="rgba(255,255,255,0.012)" />
              <Rect x={3} y={7} width={1} height={1} fill="#FFFFFF" opacity={0.06} />
              <Rect x={19} y={22} width={1} height={1} fill="#FFFFFF" opacity={0.05} />
              <Rect x={41} y={11} width={1} height={1} fill="#FFFFFF" opacity={0.055} />
              <Rect x={52} y={38} width={1} height={1} fill="#FFFFFF" opacity={0.045} />
              <Rect x={27} y={55} width={1} height={1} fill="#FFFFFF" opacity={0.05} />
              <Rect x={8} y={44} width={1} height={1} fill="#FFFFFF" opacity={0.04} />
            </Pattern>
          </Defs>
          <Rect width={size.w} height={size.h} fill={`url(#${pid})`} />
        </Svg>
      ) : null}
    </View>
  );
}

interface CategoryCardProps {
  category: Category;
  onPress: () => void;
}

export function CategoryCard({ category, onPress }: CategoryCardProps) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const { Icon, neon } = getGenreVisual(category);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowAnimatedStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.38 + 0.42 * glow.value,
    shadowRadius: 8 + 5 * glow.value,
    ...(Platform.OS === 'android' ? { elevation: 4 + 7 * glow.value } : {}),
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.96, SPRING);
        glow.value = withTiming(1, { duration: 110 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
        glow.value = withTiming(0, { duration: 220 });
      }}
      style={[styles.pressable, cardAnimatedStyle]}
    >
      <View style={styles.card}>
        <GrainNoise layoutId={category.id} />
        <View style={styles.iconArea}>
          <Animated.View style={[styles.iconGlowHost, { shadowColor: neon }, glowAnimatedStyle]}>
            <Icon size={28} color={neon} strokeWidth={1.65} />
          </Animated.View>
        </View>
        <Text style={styles.genreTitle} numberOfLines={1}>
          {category.name}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    margin: 4,
  },
  card: {
    height: 108,
    borderRadius: 10,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    overflow: 'hidden',
    paddingLeft: 14,
    paddingRight: 14,
    paddingBottom: 14,
    paddingTop: 10,
  },
  iconArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlowHost: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    backgroundColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
  },
  genreTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
});
