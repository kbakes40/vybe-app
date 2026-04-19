import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Play, Pause, Radio } from 'lucide-react-native';
import { usePlaybackController } from '@/stores/playbackController';
import { RADIO_PARADISE_BRAND_LOGO_URL } from '@/constants/radioParadise';
import { fetchRadioParadiseNowPlaying } from '@/lib/radioParadiseApi';
import { RadioParadiseSoulActions } from '@/components/radio/RadioParadiseSoulActions';
import {
  buildGlobalRadioTrack,
  type GlobalRadioStationId,
  type DecadesEraTab,
  GLOBAL_RADIO_STATIONS,
} from '@/lib/GlobalRadioClient';
import { GlobalRadioPillBar } from '@/components/radio/GlobalRadioPillBar';
import { DecadesVaultEraStrip } from '@/components/radio/DecadesVaultEraStrip';
import { GlobalExpansionRadioList } from '@/components/radio/GlobalExpansionRadioList';
import { useThemeStore } from '@/stores/themeStore';
import { hexToRgba } from '@/lib/themeColorUtils';
import {
  fetchGlobalRadioLivePreviewMap,
  type GlobalRadioLivePreview,
} from '@/lib/globalRadioLivePreview';

export default function GlobalRadioTabScreen() {
  const insets = useSafeAreaInsets();
  const accent = useThemeStore((s) => s.accentColor);
  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const playbackState = usePlaybackController((s) => s.playbackState);
  const playTrack = usePlaybackController((s) => s.playTrack);
  const pause = usePlaybackController((s) => s.pause);
  const play = usePlaybackController((s) => s.play);

  const [genrePill, setGenrePill] = useState<GlobalRadioStationId>('paradise');
  const [eraTab, setEraTab] = useState<DecadesEraTab>('global');
  const [expansionPick, setExpansionPick] = useState<GlobalRadioStationId | null>(null);

  const [rpPreview, setRpPreview] = useState<{ title: string; artist: string; artwork: string } | null>(null);
  const [rpLoading, setRpLoading] = useState(true);
  const [liveByStation, setLiveByStation] = useState<
    Partial<Record<GlobalRadioStationId, GlobalRadioLivePreview>>
  >({});

  useEffect(() => {
    if (eraTab !== 'global') setExpansionPick(null);
  }, [eraTab]);

  const streamStation: GlobalRadioStationId = useMemo(() => {
    if (eraTab === 'global') {
      return expansionPick ?? genrePill;
    }
    return eraTab as GlobalRadioStationId;
  }, [eraTab, expansionPick, genrePill]);

  const streamDef = GLOBAL_RADIO_STATIONS[streamStation];
  const isThisStation =
    currentTrack?.source === 'global_radio' && currentTrack?.globalRadioStationId === streamStation;
  const isPlayingStation = isThisStation && playbackState === 'playing';

  const needsRpPreview = streamDef.metadataSource === 'radioparadise_api';

  useEffect(() => {
    if (!needsRpPreview) {
      setRpLoading(false);
      return;
    }
    let cancelled = false;
    setRpLoading(true);
    fetchRadioParadiseNowPlaying()
      .then((m) => {
        if (!cancelled && m) setRpPreview(m);
      })
      .finally(() => {
        if (!cancelled) setRpLoading(false);
      });
    const t = setInterval(() => {
      fetchRadioParadiseNowPlaying().then((m) => {
        if (!cancelled && m) setRpPreview(m);
      });
    }, 20_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [needsRpPreview]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      void fetchGlobalRadioLivePreviewMap().then((m) => {
        if (!cancelled) setLiveByStation(m);
      });
    };
    run();
    const iv = setInterval(run, 28_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  const staticLiveFor = useCallback(
    (id: GlobalRadioStationId) =>
      GLOBAL_RADIO_STATIONS[id].metadataSource === 'radioparadise_api'
        ? null
        : liveByStation[id] ?? null,
    [liveByStation],
  );

  const pillLiveArtwork = useMemo(() => {
    const o: Partial<Record<GlobalRadioStationId, string>> = {};
    (Object.entries(liveByStation) as Array<[GlobalRadioStationId, GlobalRadioLivePreview]>).forEach(
      ([k, v]) => {
        if (v?.artwork) o[k] = v.artwork;
      },
    );
    return o;
  }, [liveByStation]);

  const onPlay = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const tr = buildGlobalRadioTrack(
      streamStation,
      needsRpPreview ? rpPreview : null,
      staticLiveFor(streamStation),
    );
    void playTrack(tr, [tr], { expandNowPlaying: true });
  }, [playTrack, streamStation, rpPreview, staticLiveFor, needsRpPreview]);

  const onToggle = useCallback(() => {
    if (isPlayingStation) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void pause();
      return;
    }
    if (isThisStation && playbackState === 'paused') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      void play();
      return;
    }
    onPlay();
  }, [isPlayingStation, isThisStation, playbackState, onPlay, pause, play]);

  const onSelectGenrePill = useCallback(
    (id: GlobalRadioStationId) => {
      setGenrePill(id);
      if (eraTab !== 'global' || expansionPick !== null) return;
      const playing = usePlaybackController.getState();
      const cur = playing.currentTrack;
      const shouldSwap =
        cur?.source === 'global_radio' &&
        (playing.playbackState === 'playing' || playing.playbackState === 'paused');
      if (!shouldSwap) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const tr = buildGlobalRadioTrack(
        id,
        GLOBAL_RADIO_STATIONS[id].metadataSource === 'radioparadise_api' ? rpPreview : null,
        staticLiveFor(id),
      );
      void playTrack(tr, [tr], { expandNowPlaying: false });
    },
    [playTrack, rpPreview, staticLiveFor, eraTab, expansionPick],
  );

  const onExpansionPick = useCallback(
    (id: GlobalRadioStationId) => {
      setExpansionPick(id);
      const tr = buildGlobalRadioTrack(id, null, staticLiveFor(id));
      void playTrack(tr, [tr], { expandNowPlaying: false });
    },
    [playTrack, staticLiveFor],
  );

  const liveSnap = needsRpPreview ? null : liveByStation[streamStation];
  const artUri =
    needsRpPreview
      ? rpPreview?.artwork || RADIO_PARADISE_BRAND_LOGO_URL
      : liveSnap?.artwork || streamDef.staticNowPlaying?.artwork || streamDef.brandArtworkUrl;
  const titlePreview =
    needsRpPreview
      ? rpPreview?.title ?? (rpLoading ? '…' : '—')
      : liveSnap?.title ?? streamDef.staticNowPlaying?.title ?? '—';
  const artistPreview =
    needsRpPreview
      ? rpPreview?.artist ?? ''
      : liveSnap?.artist ?? streamDef.staticNowPlaying?.artist ?? streamDef.diChannelTag;

  const showGlobalList = eraTab === 'global';
  const showCard = !showGlobalList || expansionPick !== null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }]}>
      <GlobalRadioPillBar
        selectedId={genrePill}
        onSelect={onSelectGenrePill}
        paradiseArtUri={rpPreview?.artwork?.trim() ? rpPreview.artwork : null}
        liveArtworkById={pillLiveArtwork}
      />

      <DecadesVaultEraStrip selected={eraTab} onSelect={setEraTab} />

      <View style={styles.headerRow}>
        <Radio color={accent} size={22} strokeWidth={2.2} />
        <Text style={styles.header}>Vybe Radio</Text>
      </View>
      <Text style={styles.sub}>
        {eraTab === 'global' ? 'Global relays' : 'Decades Vault'} · {streamDef.pillLabel}
      </Text>

      {showGlobalList ? (
        <View style={[styles.listShell, { borderColor: hexToRgba(accent, 0.28) }]}>
          <Text style={styles.listHint}>Select a station</Text>
          <GlobalExpansionRadioList
            selectedId={expansionPick}
            accent={accent}
            onPick={onExpansionPick}
          />
        </View>
      ) : null}

      {showCard ? (
        <View style={[styles.card, { borderColor: hexToRgba(accent, 0.35) }]}>
          {needsRpPreview && rpLoading && !rpPreview ? (
            <ActivityIndicator color={accent} style={{ marginVertical: 40 }} />
          ) : (
            <>
              <View style={styles.artWrap}>
                <Image source={{ uri: artUri }} style={styles.art} contentFit="cover" transition={200} />
                <Pressable
                  onPress={onToggle}
                  style={styles.artPlayOverlay}
                  accessibilityRole="button"
                  accessibilityLabel={isPlayingStation ? 'Pause stream' : 'Play stream'}
                >
                  <View
                    style={[
                      styles.artPlayFab,
                      { borderColor: hexToRgba(accent, 0.95), backgroundColor: 'rgba(0,0,0,0.42)' },
                    ]}
                  >
                    {isThisStation &&
                    (playbackState === 'loading' || playbackState === 'buffering') ? (
                      <ActivityIndicator color={accent} />
                    ) : isPlayingStation ? (
                      <Pause size={30} color={accent} fill={accent} />
                    ) : (
                      <Play size={30} color={accent} fill={accent} style={{ marginLeft: 3 }} />
                    )}
                  </View>
                </Pressable>
              </View>
              <Text style={styles.onAir} numberOfLines={1}>
                {titlePreview}
              </Text>
              <Text style={[styles.onAirArtist, { color: accent }]} numberOfLines={2}>
                {artistPreview}
              </Text>
              <View style={styles.soulOverlay}>
                <RadioParadiseSoulActions
                  layout="full"
                  tabContext={{ stationId: streamStation, rpPreview }}
                />
              </View>
            </>
          )}
        </View>
      ) : null}

      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.cta, { backgroundColor: accent }, pressed && { opacity: 0.88 }]}
        accessibilityRole="button"
        accessibilityLabel={isPlayingStation ? 'Pause stream' : 'Play stream'}
      >
        {isThisStation && (playbackState === 'loading' || playbackState === 'buffering') ? (
          <ActivityIndicator color="#000" />
        ) : isPlayingStation ? (
          <Pause size={26} color="#000" fill="#000" />
        ) : (
          <Play size={26} color="#000" fill="#000" />
        )}
        <Text style={styles.ctaLabel}>{isPlayingStation ? 'Pause live stream' : 'Play live stream'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    paddingHorizontal: 16,
  },
  listShell: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#050505',
  },
  listHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  header: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  card: {
    marginTop: 16,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#050505',
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  artWrap: {
    width: 220,
    height: 220,
    borderRadius: 16,
    marginBottom: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  art: {
    width: '100%',
    height: '100%',
  },
  artPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artPlayFab: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onAir: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  onAirArtist: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.6,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  soulOverlay: {
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  ctaLabel: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '800',
  },
});
