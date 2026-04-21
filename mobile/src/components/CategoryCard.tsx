import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, Platform, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolateColor } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import {
  AudioWaveform,
  Mic2,
  Speaker,
  Heart,
  Guitar,
  Piano,
  Headphones,
  Sparkles,
  History,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Category } from '@/types/music';
import { GenreSaxophoneIcon } from '@/components/genre/GenreSaxophoneIcon';
import { GenreBroadcastTowerIcon } from '@/components/genre/GenreBroadcastTowerIcon';
import { CATEGORY_TILE_GRADIENT, VIBRANT_BLUE } from '@/constants/machinedTheme';

type IconComp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const BORDER_COLOR = 'rgba(0,229,255,0.18)';

const PRESS_TIMING_IN = { duration: 110 };
const PRESS_TIMING_OUT = { duration: 220 };

/** Icon drawn ~12% smaller than before so neon shadow fits inside the card without clipping. */
const GENRE_ICON_SIZE = 24;
const GENRE_ICON_SIZE_COMPACT = 20;

type GenreVisual = { Icon: IconComp; neon: string };

function getGenreVisual(category: Category): GenreVisual {
  const neon = VIBRANT_BLUE;
  switch (category.id) {
    case 'c1':
      return { Icon: AudioWaveform, neon };
    case 'c2':
      return { Icon: Mic2, neon };
    case 'c3':
      return { Icon: Speaker, neon };
    case 'c4':
      return { Icon: Heart, neon };
    case 'c5':
      return { Icon: Guitar, neon };
    case 'c6':
      return { Icon: GenreSaxophoneIcon, neon };
    case 'c7':
      return { Icon: Piano, neon };
    case 'c8':
      return { Icon: Headphones, neon };
    case 'c9':
      return { Icon: Sparkles, neon };
    case 'c10':
      return { Icon: History, neon };
    case 'c11':
      return { Icon: GenreBroadcastTowerIcon, neon };
    default:
      return { Icon: AudioWaveform, neon };
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
  /** Fixed browse grid: outer cell height (fills cell minus margins). */
  lockedTileHeight?: number;
}

export function CategoryCard({ category, onPress, lockedTileHeight }: CategoryCardProps) {
  const pressed = useSharedValue(0);
  const { Icon, neon } = getGenreVisual(category);
  const iconSize = lockedTileHeight ? GENRE_ICON_SIZE_COMPACT : GENRE_ICON_SIZE;

  const cardAnimatedStyle = useAnimatedStyle(() => {
    const borderColor = interpolateColor(pressed.value, [0, 1], [BORDER_COLOR, neon]);
    return {
      borderColor,
      shadowColor: neon,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.1 + pressed.value * 0.55,
      shadowRadius: 8 + pressed.value * 12,
      elevation: Platform.OS === 'android' ? 2 + pressed.value * 6 : 0,
    };
  });

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => {
        pressed.value = withTiming(1, PRESS_TIMING_IN);
      }}
      onPressOut={() => {
        pressed.value = withTiming(0, PRESS_TIMING_OUT);
      }}
      style={[styles.pressable, lockedTileHeight ? { flex: 1, margin: 4 } : null]}
    >
      <Animated.View
        style={[
          styles.card,
          lockedTileHeight != null
            ? {
                height: Math.max(52, lockedTileHeight - 8),
                paddingTop: 6,
                paddingBottom: 8,
                paddingLeft: 10,
                paddingRight: 10,
              }
            : null,
          cardAnimatedStyle,
        ]}
      >
        <LinearGradient
          colors={[...CATEGORY_TILE_GRADIENT]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardGradient}
        />
        <View style={styles.cardGrainClip} pointerEvents="none">
          <GrainNoise layoutId={category.id} />
        </View>
        {lockedTileHeight != null ? (
          <View style={styles.iconColumnLocked}>
            <View style={[styles.iconGlowHost, { shadowColor: neon }]}>
              <Icon size={iconSize} color={neon} strokeWidth={1.5} />
            </View>
            <Text style={styles.genreTitleBrowseGrid} numberOfLines={2}>
              {category.name}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.iconArea}>
              <View style={[styles.iconGlowHost, { shadowColor: neon }]}>
                <Icon size={iconSize} color={neon} strokeWidth={1.65} />
              </View>
            </View>
            <Text style={styles.genreTitle} numberOfLines={1}>
              {category.name}
            </Text>
          </>
        )}
      </Animated.View>
    </Pressable>
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
    backgroundColor: '#020508',
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    overflow: 'visible',
    paddingLeft: 14,
    paddingRight: 14,
    paddingBottom: 12,
    paddingTop: 8,
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
  },
  cardGrainClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 10,
    overflow: 'hidden',
  },
  iconArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 2,
  },
  /** Browse All grid — icon stacked above label, centered column. */
  iconColumnLocked: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 4,
  },
  iconGlowHost: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
    backgroundColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.42,
    shadowRadius: 9,
    ...(Platform.OS === 'android' ? { elevation: 5 } : {}),
  },
  genreTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  genreTitleCompact: {
    fontSize: 13,
    letterSpacing: -0.35,
    marginTop: 0,
  },
  /** 12pt Small Caps (geometric) — 0.8 opacity, centered under icon. */
  genreTitleBrowseGrid: {
    color: '#FFFFFF',
    opacity: 0.8,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontVariant: Platform.OS === 'ios' ? ['small-caps'] : undefined,
    textAlign: 'center',
    width: '100%',
    marginTop: 8,
  },
});
