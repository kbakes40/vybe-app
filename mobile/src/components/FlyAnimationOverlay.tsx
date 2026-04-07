import { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, View } from 'react-native';
import { setFlyAnimationHandler } from '@/lib/flyAnimationEmitter';

const ICON = 44;
const ISLAND_Y = 11; // Dynamic Island center Y on iPhone 14/15/16 Pro

// ── Inner component — created fresh each time so Animated.Value starts
//    at the exact button position (no setValue race condition) ────────────────
function FlyParticle({ fromX, fromY }: { fromX: number; fromY: number }) {
  const { width: SW } = Dimensions.get('window');

  // Initial values baked into construction — correct from the very first frame
  const animX = useRef(new Animated.Value(fromX - ICON / 2)).current;
  const animY = useRef(new Animated.Value(fromY - ICON / 2)).current;
  const animScale = useRef(new Animated.Value(1)).current;
  const animOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(animX, {
        toValue: SW / 2 - ICON / 2,
        duration: 500,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(animY, {
        toValue: ISLAND_Y - ICON / 2,
        duration: 480,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(animScale, {
        toValue: 0.15,
        duration: 500,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(animOpacity, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: ICON,
        height: ICON,
        borderRadius: ICON / 2,
        backgroundColor: '#3B82F6',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [
          { translateX: animX },
          { translateY: animY },
          { scale: animScale },
        ],
        opacity: animOpacity,
      }}
    >
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 2.5, height: ICON * 0.27, backgroundColor: '#fff', borderRadius: 2 }} />
        <View style={{
          width: 0, height: 0,
          borderLeftWidth: ICON * 0.17, borderRightWidth: ICON * 0.17, borderTopWidth: ICON * 0.17,
          borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#fff',
        }} />
      </View>
    </Animated.View>
  );
}

// ── Root-level overlay — mount once in _layout.tsx ──────────────────────────
export function FlyAnimationOverlay() {
  const [flyFrom, setFlyFrom] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setFlyAnimationHandler((fromX, fromY) => {
      setFlyFrom({ x: fromX, y: fromY });
      setTimeout(() => setFlyFrom(null), 560);
    });
    return () => setFlyAnimationHandler(null);
  }, []);

  if (!flyFrom) return null;

  return (
    <Modal transparent animationType="none" statusBarTranslucent>
      <FlyParticle fromX={flyFrom.x} fromY={flyFrom.y} />
    </Modal>
  );
}
