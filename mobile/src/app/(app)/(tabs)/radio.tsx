import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Play, Pause, Radio } from 'lucide-react-native';
import { usePlaybackController } from '@/stores/playbackController';
import type { Track } from '@/types/music';
import { RADIO_PARADISE_BRAND_LOGO_URL } from '@/constants/radioParadise';
import { fetchRadioParadiseNowPlaying } from '@/lib/radioParadiseApi';
import { RadioParadiseSoulActions } from '@/components/radio/RadioParadiseSoulActions';
import {
  buildGlobalRadioTrack,
  type GlobalRadioStationId,
  GLOBAL_RADIO_STATIONS,
} from '@/lib/GlobalRadioClient';
import { GlobalRadioPillBar } from '@/components/radio/GlobalRadioPillBar';

function isGlobalRadioPlaying(
  current: Track | null,
  station: GlobalRadioStationId,
  playbackState: string,
): boolean {
  return (
    current?.globalRadioStationId === station &&
    current?.source === 'global_radio' &&
    playbackState === 'playing'
  );
}

export default function GlobalRadioTabScreen() {
  const insets = useSafeAreaInsets();
  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const playbackState = usePlaybackController((s) => s.playbackState);
  const playTrack = usePlaybackController((s) => s.playTrack);
  const pause = usePlaybackController((s) => s.pause);
  const play = usePlaybackController((s) => s.play);

  const [station, setStation] = useState<GlobalRadioStationId>('paradise');
  const [rpPreview, setRpPreview] = useState<{ title: string; artist: string; artwork: string } | null>(null);
  const [rpLoading, setRpLoading] = useState(true);

  const def = GLOBAL_RADIO_STATIONS[station];
  const isThisStation =
    currentTrack?.source === 'global_radio' && currentTrack?.globalRadioStationId === station;
  const isPlayingStation = isThisStation && playbackState === 'playing';

  useEffect(() => {
    if (def.metadataSource !== 'radioparadise_api') {
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
  }, [def.metadataSource]);

  const onPlay = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const tr = buildGlobalRadioTrack(station, station === 'paradise' ? rpPreview : null);
    void playTrack(tr, [tr], { expandNowPlaying: true });
  }, [playTrack, station, rpPreview]);

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

  const onSelectStation = useCallback(
    (id: GlobalRadioStationId) => {
      setStation(id);
      const playing = usePlaybackController.getState();
      const cur = playing.currentTrack;
      const shouldSwap =
        cur?.source === 'global_radio' &&
        (playing.playbackState === 'playing' || playing.playbackState === 'paused');
      if (shouldSwap) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const tr = buildGlobalRadioTrack(id, id === 'paradise' ? rpPreview : null);
        void playTrack(tr, [tr], { expandNowPlaying: false });
      }
    },
    [playTrack, rpPreview],
  );

  const artUri =
    station === 'paradise'
      ? rpPreview?.artwork || RADIO_PARADISE_BRAND_LOGO_URL
      : def.staticNowPlaying?.artwork || RADIO_PARADISE_BRAND_LOGO_URL;
  const titlePreview =
    station === 'paradise' ? rpPreview?.title ?? (rpLoading ? '…' : '—') : def.staticNowPlaying?.title ?? '—';
  const artistPreview =
    station === 'paradise'
      ? rpPreview?.artist ?? ''
      : def.staticNowPlaying?.artist ?? def.diChannelTag;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 24 }]}>
      <GlobalRadioPillBar selectedId={station} onSelect={onSelectStation} />

      <View style={styles.headerRow}>
        <Radio color="#00FFFF" size={22} strokeWidth={2.2} />
        <Text style={styles.header}>Vybe Radio</Text>
      </View>
      <Text style={styles.sub}>Hi‑fi relays · {def.pillLabel}</Text>

      <View style={styles.card}>
        {station === 'paradise' && rpLoading && !rpPreview ? (
          <ActivityIndicator color="#00FFFF" style={{ marginVertical: 40 }} />
        ) : (
          <>
            <Image source={{ uri: artUri }} style={styles.art} contentFit="cover" transition={200} />
            <Text style={styles.onAir} numberOfLines={1}>
              {titlePreview}
            </Text>
            <Text style={styles.onAirArtist} numberOfLines={2}>
              {artistPreview}
            </Text>
            <View style={styles.soulOverlay}>
              <RadioParadiseSoulActions layout="full" tabContext={{ stationId: station, rpPreview }} />
            </View>
          </>
        )}
      </View>

      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }]}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
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
    marginTop: 20,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,255,255,0.35)',
    backgroundColor: '#050505',
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
  },
  art: {
    width: 220,
    height: 220,
    borderRadius: 16,
    marginBottom: 18,
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
    color: '#00E5FF',
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
    backgroundColor: '#00FFFF',
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
