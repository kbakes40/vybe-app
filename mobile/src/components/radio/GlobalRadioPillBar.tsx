import React, { useCallback, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { GlobalRadioStationId } from '@/lib/GlobalRadioClient';
import { GLOBAL_RADIO_STATIONS, GLOBAL_RADIO_STATION_ORDER } from '@/lib/GlobalRadioClient';
import { NAV_BAR_PURPLE } from '@/constants/machinedTheme';
import { useThemeStore } from '@/stores/themeStore';
const SPRING = { damping: 18, stiffness: 260, mass: 0.55 } as const;

type Layout = { x: number; w: number };

export function GlobalRadioPillBar({
  selectedId,
  onSelect,
  paradiseArtUri,
  liveArtworkById,
}: {
  selectedId: GlobalRadioStationId;
  onSelect: (id: GlobalRadioStationId) => void;
  /** Radio Paradise on-air cover (updates with RP API). */
  paradiseArtUri: string | null;
  /** Per-station live album art (Laut/Soma + iTunes) keyed by station id. */
  liveArtworkById: Partial<Record<GlobalRadioStationId, string>>;
}) {
  const accent = useThemeStore((s) => s.accentColor);
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
        <View style={styles.track} collapsable={false}>
          <Animated.View
            pointerEvents="none"
            style={[styles.indicator, { backgroundColor: accent }, indicatorStyle]}
          />
          {GLOBAL_RADIO_STATION_ORDER.map((id) => {
            const sel = id === selectedId;
            const label = GLOBAL_RADIO_STATIONS[id].pillLabel;
            const thumbUri =
              id === 'paradise'
                ? paradiseArtUri?.trim() || GLOBAL_RADIO_STATIONS.paradise.brandArtworkUrl
                : liveArtworkById[id] || GLOBAL_RADIO_STATIONS[id].brandArtworkUrl;
            return (
              <Pressable
                key={id}
                collapsable={false}
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
                  <Image
                    source={{ uri: thumbUri }}
                    style={styles.pillThumb}
                    contentFit="cover"
                    transition={160}
                    cachePolicy="memory-disk"
                  />
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
    minHeight: 44,
    gap: 8,
    paddingHorizontal: 2,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    top: 2,
    height: 36,
    borderRadius: 18,
    zIndex: 0,
  },
  pillHit: {
    zIndex: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 5,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 8,
  },
  pillThumb: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
