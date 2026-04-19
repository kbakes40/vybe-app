import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  GLOBAL_EXPANSION_STATION_ORDER,
  GLOBAL_RADIO_STATIONS,
  type GlobalRadioStationId,
} from '@/lib/GlobalRadioClient';
import { hexToRgba } from '@/lib/themeColorUtils';

type Row = { id: GlobalRadioStationId };

const DATA: Row[] = GLOBAL_EXPANSION_STATION_ORDER.map((id) => ({ id }));

export function GlobalExpansionRadioList({
  selectedId,
  accent,
  onPick,
}: {
  selectedId: GlobalRadioStationId | null;
  accent: string;
  onPick: (id: GlobalRadioStationId) => void;
}) {
  const render = useCallback(
    ({ item }: { item: Row }) => {
      const def = GLOBAL_RADIO_STATIONS[item.id];
      const sel = item.id === selectedId;
      return (
        <Pressable
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onPick(item.id);
          }}
          style={[
            styles.row,
            {
              borderColor: sel ? accent : hexToRgba(accent, 0.25),
              backgroundColor: sel ? hexToRgba(accent, 0.08) : 'rgba(255,255,255,0.03)',
            },
          ]}
        >
          <Image source={{ uri: def.brandArtworkUrl }} style={styles.thumb} contentFit="cover" />
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {def.pillLabel}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {def.staticNowPlaying?.artist ?? def.diChannelTag}
            </Text>
          </View>
          <Text style={[styles.chev, { color: accent }]}>›</Text>
        </Pressable>
      );
    },
    [accent, onPick, selectedId],
  );

  return (
    <View style={styles.host}>
      <FlashList
        data={DATA}
        renderItem={render}
        keyExtractor={(item) => item.id}
        estimatedItemSize={64}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        estimatedListSize={{ height: 320, width: 400 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    height: 300,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 12,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sub: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
  },
  chev: {
    fontSize: 22,
    fontWeight: '300',
    marginRight: 4,
  },
});
