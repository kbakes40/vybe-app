import React, { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  GLOBAL_EXPANSION_STATION_ORDER,
  GLOBAL_RADIO_STATIONS,
  JAZZ_SUB_STATION_ORDER,
  type GlobalRadioStationId,
} from '@/lib/GlobalRadioClient';
import { hexToRgba } from '@/lib/themeColorUtils';

const OLED_BLACK = '#000000';
/** Active station chrome — matches Dynamic Island pill cyan. */
const RADIO_CYAN = '#00E5FF';

/** Clears the collapsed pill band so the first row does not sit under the island. */
const RADIO_LIST_TOP_KICK_PT = 20;
/** Top-of-list dissolve: transparent → opaque black before content reaches the pill. */
const RADIO_STATION_FADE_MASK_PT = 15;

type Row = { id: string; title: string; subtitle: string };

const STATION_LIST: Record<GlobalRadioStationId, Row[]> = {
  global_hub: [],
  paradise: [
    { id: 'rp-main', title: 'RP Main Mix', subtitle: 'Radio Paradise · AAC' },
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

const activeRowGlow = Platform.select({
  ios: {
    shadowColor: RADIO_CYAN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
  },
  android: {
    elevation: 6,
  },
  default: {},
});

function OledStationListViewport({
  children,
  accentBorder,
}: {
  children: React.ReactNode;
  accentBorder: string;
}) {
  return (
    <View style={[styles.viewport, { borderColor: accentBorder }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {children}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', OLED_BLACK]}
        locations={[0, 1]}
        style={styles.fadeMask}
      />
    </View>
  );
}

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
  const accentBorder = hexToRgba(accent, 0.22);

  const rows = useMemo(() => {
    if (stationId === 'global_hub' || stationId === 'jazz') return null;
    return STATION_LIST[stationId] ?? [];
  }, [stationId]);

  if (stationId === 'global_hub') {
    return (
      <OledStationListViewport accentBorder={accentBorder}>
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
                sel ? [styles.rowActive, activeRowGlow] : styles.rowIdle,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={def.pillLabel}
            >
              <View style={[styles.dot, !sel && styles.dotDim]} />
              <View style={styles.body}>
                <Text style={styles.titleStation} numberOfLines={1}>
                  {def.pillLabel}
                </Text>
                <Text
                  style={[styles.subtitle, sel ? styles.subtitleActive : styles.subtitleIdle]}
                  numberOfLines={2}
                >
                  {def.staticNowPlaying?.artist ?? def.diChannelTag}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </OledStationListViewport>
    );
  }

  if (stationId === 'jazz') {
    return (
      <OledStationListViewport accentBorder={accentBorder}>
        <Text style={styles.hint}>STATION LIST · JAZZ</Text>
        {JAZZ_SUB_STATION_ORDER.map((rid) => {
          const def = GLOBAL_RADIO_STATIONS[rid];
          const sel = rid === jazzRelayId;
          const sub = def.staticNowPlaying?.artist ?? def.diChannelTag;
          return (
            <Pressable
              key={rid}
              onPress={() => onPickJazzRelay(rid)}
              style={[styles.row, sel ? [styles.rowActive, activeRowGlow] : styles.rowIdle]}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={def.diChannelTag}
            >
              <View style={[styles.dot, !sel && styles.dotDim]} />
              <View style={styles.body}>
                <Text style={styles.titleStation} numberOfLines={1}>
                  {def.staticNowPlaying?.title ?? def.diChannelTag}
                </Text>
                <Text
                  style={[styles.subtitle, sel ? styles.subtitleActive : styles.subtitleIdle]}
                  numberOfLines={2}
                >
                  {sub}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </OledStationListViewport>
    );
  }

  const header = GLOBAL_RADIO_STATIONS[stationId].pillLabel;
  const list = rows ?? [];

  return (
    <OledStationListViewport accentBorder={accentBorder}>
      <Text style={styles.hint}>STATION LIST · {header}</Text>
      {list.map((r) => (
        <View key={r.id} style={[styles.row, styles.rowIdle]}>
          <View style={styles.dot} />
          <View style={styles.body}>
            <Text style={styles.titleStation} numberOfLines={1}>
              {r.title}
            </Text>
            <Text style={[styles.subtitle, styles.subtitleIdle]} numberOfLines={2}>
              {r.subtitle}
            </Text>
          </View>
        </View>
      ))}
    </OledStationListViewport>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    minHeight: 0,
    marginTop: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: OLED_BLACK,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
    backgroundColor: OLED_BLACK,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: RADIO_LIST_TOP_KICK_PT,
    paddingBottom: 12,
    backgroundColor: OLED_BLACK,
  },
  /** Dissolve band — scroll content fades to OLED before passing under the pill. */
  fadeMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: RADIO_STATION_FADE_MASK_PT,
    zIndex: 4,
  },
  hint: {
    color: 'rgba(255,255,255,0.38)',
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
  rowIdle: {
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: OLED_BLACK,
  },
  rowActive: {
    borderColor: RADIO_CYAN,
    backgroundColor: 'rgba(0,229,255,0.08)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: RADIO_CYAN,
  },
  dotDim: {
    opacity: 0.35,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  titleStation: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
  },
  subtitleActive: {
    color: RADIO_CYAN,
  },
  subtitleIdle: {
    color: 'rgba(255,255,255,0.55)',
  },
});
