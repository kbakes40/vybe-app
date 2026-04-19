import React, { useRef, useCallback } from 'react';
import { Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { VybeIcon } from '@/components/VybeIcon';
import { useDavinciDynamicsStore } from '@/stores/davinciDynamicsStore';

const TRIPLE_MS = 500;

/**
 * Home / shell header mark — wrapped in Pressable; triple-tap opens the DaVinci dev console.
 */
export function VybeHeaderMark({ size = 36 }: { size?: number }) {
  const tapRef = useRef({ n: 0, at: 0 });

  const onPress = useCallback(() => {
    const now = Date.now();
    if (now - tapRef.current.at > TRIPLE_MS) tapRef.current.n = 0;
    tapRef.current.at = now;
    tapRef.current.n += 1;
    if (tapRef.current.n >= 3) {
      tapRef.current.n = 0;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      useDavinciDynamicsStore.getState().open();
    }
  }, []);

  return (
    <Pressable onPress={onPress} hitSlop={14} accessibilityLabel="Vybe home" accessibilityHint="Triple-tap opens developer console">
      <VybeIcon size={size} variant="primary" />
    </Pressable>
  );
}
