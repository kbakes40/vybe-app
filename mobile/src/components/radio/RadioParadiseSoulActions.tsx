import React, { useEffect, useMemo } from 'react';
import { View, Pressable, StyleSheet, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Heart, Flame } from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  vaultRadioParadiseCurrentTrackFromApi,
  queueVaultFromArtistTitle,
} from '@/lib/vault/VaultService';
import { fetchRadioParadiseNowPlaying } from '@/lib/radioParadiseApi';
import { useHighEnergyRadioStore } from '@/stores/highEnergyRadioStore';
import { useDynamicIslandSignal } from '@/stores/dynamicIslandStore';
import { useShadowPlaybackToastStore } from '@/stores/shadowPlaybackToastStore';
import { usePlaybackController } from '@/stores/playbackController';
import { NAV_BAR_PURPLE } from '@/constants/machinedTheme';
import { useThemeStore } from '@/stores/themeStore';
import { hexToRgba } from '@/lib/themeColorUtils';
import {
  GLOBAL_RADIO_STATIONS,
  type GlobalRadioStationId,
} from '@/lib/GlobalRadioClient';

export type RadioParadiseSoulActionsLayout = 'full' | 'island_compact';

export type RadioTabSoulContext = {
  stationId: GlobalRadioStationId;
  rpPreview: { artist: string; title: string } | null;
};

export function RadioParadiseSoulActions({
  layout = 'full',
  tabContext,
}: {
  layout?: RadioParadiseSoulActionsLayout;
  /** When set (Radio tab), actions work from preview even if nothing is playing. */
  tabContext?: RadioTabSoulContext;
}) {
  const compact = layout === 'island_compact';
  const icon = compact ? 15 : 22;
  const pad = compact ? 5 : 11;
  const accent = useThemeStore((s) => s.accentColor);
  const heartChrome = useMemo(
    () => ({
      borderColor: hexToRgba(accent, 0.85),
      ...(Platform.OS === 'ios' ? { shadowColor: accent } : {}),
    }),
    [accent],
  );

  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const currentSource = usePlaybackController((s) => s.currentSource);
  const isLiveRadio = currentSource === 'global_radio' || currentSource === 'radio_paradise';

  const tabDef = tabContext ? GLOBAL_RADIO_STATIONS[tabContext.stationId] : null;
  const useRpApi = tabDef
    ? tabDef.metadataSource === 'radioparadise_api'
    : currentTrack?.globalRadioMetadataSource === 'radioparadise_api' ||
      (currentSource === 'radio_paradise' && currentTrack?.globalRadioMetadataSource !== 'static');
  const fireMax = tabDef ? tabDef.firePulse === 'max' : currentTrack?.globalRadioFirePulse === 'max';

  const fireGlow = useSharedValue(0.55);

  useEffect(() => {
    if (!fireMax) {
      cancelAnimation(fireGlow);
      fireGlow.value = 0.55;
      return;
    }
    fireGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 180, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.45, { duration: 180, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    return () => {
      cancelAnimation(fireGlow);
      fireGlow.value = 0.55;
    };
  }, [fireMax, fireGlow]);

  const fireShellPulseStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.55 + fireGlow.value * 0.45,
    shadowRadius: 10 + fireGlow.value * 14,
  }));

  const onHeart = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (tabDef) {
      if (useRpApi) {
        vaultRadioParadiseCurrentTrackFromApi();
      } else if (tabDef.staticNowPlaying) {
        queueVaultFromArtistTitle(tabDef.staticNowPlaying.artist, tabDef.staticNowPlaying.title);
      }
    } else if (useRpApi) {
      vaultRadioParadiseCurrentTrackFromApi();
    } else if (currentTrack?.artist || currentTrack?.title) {
      queueVaultFromArtistTitle(currentTrack!.artist, currentTrack!.title);
    }
    useShadowPlaybackToastStore.getState().showMicroToast('VAULTED', { placement: 'top' });
  };

  const onFire = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    void (async () => {
      let artist = '';
      let title = '';
      if (tabDef) {
        if (useRpApi) {
          const meta = await fetchRadioParadiseNowPlaying();
          artist = meta?.artist ?? '';
          title = meta?.title ?? '';
        } else if (tabDef.staticNowPlaying) {
          artist = tabDef.staticNowPlaying.artist;
          title = tabDef.staticNowPlaying.title;
        }
      } else {
        artist = currentTrack?.artist ?? '';
        title = currentTrack?.title ?? '';
        if (useRpApi) {
          const meta = await fetchRadioParadiseNowPlaying();
          if (meta) {
            artist = meta.artist;
            title = meta.title;
          }
        }
      }
      if (artist || title) {
        useHighEnergyRadioStore.getState().logRadioOnAir(artist, title);
      }
      useDynamicIslandSignal.getState().flashRadioMachinedPulse();
      useShadowPlaybackToastStore.getState().showMicroToast('HYPED', { placement: 'top' });
    })();
  };

  if (!tabContext && (!isLiveRadio || !currentTrack)) {
    return null;
  }

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Pressable
        onPress={onHeart}
        style={({ pressed }) => [
          styles.heartShell,
          heartChrome,
          { padding: pad },
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Vault current track"
      >
        <Heart size={icon} color={accent} strokeWidth={2.25} />
      </Pressable>
      <Animated.View style={[fireMax && fireShellPulseStyle, fireMax && { shadowColor: accent }]}>
        <Pressable
          onPress={onFire}
          style={({ pressed }) => [styles.fireShell, { padding: pad }, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Log high energy track"
        >
          <Flame size={icon} color={NAV_BAR_PURPLE} strokeWidth={2.25} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  rowCompact: {
    gap: 8,
  },
  pressed: {
    opacity: 0.88,
  },
  heartShell: {
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios'
      ? {
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.45,
          shadowRadius: 8,
        }
      : { elevation: 6 }),
  },
  fireShell: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(139,92,246,0.55)',
    backgroundColor: 'rgba(20,12,32,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: NAV_BAR_PURPLE,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.85,
          shadowRadius: 12,
        }
      : { elevation: 8 }),
  },
});
