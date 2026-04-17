import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/** Top-right source badge on playlist / artwork cards (Shadow branding) */
export function SourceCornerBadge({ source, compact }: { source?: string; compact?: boolean }) {
  const s = source ?? '';
  const fs = compact ? 7.5 : 9;
  const ph = compact ? 5 : 8;
  const pv = compact ? 3 : 4;
  const shell = {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: compact ? 6 : 8,
    paddingHorizontal: ph,
    paddingVertical: pv,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  } as const;
  if (s === 'soundcloud') {
    return (
      <View style={shell}>
        <Text style={{ color: 'rgba(255,255,255,0.95)', fontSize: fs, fontWeight: '900', letterSpacing: 0.6 }}>SC</Text>
      </View>
    );
  }
  if (s === 'youtube_music') {
    return (
      <View style={shell}>
        <Text style={{ color: 'rgba(255,255,255,0.95)', fontSize: fs, fontWeight: '900', letterSpacing: compact ? 0.35 : 0.5 }}>
          {compact ? 'CS' : 'CLOUD'}
        </Text>
      </View>
    );
  }
  if (s === 'youtube') {
    return (
      <View style={shell}>
        <Text style={{ color: 'rgba(255,255,255,0.95)', fontSize: fs, fontWeight: '900', letterSpacing: compact ? 0.4 : 0.6 }}>
          {compact ? 'WS' : 'WEB'}
        </Text>
      </View>
    );
  }
  return (
    <View style={[shell, { borderColor: 'rgba(139,92,246,0.4)' }]}>
      <Text style={{ color: '#F3E8FF', fontSize: fs, fontWeight: '900', letterSpacing: compact ? 0.8 : 1.1 }}>VYBE</Text>
    </View>
  );
}
