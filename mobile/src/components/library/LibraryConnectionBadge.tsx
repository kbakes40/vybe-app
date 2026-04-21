import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Wifi, WifiOff, Settings2, Loader2 } from 'lucide-react-native';
import { useSubsonicStore, type SubsonicStatus } from '@/stores/subsonicStore';
import { DOCK_CYAN } from '@/constants/machinedTheme';

function statusLabel(s: SubsonicStatus): string {
  switch (s.kind) {
    case 'connected':
      return 'Library Connected';
    case 'connecting':
      return 'Checking tunnel…';
    case 'unconfigured':
      return 'Library Not Configured';
    case 'offline':
      return offlineLabel(s.reason);
    case 'unknown':
    default:
      return 'Tap to check connection';
  }
}

function offlineLabel(reason: Extract<SubsonicStatus, { kind: 'offline' }>['reason']): string {
  switch (reason) {
    case 'tunnel':
      return 'Library Offline · tunnel down';
    case 'auth':
      return 'Library Offline · auth failed';
    case 'network':
      return 'Library Offline · no network';
    case 'server':
      return 'Library Offline · server error';
    default:
      return 'Library Offline';
  }
}

export function LibraryConnectionBadge() {
  const status = useSubsonicStore((s) => s.status);
  const testConnection = useSubsonicStore((s) => s.testConnection);

  // One-shot ping on mount so the badge lands in a real state, not "unknown".
  useEffect(() => {
    if (status.kind === 'unknown') void testConnection();
  }, [status.kind, testConnection]);

  const onPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void testConnection();
  };

  const palette = paletteFor(status);
  const Icon = iconFor(status);

  return (
    <Pressable
      accessibilityLabel="Library connection status"
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: palette.border, backgroundColor: palette.bg },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon size={12} color={palette.fg} strokeWidth={2.4} />
      <Text numberOfLines={1} style={[styles.label, { color: palette.fg }]}>
        {statusLabel(status)}
      </Text>
    </Pressable>
  );
}

function paletteFor(status: SubsonicStatus): { fg: string; bg: string; border: string } {
  switch (status.kind) {
    case 'connected':
      return { fg: DOCK_CYAN, bg: 'rgba(0,229,255,0.08)', border: 'rgba(0,229,255,0.45)' };
    case 'connecting':
      return { fg: 'rgba(255,255,255,0.85)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.25)' };
    case 'offline':
      return { fg: '#FF6B6B', bg: 'rgba(255,107,107,0.10)', border: 'rgba(255,107,107,0.45)' };
    case 'unconfigured':
      return { fg: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.2)' };
    default:
      return { fg: 'rgba(255,255,255,0.65)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.22)' };
  }
}

function iconFor(status: SubsonicStatus) {
  switch (status.kind) {
    case 'connected':
      return Wifi;
    case 'offline':
      return WifiOff;
    case 'unconfigured':
      return Settings2;
    case 'connecting':
      return Loader2;
    default:
      return Wifi;
  }
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
    marginBottom: 10,
    maxWidth: '100%',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});

// Re-export the pure renderer wrapped in <View> for use as a placeholder block.
export function LibraryConnectionBadgeRow() {
  return (
    <View>
      <LibraryConnectionBadge />
    </View>
  );
}
