import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { AudioWaveform } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { VybeWavesNeonIcon } from '@/assets/icons/VybeNeonSourceIcons';
import { BANDCAMP_BRAND_LOGO_URL } from '@/constants/bandcamp';
import { DOCK_CYAN, OLED_BLACK } from '@/constants/machinedTheme';
import { hasCredentials } from '@/lib/subsonic/subsonicClient';
import { useSubsonicStore } from '@/stores/subsonicStore';
import { logUiTap } from '@/lib/uiTapLog';

const CHIP = 140;

interface ChipProps {
  label: string;
  sub: string;
  accent: string;
  icon: React.ReactNode;
  cornerMark?: React.ReactNode;
  pulse?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

function SourceChip({
  label,
  sub,
  accent,
  icon,
  cornerMark,
  pulse,
  onPress,
  accessibilityLabel,
}: ChipProps) {
  // Slow 0.8 ↔ 1.0 opacity pulse on the border to signal "live upcoming feature".
  // Non-pulsing chips stay at 1.0.
  const pulseV = useSharedValue(pulse ? 0.8 : 1);

  useEffect(() => {
    if (!pulse) return;
    pulseV.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(pulseV);
    };
  }, [pulse, pulseV]);

  const borderAnim = useAnimatedStyle(() => ({ opacity: pulseV.value }));

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [styles.chip, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      {/* Subtle tinted gradient so BlurView has something to tint on pure-OLED black. */}
      <LinearGradient
        colors={['rgba(0,229,255,0.12)', 'rgba(0,229,255,0.02)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <BlurView intensity={10} tint="dark" style={StyleSheet.absoluteFill} />

      <Animated.View
        pointerEvents="none"
        style={[styles.borderOverlay, { borderColor: accent }, borderAnim]}
      />

      {cornerMark ? <View style={styles.cornerMark}>{cornerMark}</View> : null}

      <View style={styles.iconCenter}>{icon}</View>

      <View style={styles.labelBlock}>
        <Text numberOfLines={1} style={styles.chipLabel}>
          {label}
        </Text>
        <Text numberOfLines={1} style={styles.chipSub}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

export function DiscoverSourceRail() {
  const router = useRouter();
  const credentialsRevision = useSubsonicStore((s) => s.credentialsRevision);
  const navConfigured = hasCredentials();
  void credentialsRevision;

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionTitle}>SOURCES</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        style={{ flexGrow: 0 }}
      >
        <SourceChip
          label="Navidrome"
          sub="Self-hosted library"
          accent={DOCK_CYAN}
          pulse={!navConfigured}
          accessibilityLabel="Navidrome library source"
          cornerMark={<Text style={styles.mMark}>N</Text>}
          icon={<AudioWaveform size={40} color={DOCK_CYAN} strokeWidth={2.4} />}
          onPress={() => {
            logUiTap('Discover sources', 'open_navidrome');
            router.push('/(app)/(tabs)/vault' as never);
          }}
        />
        <SourceChip
          label="SoundCloud"
          sub="Vybe Waves"
          accent="rgba(255,255,255,0.28)"
          accessibilityLabel="SoundCloud source"
          icon={<VybeWavesNeonIcon size={52} />}
        />
        <SourceChip
          label="Bandcamp"
          sub="Tag charts · collection"
          accent="#58A7C6"
          accessibilityLabel="Bandcamp source"
          cornerMark={<Text style={styles.mMark}>B</Text>}
          icon={
            <Image
              source={{ uri: BANDCAMP_BRAND_LOGO_URL }}
              style={{ width: 52, height: 28 }}
              contentFit="contain"
            />
          }
          onPress={() => {
            logUiTap('Discover sources', 'open_bandcamp');
            router.push('/(app)/(tabs)/vault' as never);
          }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 12,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  rail: {
    paddingHorizontal: 16,
    gap: 12,
  },
  chip: {
    width: CHIP,
    height: CHIP,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: OLED_BLACK,
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1,
  },
  cornerMark: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mMark: {
    color: DOCK_CYAN,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: -0.5,
    lineHeight: 14,
  },
  iconCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBlock: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
  },
  chipLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  chipSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
});
