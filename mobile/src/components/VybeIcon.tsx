import React, { useEffect } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { VYBE_WAVE_PATH, VYBE_WAVE_MAGENTA_LEG } from '@/constants/vybeLogoPaths';

const VIBRANT_BLUE = '#00E5FF';
const OUTER_GLOW = '#00B0FF';
const NEON_MAGENTA = '#FF00D4';

interface VybeIconProps {
  size?: number;
  variant?: 'primary' | 'blue';
  backgroundColor?: string;
}

/**
 * Vybe mark — premium “digital object”: OLED field, machined cyan wave, titanium stroke read,
 * #00B0FF outer bloom, neon magenta heartbeat on the leading leg, optional 1px cyan seal.
 */
export function VybeIcon({ size = 36, variant = 'primary', backgroundColor }: VybeIconProps) {
  const borderRadius = size * 0.223;
  const strokeW = Math.max(0.85, size * 0.034);
  const magStroke = Math.max(0.5, size * 0.018);
  const waveBox = size * 0.68;

  const magPulse = useSharedValue(1);

  useEffect(() => {
    magPulse.value = withRepeat(
      withSequence(
        withTiming(0.38, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Reanimated SV
  }, []);

  const magStyle = useAnimatedStyle(() => ({
    opacity: magPulse.value,
  }));

  if (variant === 'blue') {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius,
          backgroundColor: '#3B82F6',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24">
          <Path
            d="M4 4 L12 20 L20 4"
            stroke="#FFFFFF"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    );
  }

  const seal = backgroundColor !== 'transparent';
  const fill = backgroundColor ?? '#000000';
  const shadowStyle =
    seal && Platform.OS === 'ios'
      ? {
          shadowColor: OUTER_GLOW,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: Math.min(1, 0.55 + size / 200),
          shadowRadius: Math.min(14, 4 + size * 0.11),
        }
      : seal && Platform.OS === 'android'
        ? { elevation: Math.min(16, 4 + Math.round(size / 12)) }
        : {};

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor: fill,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
          borderWidth: seal ? StyleSheet.hairlineWidth : 0,
          borderColor: seal ? VIBRANT_BLUE : 'transparent',
        },
        shadowStyle,
      ]}
    >
      <Svg width={waveBox} height={waveBox} viewBox="0 0 100 100">
        <Defs>
          <SvgLinearGradient id="vybeTitanium" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#E2E8F0" />
            <Stop offset="35%" stopColor="#94A3B8" />
            <Stop offset="70%" stopColor="#22D3EE" />
            <Stop offset="100%" stopColor={VIBRANT_BLUE} />
          </SvgLinearGradient>
        </Defs>
        {/* Outer soft read (glow proxy at small sizes) */}
        <Path
          d={VYBE_WAVE_PATH}
          stroke={OUTER_GLOW}
          strokeWidth={strokeW * 2.2}
          strokeLinecap="round"
          fill="none"
          opacity={0.22}
        />
        <Path
          d={VYBE_WAVE_PATH}
          stroke="url(#vybeTitanium)"
          strokeWidth={strokeW * 1.35}
          strokeLinecap="round"
          fill="none"
          opacity={0.55}
        />
        <Path
          d={VYBE_WAVE_PATH}
          stroke={VIBRANT_BLUE}
          strokeWidth={strokeW}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', width: waveBox, height: waveBox }, magStyle]}
      >
        <Svg width={waveBox} height={waveBox} viewBox="0 0 100 100">
          <Path
            d={VYBE_WAVE_MAGENTA_LEG}
            stroke={NEON_MAGENTA}
            strokeWidth={magStroke}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export const AppLogoPrimary = VybeIcon;
