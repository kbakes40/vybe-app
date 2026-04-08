import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

interface VybeIconProps {
  size?: number;
  variant?: 'primary' | 'blue';
  backgroundColor?: string;
}

/**
 * AppLogoPrimary - VYBE App Icon
 * Primary: Dark rounded square with neon wave line (matches "Your apps" icon)
 * Blue: Legacy blue square with white V (deprecated, use primary)
 *
 * This is the single source of truth for the VYBE logo.
 */
export function VybeIcon({ size = 36, variant = 'primary', backgroundColor }: VybeIconProps) {
  const borderRadius = size * 0.22;

  // Primary: Neon wave logo on dark background
  if (variant === 'primary') {
    const waveSize = size * 0.65;
    const strokeWidth = size * 0.035;

    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius,
          backgroundColor: backgroundColor ?? '#0D0D0D',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          // Subtle border for depth
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        {/* Subtle gradient overlay for premium feel */}
        <LinearGradient
          colors={['rgba(139,92,246,0.15)', 'rgba(59,130,246,0.1)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            width: size,
            height: size,
          }}
        />
        {/* Neon wave SVG */}
        <Svg width={waveSize} height={waveSize} viewBox="0 0 100 100">
          <Defs>
            <SvgLinearGradient id="neonGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#00F5FF" />
              <Stop offset="25%" stopColor="#00D4FF" />
              <Stop offset="50%" stopColor="#A855F7" />
              <Stop offset="75%" stopColor="#EC4899" />
              <Stop offset="100%" stopColor="#F43F5E" />
            </SvgLinearGradient>
            {/* Glow effect gradient */}
            <SvgLinearGradient id="glowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor="#00F5FF" stopOpacity="0.4" />
              <Stop offset="50%" stopColor="#A855F7" stopOpacity="0.4" />
              <Stop offset="100%" stopColor="#F43F5E" stopOpacity="0.4" />
            </SvgLinearGradient>
          </Defs>
          {/* Glow layer (slightly thicker, blurred look) */}
          <Path
            d="M10 50 Q25 20, 40 50 T70 50 T100 50"
            stroke="url(#glowGradient)"
            strokeWidth={strokeWidth * 3}
            fill="none"
            strokeLinecap="round"
          />
          {/* Main neon wave line */}
          <Path
            d="M10 50 Q25 20, 40 50 T70 50 T100 50"
            stroke="url(#neonGradient)"
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      </View>
    );
  }

  // Legacy blue variant (deprecated - for backwards compatibility only)
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
      <View
        style={{
          width: size * 0.5,
          height: size * 0.5,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* V letter rendered as custom path for crispness */}
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
    </View>
  );
}

// Export alias for clarity
export const AppLogoPrimary = VybeIcon;
