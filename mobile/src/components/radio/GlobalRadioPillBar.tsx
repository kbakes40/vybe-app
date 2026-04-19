import React, { useCallback, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { GlobalRadioStationId } from '@/lib/GlobalRadioClient';
import { GLOBAL_RADIO_STATIONS, GLOBAL_RADIO_STATION_ORDER } from '@/lib/GlobalRadioClient';
import { NAV_BAR_PURPLE } from '@/constants/machinedTheme';

const CYAN = '#00FFFF';
const SPRING = { damping: 18, stiffness: 260, mass: 0.55 } as const;

type Layout = { x: number; w: number };

export function GlobalRadioPillBar({
  selectedId,
  onSelect,
}: {
  selectedId: GlobalRadioStationId;
  onSelect: (id: GlobalRadioStationId) => void;
}) {
  const [layouts, setLayouts] = useState<Partial<Record<GlobalRadioStationId, Layout>>>({});
  const indX = useSharedValue(0);
  const indW = useSharedValue(0);

  const applyIndicator = useCallback(
    (id: GlobalRadioStationId, layout: Layout) => {
      indX.value = withSpring(layout.x, SPRING);
      indW.value = withSpring(layout.w, SPRING);
    },
    [indX, indW],
  );

  const onPillLayout = useCallback((id: GlobalRadioStationId) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => ({ ...prev, [id]: { x, w: width } }));
  }, []);

  React.useEffect(() => {
    const L = layouts[selectedId];
    if (L) applyIndicator(selectedId, L);
  }, [selectedId, layouts, applyIndicator]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indX.value }],
    width: indW.value,
  }));

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollInner}
      >
        <View style={styles.track}>
          <Animated.View pointerEvents="none" style={[styles.indicator, indicatorStyle]} />
          {GLOBAL_RADIO_STATION_ORDER.map((id) => {
            const sel = id === selectedId;
            const label = GLOBAL_RADIO_STATIONS[id].pillLabel;
            return (
              <Pressable
                key={id}
                onLayout={onPillLayout(id)}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelect(id);
                }}
                style={styles.pillHit}
                accessibilityRole="tab"
                accessibilityState={{ selected: sel }}
                accessibilityLabel={label}
              >
                <View style={[styles.pill, sel && styles.pillHiddenFill]}>
                  <Text style={[styles.pillText, sel && styles.pillTextSelected]} numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 10,
  },
  scrollInner: {
    paddingVertical: 4,
    alignItems: 'center',
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    minHeight: 40,
    gap: 8,
    paddingHorizontal: 2,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 4,
    height: 32,
    borderRadius: 16,
    backgroundColor: CYAN,
    zIndex: 0,
  },
  pillHit: {
    zIndex: 1,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pillHiddenFill: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  pillText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  pillTextSelected: {
    color: NAV_BAR_PURPLE,
  },
});
