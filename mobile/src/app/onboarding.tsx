import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  ImageBackground,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  interpolateColor,
  withTiming,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/lib/api/api';
import {
  hasOnboardingCompleted,
  ONBOARDING_VIBES_STORAGE_KEY,
} from '@/lib/auth/postAuthDestination';
import { vybe } from '@/theme/vybeTokens';
import { useFireMixStore } from '@/stores/fireMixStore';

const NEON_CYAN = '#00FFFF';
const BABY_BLUE_FLASH = 'rgba(159, 217, 255, 0.72)';
const OLED_BLACK = '#000000';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_W = (SCREEN_W - 40 - CARD_GAP) / 2;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type VybeStyle = {
  id: string;
  label: string;
  sub: string;
  image: string;
};

/** Editorial stills — mock only */
const VYBE_STYLES: VybeStyle[] = [
  {
    id: 'noir',
    label: 'NOIR',
    sub: 'Late tape & shadow',
    image:
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'signal',
    label: 'SIGNAL',
    sub: 'Raw electronic edge',
    image:
      'https://images.unsplash.com/photo-1493225456754-c90083d1e38e?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'concrete',
    label: 'CONCRETE',
    sub: 'Hip-hop & grit',
    image:
      'https://images.unsplash.com/photo-1571266020443-e4d877b93725?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'still',
    label: 'STILL',
    sub: 'Ambient focus',
    image:
      'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'burn',
    label: 'BURN',
    sub: 'Rock & overload',
    image:
      'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=900&q=80',
  },
  {
    id: 'pulse',
    label: 'PULSE',
    sub: 'Pop precision',
    image:
      'https://images.unsplash.com/photo-1511379938547-cbf895f0c4a1?auto=format&fit=crop&w=900&q=80',
  },
];

