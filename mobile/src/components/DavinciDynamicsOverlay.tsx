import React from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useDavinciDynamicsStore } from '@/stores/davinciDynamicsStore';
import { usePlaybackDebugStore } from '@/stores/playbackDebugStore';
import { resetDevPlaybackCaches } from '@/lib/devVaultCacheReset';

const NEON = '#39FF14';

export function DavinciDynamicsOverlay() {
  const insets = useSafeAreaInsets();
  const visible = useDavinciDynamicsStore((s) => s.visible);
  const close = useDavinciDynamicsStore((s) => s.close);
  const push = useDavinciDynamicsStore((s) => s.push);
  const lines = useDavinciDynamicsStore((s) => s.lines);

  const onResetCache = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    resetDevPlaybackCaches();
    usePlaybackDebugStore.getState().clearDebugLogs();
    useDavinciDynamicsStore.getState().clear();
    push('[VAULT] Playback warm caches purged', 'warn');
  };

  return (
    <Modal visible={visible} animationType="none" presentationStyle="fullScreen" onRequestClose={close}>
      <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)} style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.topBar}>
          <Text style={styles.brand}>DA VINCI // CLASSIFIED</Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              close();
            }}
            hitSlop={14}
            style={styles.closeBtn}
          >
            <X size={22} color={NEON} />
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.statusLine}>DaVinci Dynamics: ONLINE</Text>
          <Text style={styles.statusLine}>Vapi Bridge: ACTIVE</Text>

          <Pressable onPress={onResetCache} style={styles.resetBtn}>
            <Text style={styles.resetText}>RESET CACHE</Text>
          </Pressable>

          <Text style={styles.hint}>Podfile / CocoaPods mismatch → run vault-sync in terminal</Text>
        </View>

        {lines.length > 0 ? (
          <ScrollView style={styles.logScroll} contentContainerStyle={styles.logContent}>
            {lines.slice(-40).map((l) => (
              <Text key={l.id} style={styles.logLine} numberOfLines={3}>
                {new Date(l.ts).toISOString().slice(11, 19)} {l.message}
              </Text>
            ))}
          </ScrollView>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  brand: {
    color: NEON,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  closeBtn: {
    padding: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(57,255,20,0.45)',
    borderRadius: 10,
  },
  panel: {
    marginHorizontal: 20,
    padding: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(57,255,20,0.35)',
    backgroundColor: '#030303',
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  statusLine: {
    color: NEON,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 14,
  },
  resetBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: NEON,
    backgroundColor: 'rgba(57,255,20,0.08)',
    alignItems: 'center',
  },
  resetText: {
    color: NEON,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
  },
  hint: {
    marginTop: 18,
    color: 'rgba(57,255,20,0.45)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  logScroll: {
    flex: 1,
    marginTop: 16,
    marginHorizontal: 12,
  },
  logContent: {
    padding: 12,
    paddingBottom: 32,
  },
  logLine: {
    color: 'rgba(57,255,20,0.55)',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 6,
  },
});
