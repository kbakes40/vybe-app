import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

export type SourceCornerBadgeSource =
  | 'soundcloud'
  | 'youtube_music'
  | 'youtube'
  | 'vybe'
  | 'stream';

type Props = { source?: SourceCornerBadgeSource | string; compact?: boolean };

function GlassBadgeShell({
  compact,
  children,
}: {
  compact?: boolean;
  children: React.ReactNode;
}) {
  const r = compact ? 6 : 8;
  const ph = compact ? 5 : 8;
  const pv = compact ? 3 : 4;
  const border = {
    borderRadius: r,
    overflow: 'hidden' as const,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  };
  if (Platform.OS === 'ios') {
    return (
      <View style={border}>
        <BlurView intensity={48} tint="dark" style={{ paddingHorizontal: ph, paddingVertical: pv }}>
          {children}
        </BlurView>
      </View>
    );
  }
  return (
    <View
      style={[
        border,
        {
          paddingHorizontal: ph,
          paddingVertical: pv,
          backgroundColor: 'rgba(22,22,24,0.78)',
        },
      ]}
    >
      {children}
    </View>
  );
}

/** Top-right source badge on playlist / artwork cards (glass + Shadow labels). */
export function SourceCornerBadge({ source, compact }: Props) {
  const s = (source ?? '') as string;
  const fs = compact ? 7.5 : 9;
  const textStyle = { color: 'rgba(255,255,255,0.95)', fontSize: fs, fontWeight: '900' as const };
  if (s === 'soundcloud') {
    return (
      <GlassBadgeShell compact={compact}>
        <Text style={{ ...textStyle, letterSpacing: 0.6 }}>SC</Text>
      </GlassBadgeShell>
    );
  }
  if (s === 'youtube_music') {
    return (
      <GlassBadgeShell compact={compact}>
        <Text style={{ ...textStyle, letterSpacing: compact ? 0.35 : 0.5 }}>
          {compact ? 'CS' : 'CLOUD'}
        </Text>
      </GlassBadgeShell>
    );
  }
  if (s === 'youtube') {
    return (
      <GlassBadgeShell compact={compact}>
        <Text style={{ ...textStyle, letterSpacing: compact ? 0.4 : 0.6 }}>
          {compact ? 'WS' : 'WEB'}
        </Text>
      </GlassBadgeShell>
    );
  }
  if (s === 'stream') {
    return (
      <GlassBadgeShell compact={compact}>
        <Text style={{ ...textStyle, letterSpacing: compact ? 0.45 : 0.65 }}>STREAM</Text>
      </GlassBadgeShell>
    );
  }
  return (
    <GlassBadgeShell compact={compact}>
      <Text style={{ ...textStyle, color: '#F3E8FF', letterSpacing: compact ? 0.8 : 1.1 }}>VYBE</Text>
    </GlassBadgeShell>
  );
}