function StyleCard({
  item,
  selected,
  flashNonce,
  onToggle,
}: {
  item: VybeStyle;
  selected: boolean;
  flashNonce: number;
  onToggle: () => void;
}) {
  const pressed = useSharedValue(selected ? 1 : 0);
  const flashOverlay = useSharedValue(0);

  useEffect(() => {
    pressed.value = withSpring(selected ? 1 : 0, { damping: 17, stiffness: 280 });
  }, [selected, pressed]);

  useEffect(() => {
    if (!flashNonce || !selected) return;
    flashOverlay.value = 0;
    flashOverlay.value = withSequence(
      withTiming(1, { duration: 100, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }),
    );
  }, [flashNonce, selected, flashOverlay]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.04 * pressed.value }],
    borderColor: interpolateColor(
      pressed.value,
      [0, 1],
      ['rgba(255,255,255,0.1)', NEON_CYAN],
    ),
    borderWidth: 1 + pressed.value,
    shadowOpacity: 0.08 + 0.5 * pressed.value,
    shadowRadius: 4 + 16 * pressed.value,
    shadowColor: interpolateColor(pressed.value, [0, 1], ['#000000', NEON_CYAN]),
  }));

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOverlay.value,
  }));

  return (
    <AnimatedPressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onToggle();
      }}
      style={[
        styles.cardOuter,
        { width: CARD_W },
        Platform.OS === 'ios' ? {} : { elevation: selected ? 12 : 5 },
        animStyle,
      ]}
    >
      <ImageBackground source={{ uri: item.image }} style={styles.cardBg} imageStyle={styles.cardImg}>
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.tileFlashLayer, flashStyle]}
        />
        <View style={styles.cardText}>
          <Text style={styles.cardLabel}>{item.label}</Text>
          <Text style={[styles.cardSub, selected && styles.cardSubActive]}>{item.sub}</Text>
        </View>
      </ImageBackground>
    </AnimatedPressable>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [flashNonce, setFlashNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (await hasOnboardingCompleted()) {
        if (!cancelled) router.replace('/(app)/(tabs)/discover' as never);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const exitScale = useSharedValue(1);
  const exitOpacity = useSharedValue(1);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const canContinue = selected.size >= 1;

  const persistAndGoHome = useCallback(async () => {
    const genres = VYBE_STYLES.filter((s) => selected.has(s.id)).map((s) => s.label);
    useFireMixStore.getState().buildFromGenres(genres);
    try {
      await AsyncStorage.setItem(
        ONBOARDING_VIBES_STORAGE_KEY,
        JSON.stringify({ genres, savedAt: Date.now() }),
      );
    } catch {
      /* non-fatal */
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(false);
    router.replace('/(app)/(tabs)/discover' as never);

    void (async () => {
      try {
        await api.post('/api/user/preferences', {
          genres,
          mood: null,
          eraPreference: null,
          onboardingDone: true,
        });
      } catch (e) {
        console.warn('[onboarding] preferences save', e);
      }
    })();
  }, [router, selected]);

  const screenExitStyle = useAnimatedStyle(() => ({
    transform: [{ scale: exitScale.value }],
    opacity: exitOpacity.value,
  }));

  const handleNext = useCallback(() => {
    if (!canContinue || loading) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFlashNonce((n) => n + 1);
    setLoading(true);

    const runExit = () => {
      exitScale.value = withTiming(1.07, { duration: 340, easing: Easing.out(Easing.cubic) });
      exitOpacity.value = withTiming(
        0,
        { duration: 420, easing: Easing.in(Easing.cubic) },
        () => {
          'worklet';
          // Always continue — if `finished` is false (animation interrupted), we still
          // navigate; otherwise the screen stays at opacity 0 and feels like a force-quit.
          // Pass the stable useCallback ref directly — wrapping an inline arrow inside
          // runOnJS from a worklet crashes on recent Reanimated (can't serialize closure).
          runOnJS(persistAndGoHome)();
        },
      );
    };

    setTimeout(runExit, 220);
  }, [canContinue, loading, exitScale, exitOpacity, persistAndGoHome]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Animated.View style={[styles.screenContent, screenExitStyle]}>
        <View style={styles.header}>
          <Text style={styles.kicker}>Choose your Vybe</Text>
          <Text style={styles.title}>What moves you</Text>
          <Text style={styles.lede}>
            Tap one or more. This steers your feed — no cartoon icons, just the loop you want in the room.
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: insets.bottom + 108,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            {VYBE_STYLES.map((item) => (
              <StyleCard
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                flashNonce={flashNonce}
                onToggle={() => toggle(item.id)}
              />
            ))}
          </View>
        </ScrollView>
      </Animated.View>

      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.sticky,
          {
            paddingBottom: Math.max(insets.bottom, 12) + 8,
            borderTopColor: 'rgba(255,255,255,0.08)',
          },
          screenExitStyle,
        ]}
      >
        <Pressable
          onPress={handleNext}
          disabled={!canContinue || loading}
          style={({ pressed }) => [
            styles.nextBtn,
            canContinue ? styles.nextBtnActive : styles.nextBtnGhost,
            pressed && canContinue && styles.nextBtnPressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={NEON_CYAN} />
          ) : (
            <Text style={[styles.nextBtnText, canContinue && styles.nextBtnTextActive]}>Next</Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: OLED_BLACK,
  },
  screenContent: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  kicker: {
    color: vybe.text.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 10,
    color: vybe.text.primary,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -1,
  },
  lede: {
    marginTop: 10,
    color: vybe.text.secondary,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    maxWidth: 520,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  cardOuter: {
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    height: CARD_W * 1.22,
    marginBottom: CARD_GAP,
    backgroundColor: vybe.bg.card,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: { elevation: 6 },
    }),
  },
  cardBg: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cardImg: {
    borderRadius: 3,
  },
  cardText: {
    padding: 12,
  },
  cardLabel: {
    color: '#FAFAFA',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
  },
  cardSub: {
    marginTop: 4,
    color: 'rgba(250,250,250,0.65)',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  cardSubActive: {
    color: 'rgba(230, 255, 255, 0.95)',
    textShadowColor: 'rgba(0, 255, 255, 0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  tileFlashLayer: {
    backgroundColor: BABY_BLUE_FLASH,
    zIndex: 2,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
  },
  nextBtn: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  nextBtnGhost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  nextBtnActive: {
    backgroundColor: OLED_BLACK,
    borderWidth: 1.5,
    borderColor: NEON_CYAN,
    ...Platform.select({
      ios: {
        shadowColor: NEON_CYAN,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.55,
        shadowRadius: 14,
      },
      android: { elevation: 10 },
    }),
  },
  nextBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  nextBtnText: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  nextBtnTextActive: {
    color: '#FFFFFF',
  },
});
