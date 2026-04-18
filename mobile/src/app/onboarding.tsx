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
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/lib/api/api';
import { vybe } from '@/theme/vybeTokens';
import { useFireMixStore } from '@/stores/fireMixStore';

const VIBE_PREFS_KEY = '@vybe/onboarding_vibes';

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
  onToggle,
}: {
  item: VybeStyle;
  selected: boolean;
  onToggle: () => void;
}) {
  const pressed = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    pressed.value = withSpring(selected ? 1 : 0, { damping: 17, stiffness: 280 });
  }, [selected, pressed]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.05 * pressed.value }],
    borderColor: interpolateColor(
      pressed.value,
      [0, 1],
      ['rgba(255,255,255,0.1)', 'rgba(251,191,36,0.85)'],
    ),
    shadowOpacity: 0.14 + 0.52 * pressed.value,
    shadowRadius: 5 + 18 * pressed.value,
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
        Platform.OS === 'ios'
          ? { shadowColor: selected ? '#DC2626' : '#000000' }
          : { elevation: selected ? 14 : 5 },
        animStyle,
      ]}
    >
      <ImageBackground source={{ uri: item.image }} style={styles.cardBg} imageStyle={styles.cardImg}>
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.92)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.cardText}>
          <Text style={styles.cardLabel}>{item.label}</Text>
          <Text style={styles.cardSub}>{item.sub}</Text>
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

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const canContinue = selected.size >= 1;

  const handleEnter = async () => {
    if (!canContinue || loading) return;
    setLoading(true);
    const genres = VYBE_STYLES.filter((s) => selected.has(s.id)).map((s) => s.label);
    /** Fire Mix builds in the store while we persist prefs — Home reads the same store. */
    useFireMixStore.getState().buildFromGenres(genres);
    try {
      await AsyncStorage.setItem(VIBE_PREFS_KEY, JSON.stringify({ genres, savedAt: Date.now() }));
    } catch {
      /* non-fatal */
    }
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
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(false);
    router.replace('/(app)/(tabs)/index');
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
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
          paddingBottom: insets.bottom + 120,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {VYBE_STYLES.map((item) => (
            <StyleCard
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggle={() => toggle(item.id)}
            />
          ))}
        </View>
      </ScrollView>

      <View
        style={[
          styles.sticky,
          {
            paddingBottom: insets.bottom + 16,
            borderTopColor: vybe.border.subtle,
          },
        ]}
      >
        <Pressable
          onPress={handleEnter}
          disabled={!canContinue || loading}
          style={({ pressed }) => [
            styles.cta,
            !canContinue && styles.ctaDisabled,
            pressed && canContinue && styles.ctaPressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#0A0A0A" />
          ) : (
            <Text style={styles.ctaText}>Enter the Loop</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
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
    borderColor: 'rgba(255,255,255,0.12)',
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
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  cta: {
    backgroundColor: '#F59E0B',
    paddingVertical: 17,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#EA580C',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 14,
      },
      android: { elevation: 8 },
    }),
  },
  ctaDisabled: {
    opacity: 0.35,
  },
  ctaPressed: {
    opacity: 0.92,
  },
  ctaText: {
    color: '#0A0A0A',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
