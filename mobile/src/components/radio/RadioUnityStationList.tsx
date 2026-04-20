import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  GLOBAL_EXPANSION_STATION_ORDER,
  GLOBAL_RADIO_STATIONS,
  JAZZ_SUB_STATION_ORDER,
  type GlobalRadioStationId,
} from '@/lib/GlobalRadioClient';
import { MACHINED_CYAN } from '@/constants/machinedTheme';
import { hexToRgba } from '@/lib/themeColorUtils';

type Row = { id: string; title: string; subtitle: string };

const STATION_LIST: Record<GlobalRadioStationId, Row[]> = {
  global_hub: [],
  paradise: [
    { id: 'rp-main', title: 'RP Main Mix', subtitle: 'Radio Paradise · FLAC' },
  ],
  hiphop: [
    { id: 'lot', title: 'The Lot Radio', subtitle: 'NYC · thelotradio.com/stream' },
  ],
  house: [
    { id: 'def', title: 'Defected Radio', subtitle: 'mixlr.com/defectedradio · bridged relay' },
  ],
  lofi: [
    { id: 'lg', title: 'Lofi Girl', subtitle: 'lofigirl.com/stream-hires · relay' },
  ],
  indie: [
    { id: 'ipr', title: 'Indie Pop Rocks!', subtitle: 'SomaFM relay' },
  ],
  country: [{ id: 'c', title: 'Country', subtitle: 'Laut.fm relay · Roots-style' }],
  /** Rows for JAZZ pill live in `JAZZ_SUB_STATION_ORDER` branch (pickable). */
  jazz: [],
  jazz_secret: [],
  jazz_beat: [],
  ambient: [{ id: 'a', title: 'Drone Zone', subtitle: 'SomaFM deep ambient relay' }],
  vault_70s: [
    { id: 'v70', title: 'Bias Radio · 70s', subtitle: 'FLAC decades vault' },
  ],
  vault_80s: [
    { id: 'v80', title: 'Radio Club 80 · 80s', subtitle: 'FLAC decades vault' },
  ],
  vault_90s: [
    { id: 'v90', title: 'The Cheese · 90s', subtitle: 'Hi-res decades vault' },
  ],
  vault_00s: [
    { id: 'v00', title: 'Decades Radio UK · 00s', subtitle: 'Hi-bitrate decades vault' },
  ],
  vault_modern: [{ id: 'vm', title: 'Modern', subtitle: 'RP main' }],
  worldwide_fm: [{ id: 'ww', title: 'Worldwide FM', subtitle: 'London' }],
  nts_live: [{ id: 'nts', title: 'NTS Live', subtitle: 'Relay' }],
  fip_radio: [{ id: 'fip', title: 'FIP', subtitle: 'Relay' }],
  hor_berlin: [{ id: 'hor', title: 'HÖR', subtitle: 'Relay' }],
};

export function RadioUnityStationList({
  stationId,
  accent,
  globalRelayId,
  onPickGlobalRelay,
  jazzRelayId,
  onPickJazzRelay,
}: {
  stationId: GlobalRadioStationId;
  accent: string;
  /** Active relay when `stationId === 'global_hub'`. */
  globalRelayId: GlobalRadioStationId;
  onPickGlobalRelay: (id: GlobalRadioStationId) => void;
  /** Active SomaFM row when `stationId === 'jazz'`. */
  jazzRelayId: GlobalRadioStationId;
  onPickJazzRelay: (id: GlobalRadioStationId) => void;
}) {
  const rows = useMemo(() => {
    if (stationId === 'global_hub' || stationId === 'jazz') return null;
    return STATION_LIST[stationId] ?? [];
  }, [stationId]);

  if (stationId === 'global_hub') {
    return (
      <View style={[styles.shell, { borderColor: hexToRgba(accent, 0.28) }]}>
        <Text style={styles.hint}>STATION LIST · GLOBAL</Text>
        {GLOBAL_EXPANSION_STATION_ORDER.map((rid) => {
          const def = GLOBAL_RADIO_STATIONS[rid];
          const sel = rid === globalRelayId;
          return (
            <Pressable
              key={rid}
              onPress={() => onPickGlobalRelay(rid)}
              style={[
                styles.row,
                {
                  borderColor: sel ? MACHINED_CYAN : hexToRgba(accent, 0.22),
                  backgroundColor: sel ? 'rgba(0,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={def.pillLabel}
            >
              <View style={[styles.dot, !sel && { opacity: 0.45 }]} />
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={1}>
                  {def.pillLabel}
                </Text>
                <Text style={[styles.sub, { color: MACHINED_CYAN }]} numberOfLines={2}>
                  {def.staticNowPlaying?.artist ?? def.diChannelTag}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (stationId === 'jazz') {
    return (
      <View style={[styles.shell, { borderColor: hexToRgba(accent, 0.28) }]}>
        <Text style={styles.hint}>STATION LIST · JAZZ</Text>
        {JAZZ_SUB_STATION_ORDER.map((rid) => {
          const def = GLOBAL_RADIO_STATIONS[rid];
          const sel = rid === jazzRelayId;
          const sub = def.staticNowPlaying?.artist ?? def.diChannelTag;
          return (
            <Pressable
              key={rid}
              onPress={() => onPickJazzRelay(rid)}
              style={[
                styles.row,
                {
                  borderColor: sel ? MACHINED_CYAN : hexToRgba(accent, 0.22),
                  backgroundColor: sel ? 'rgba(0,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={def.diChannelTag}
            >
              <View style={[styles.dot, !sel && { opacity: 0.45 }]} />
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={1}>
                  {def.staticNowPlaying?.title ?? def.diChannelTag}
                </Text>
                <Text style={[styles.sub, { color: MACHINED_CYAN }]} numberOfLines={2}>
                  {sub}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }

  const header = GLOBAL_RADIO_STATIONS[stationId].pillLabel;
  const list = rows ?? [];

  return (
    <View style={[styles.shell, { borderColor: hexToRgba(accent, 0.28) }]}>
      <Text style={styles.hint}>STATION LIST · {header}</Text>
      {list.map((r) => (
        <View key={r.id} style={[styles.row, { borderColor: hexToRgba(accent, 0.22) }]}>
          <View style={styles.dot} />
          <View style={styles.body}>
            <Text style={styles.title} numberOfLines={1}>
              {r.title}
            </Text>
            <Text style={[styles.sub, { color: MACHINED_CYAN }]} numberOfLines={2}>
              {r.subtitle}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#050505',
  },
  hint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: MACHINED_CYAN,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.9,
  },
});
