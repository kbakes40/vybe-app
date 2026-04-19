import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_HEIGHT, MINI_PLAYER_HEIGHT } from '@/constants/Layout';
import { MINI_PLAYER_TAB_FLUSH_OVERLAP_PX } from '@/constants/miniPlayer';
import { useShadowPlaybackToastStore } from '@/stores/shadowPlaybackToastStore';

export function ShadowPlaybackToast() {
  const insets = useSafeAreaInsets();
  const message = useShadowPlaybackToastStore((s) => s.message);
  const placement = useShadowPlaybackToastStore((s) => s.placement);

  if (!message) return null;

  const tabShelf = TAB_BAR_HEIGHT + Math.max(insets.bottom, 0) - MINI_PLAYER_TAB_FLUSH_OVERLAP_PX;
  const bottomAboveDock = tabShelf + MINI_PLAYER_HEIGHT + 10;
  const isTop = placement === 'top';

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        isTop
          ? { top: insets.top + 8, bottom: undefined }
          : { top: undefined, bottom: bottomAboveDock },
      ]}
    >
      <BlurView intensity={isTop ? 36 : 28} tint="dark" style={[styles.blur, isTop && styles.blurTop]}>
        <Text style={[styles.text, isTop && styles.textGeometric]}>{message}</Text>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 200000,
    elevation: 200000,
    alignItems: 'center',
  },
  blur: {
    borderRadius: 14,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(217,70,239,0.35)',
    backgroundColor: 'rgba(12,6,18,0.55)',
  },
  blurTop: {
    borderColor: 'rgba(0,255,255,0.45)',
    backgroundColor: 'rgba(0,8,12,0.72)',
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  text: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  textGeometric: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3.2,
    fontVariant: ['tabular-nums'],
    color: '#FFFFFF',
  },
});
