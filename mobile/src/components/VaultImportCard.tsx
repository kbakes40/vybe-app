import React, { useEffect } from 'react';
import { Pressable, View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Upload, ChevronRight } from 'lucide-react-native';
import { VIBRANT_BLUE, OLED_BLACK } from '@/constants/machinedTheme';

type Props = {
  onPress: () => void;
  title?: string;
  subtitle?: string;
  /** Larger padding for full-screen Vault */
  spacious?: boolean;
};

/**
 * Deep navy → black vault ingest card with breathing cyan border glow + pulsing upload icon.
 */
export function VaultImportCard({
  onPress,
  title = 'Import to Vault',
  subtitle = 'Command ingest · device files',
  spacious = false,
}: Props) {
  const iconPulse = useSharedValue(1);
  const borderBreath = useSharedValue(0.4);

  useEffect(() => {
    iconPulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    borderBreath.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.35, { duration: 1700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reanimated SVs are stable refs
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: VIBRANT_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28 + 0.52 * borderBreath.value,
    shadowRadius: 6 + 10 * borderBreath.value,
    elevation: Platform.OS === 'android' ? Math.min(14, 6 + Math.round(8 * borderBreath.value)) : 0,
  }));

  const iconAnim = useAnimatedStyle(() => ({
    transform: [{ scale: iconPulse.value }],
  }));

  const pad = spacious ? 16 : 12;
  const uploadSize = spacious ? 24 : 20;

  return (
    <Pressable
      onPress={() => {
        onPress();
      }}
      style={({ pressed }) => [styles.hit, pressed && styles.hitPressed]}
    >
      <Animated.View style={[styles.glowHost, glowStyle]}>
        <LinearGradient
          colors={['#0a1628', '#061018', OLED_BLACK]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.card,
            {
              padding: pad,
              borderColor: VIBRANT_BLUE,
            },
          ]}
        >
          <Animated.View style={iconAnim}>
            <Upload size={uploadSize} color={VIBRANT_BLUE} strokeWidth={2.35} />
          </Animated.View>
          <View style={styles.textCol}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.sub}>{subtitle}</Text>
          </View>
          <ChevronRight size={spacious ? 20 : 18} color={VIBRANT_BLUE} strokeWidth={2.2} />
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    marginBottom: 16,
  },
  hitPressed: {
    opacity: 0.92,
  },
  glowHost: {
    borderRadius: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
  },
  textCol: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    color: '#F4FAFC',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sub: {
    marginTop: 3,
    color: 'rgba(148, 163, 184, 0.95)',
    fontSize: 12,
    fontWeight: '500',
  },
});
