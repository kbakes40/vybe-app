import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Dimensions,
  Linking,
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  TextLayoutEventData,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Pressable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Check, Pause, Play, SkipForward } from 'lucide-react-native';
import { usePlaybackController } from '@/stores/playbackController';
import { RADIO_PARADISE_BRAND_LOGO_URL } from '@/constants/radioParadise';
import { useDynamicIslandSignal } from '@/stores/dynamicIslandStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { useThemeStore } from '@/stores/themeStore';
import { hexToRgb, hexToRgba } from '@/lib/themeColorUtils';
import { RadioParadiseSoulActions } from '@/components/radio/RadioParadiseSoulActions';
import { usePillLockStore } from '@/stores/pillLockStore';
import { getExpandedIslandThemeLabel, getIslandLosslessTag } from '@/lib/pillStreamQuality';
import { isLouisDevice } from '@/constants/louisOledProfile';
import {
  syncLouisPillExpandKickExpanded,
  syncLouisPillKickDelta,
} from '@/lib/louisPillExpandKick';
import {
  EXPANDED_EXTRA_TITLE_LINE_PT,
  EXPANDED_PILL_MAX_HEIGHT_PT,
  EXPANDED_PILL_MIN_HEIGHT_PT,
} from '@/constants/pillIslandGeometry';

/**
 * Global interactive pill mounted above navigation chrome.
 * - Idle: slim centered pill aligned on the hardware Dynamic Island band.
 * - Playing: morphs wider to show track metadata + magenta heartbeat.
 * - Tap: expands into a Shadow Sexy mini-controller (art + transport).
 * - Long press (pill): flips to a DaVinci Dynamics system-status card for 2.4s.
 * - Long press (expanded “POWERED_BY_DAVINCI”): QA — runs simulateVaultFailure (shadow heal / SC match).
 * - Easter egg: when the current track artist is MainStreetTeesUS the border
 *   glows Neon Amber instead of Machined Blue.
 */

const NEON_MAGENTA = '#FF00D4';
const NEON_AMBER = '#FFB020';
const NEON_RED = '#FF3355';
const SOUNDCLOUD_IGNITION_ORANGE = '#FF3300';
/** Baby blue pulse while the backend auto-heals a failed YouTube vault (SHADOW_HEALING). */
const BABY_BLUE = '#9FD9FF';
/** Machined cyan — pill border + outer glow (RESTORE_PILL_GLOW). */
const PILL_CYAN = '#00E5FF';

const SPRING = { stiffness: 200, damping: 20, mass: 0.7 } as const;

/**
 * DISABLE_NOW_PLAYING_SNAP — pill geometry uses a weighted exp ease-out so the
 * expansion feels mechanical rather than springy. Same timing is shared by the
 * kick inset (see {@link louisPillExpandKick}) so the kick lands in lockstep.
 */
const PILL_EASE_DURATION_MS = 360;
const PILL_GEO_EASE = Easing.out(Easing.exp);
const PILL_GEO_TIMING = { duration: PILL_EASE_DURATION_MS, easing: PILL_GEO_EASE } as const;

type DIState = 'idle' | 'playing' | 'expanded' | 'davinci' | 'recovery' | 'success';

// Pill morphology per state (container width / height).
// Playing morphs to 95% of the screen width per the IMG_3643 "Integrated Notch"
// spec; expanded anchors to the same width so the mini-controller feels like a
// continuation. Idle pill is vertically centered on the hardware Dynamic Island
// band (hardware DI alignment); expanded state grows downward from there.
const SCREEN_W = Dimensions.get('window').width;
const ACTIVE_W = Math.round(SCREEN_W * 0.95);

const GEO = {
  idle: { w: 124, h: 36 },
  playing: { w: ACTIVE_W, h: 44 },
  expanded: { w: ACTIVE_W, h: EXPANDED_PILL_MIN_HEIGHT_PT },
  davinci: { w: Math.min(ACTIVE_W, 300), h: 64 },
  recovery: { w: Math.min(ACTIVE_W, 320), h: 44 },
  success: { w: Math.min(ACTIVE_W, 280), h: 44 },
} as const;

const EGG_ARTIST_MATCH = /mainstreet\s*tees/i;

function isEasterEggTrack(artist?: string | null): boolean {
  return !!artist && EGG_ARTIST_MATCH.test(artist);
}

/**
 * Renders a 6-spoke fire-particle burst that fans outward from the pill
 * centre when a Fire tap is registered. Lives inside the pill's clip so
 * embers never leak past the rounded chrome — keeps the effect feeling
 * "contained heat" instead of background fireworks.
 */
const FireParticleLayer = React.memo(function FireParticleLayer({
  burstSV,
}: {
  burstSV: SharedValue<number>;
}) {
  const angles = React.useMemo(
    () => Array.from({ length: 6 }, (_, i) => (i * Math.PI * 2) / 6),
    [],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.fireBurstHost}>
        {angles.map((angle, idx) => (
          <FireParticle key={idx} angle={angle} burstSV={burstSV} />
        ))}
      </View>
    </View>
  );
});

function FireParticle({
  angle,
  burstSV,
}: {
  angle: number;
  burstSV: SharedValue<number>;
}) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const style = useAnimatedStyle(() => {
    const t = burstSV.value;
    return {
      opacity: t > 0 ? Math.max(0, 1 - t * 1.05) : 0,
      transform: [
        { translateX: dx * 26 * t },
        { translateY: dy * 14 * t },
        { scale: 0.6 + t * 0.6 },
      ],
    };
  });
  return <Animated.View style={[styles.fireParticle, style]} />;
}

export function DynamicIsland() {
  const insets = useSafeAreaInsets();
  const allowIslandSurfaces = usePillLockStore((s) => s.allowIslandSurfaces);

  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const playbackState = usePlaybackController((s) => s.playbackState);
  const togglePlay = usePlaybackController((s) =>
    s.playbackState === 'playing' ? s.pause : s.play,
  );
  const next = usePlaybackController((s) => s.next);
  const currentSource = usePlaybackController((s) => s.currentSource);
  const playbackError = usePlaybackController((s) => s.error);
  const healingStreamActive = useDynamicIslandSignal((s) => s.healingStreamActive);
  const scIgnitionGlow = useDynamicIslandSignal((s) => s.scIgnitionGlow);
  const firedAt = useDynamicIslandSignal((s) => s.firedAt);
  const radioMachinedPulseAt = useDynamicIslandSignal((s) => s.radioMachinedPulseAt);
  /** Premium fidelity badge — drives the HD pill chip rendered in the playing row. */
  const isPremium = useSubscriptionStore((s) => s.tier === 'plus');

  const successAt = useDynamicIslandSignal((s) => s.successAt);
  const successLabel = useDynamicIslandSignal((s) => s.successLabel);
  const recoveryLabelOverride = useDynamicIslandSignal((s) => s.recoveryLabel);

  const isPlaying = playbackState === 'playing' && !!currentTrack;
  const isLiveRadio = currentSource === 'global_radio' || currentSource === 'radio_paradise';
  const chillLead = isLiveRadio && currentTrack?.globalRadioDiLeading === 'chill';
  const diTag = currentTrack?.globalRadioDiTag;
  /** Slim pill: RP mark / station art / chill glyph. */
  const rpIslandThumb =
    isLiveRadio &&
    (currentTrack?.globalRadioStationId === 'paradise' ||
      currentTrack?.globalRadioStationId === 'vault_modern');
  const metaThumbUri = chillLead
    ? null
    : rpIslandThumb
      ? RADIO_PARADISE_BRAND_LOGO_URL
      : currentTrack?.artwork;
  const expandedArtUri =
    rpIslandThumb
      ? currentTrack?.artwork || RADIO_PARADISE_BRAND_LOGO_URL
      : currentTrack?.artwork;
  const metaArtistLine =
    isLiveRadio && diTag
      ? `${diTag} · ${currentTrack?.artist ?? ''}`.replace(/\s·\s$/, '')
      : currentTrack?.artist ?? '';

  const losslessTag = useMemo(
    () => getIslandLosslessTag(currentTrack ?? undefined, currentSource ?? undefined),
    [currentTrack, currentSource],
  );
  const expandedThemeLabel = useMemo(
    () =>
      getExpandedIslandThemeLabel(
        currentTrack ?? undefined,
        currentSource ?? undefined,
        losslessTag,
        isPremium,
      ),
    [currentTrack, currentSource, losslessTag, isPremium],
  );
  const isStreamResolving =
    !!currentTrack &&
    (currentSource === 'youtube' || currentSource === 'youtube_music') &&
    (playbackState === 'loading' || playbackState === 'buffering');
  /** Wide pill + metadata whenever a track is engaged (not idle / ended / error). */
  const showAsPlayingBar =
    !!currentTrack &&
    (playbackState === 'playing' ||
      playbackState === 'paused' ||
      playbackState === 'loading' ||
      playbackState === 'buffering');
  const showVaultTimeoutLane = recoveryLabelOverride === 'VAULT_TIMEOUT';
  const isRecovering =
    (playbackState === 'error' && !!currentTrack) || showVaultTimeoutLane;
  const eggActive = isEasterEggTrack(currentTrack?.artist);

  /** PILL_LOCK_V2 — synced from root `PillLockSync` (session + route). */
  const suppress = !allowIslandSurfaces;
  const isLouis = useMemo(() => isLouisDevice(), []);

  /** Reset when leaving expanded so title `onTextLayout` can re-apply height after re-open. */
  const expandedTitleLayoutKeyRef = useRef('');

  // Local UI state kept in a ref so handlers see the latest without stale closures.
  const stateRef = useRef<DIState>('idle');
  const stateSV = useSharedValue(0); // 0=idle, 1=playing, 2=expanded, 3=davinci
  const widthSV = useSharedValue<number>(GEO.idle.w);
  const heightSV = useSharedValue<number>(GEO.idle.h);
  const borderHueSV = useSharedValue(0); // 0 = blue, 1 = amber
  /** 0 = machined blue family, 1 = SoundCloud ignition orange (after scMatchPromise). */
  const scIgnitionSV = useSharedValue(0);
  /** 0 → resting dim hairline; 1 → full Machined-Blue bloom (glow + tint). */
  const glowIntensitySV = useSharedValue(0);
  const magPulse = useSharedValue(0.35);
  const davinciOpacity = useSharedValue(0);
  const metaOpacity = useSharedValue(0);
  const expandedOpacity = useSharedValue(0);
  const isResolvingSV = useSharedValue(0);
  const resolvePulse = useSharedValue(0);
  const recoveryOpacity = useSharedValue(0);
  const recoveryHueSV = useSharedValue(0);
  /** Pulses 0.45 → 1 while healingStreamActive — drives SHADOW_HEALING text breathing. */
  const healingPulseSV = useSharedValue(0.45);
  const successOpacity = useSharedValue(0);
  const successCheckSV = useSharedValue(0);
  /** 0 → no flare; 1 → full SC-Orange border bloom from a Fire tap. */
  const fireFlareSV = useSharedValue(0);
  /** 0 → particles hidden; 1 → particles fully spread (radial fire burst). */
  const fireBurstSV = useSharedValue(0);
  /** Radio "HYPE" — brief Machined Cyan takeover of pill chrome (~1s). */
  const radioCyanPulseSV = useSharedValue(0);

  const accentColor = useThemeStore((s) => s.accentColor);
  const accentR = useSharedValue(0);
  const accentG = useSharedValue(255);
  const accentB = useSharedValue(255);

  useEffect(() => {
    const { r, g, b } = hexToRgb(accentColor);
    accentR.value = r;
    accentG.value = g;
    accentB.value = b;
  }, [accentColor, accentR, accentG, accentB]);

  const accentChrome = useMemo(
    () => ({
      metaThumbFallback: { backgroundColor: hexToRgba(accentColor, 0.18) },
      chillThumb: { borderColor: hexToRgba(accentColor, 0.45) },
      chillBar: { backgroundColor: accentColor },
      healingLine: { color: accentColor, textShadowColor: accentColor },
      transportBtn: {
        backgroundColor: hexToRgba(accentColor, 0.1),
        borderColor: hexToRgba(accentColor, 0.55),
      },
      davinciStatus: { color: accentColor },
      recoveryDotHealing: { backgroundColor: accentColor, shadowColor: accentColor },
      recoveryStatusHealing: { color: accentColor, textShadowColor: accentColor },
      successCheckHost: {
        backgroundColor: hexToRgba(accentColor, 0.16),
        borderColor: accentColor,
        shadowColor: accentColor,
      },
      successLabel: { color: accentColor },
      hdBadge: {
        backgroundColor: 'transparent',
        borderWidth: 0,
      },
      hdBadgeText: { color: accentColor },
    }),
    [accentColor],
  );

  /** Cyan-tinted recovery states (auto-heal / token refresh) vs red errors. */
  const isHealingLabel =
    recoveryLabelOverride === 'SHADOW_HEALING' ||
    recoveryLabelOverride === 'TOKEN_REFRESH' ||
    recoveryLabelOverride === 'VAULT_TIMEOUT';

  // Derive geometry targets from logical state.
  const applyState = useCallback(
    (next: DIState) => {
      const prevState = stateRef.current;
      if ((prevState === 'expanded') !== (next === 'expanded')) {
        expandedTitleLayoutKeyRef.current = '';
      }
      stateRef.current = next;
      const geo = GEO[next];
      widthSV.value = withTiming(geo.w, PILL_GEO_TIMING);
      heightSV.value = withTiming(geo.h, PILL_GEO_TIMING);
      stateSV.value = withTiming(
        next === 'idle'
          ? 0
          : next === 'playing'
            ? 1
            : next === 'expanded'
              ? 2
              : next === 'davinci'
                ? 3
                : next === 'recovery'
                  ? 4
                  : 5,
        { duration: 220 },
      );
      metaOpacity.value = withTiming(next === 'playing' ? 1 : 0, { duration: 180 });
      expandedOpacity.value = withTiming(next === 'expanded' ? 1 : 0, { duration: 200 });
      davinciOpacity.value = withTiming(next === 'davinci' ? 1 : 0, { duration: 180 });
      recoveryOpacity.value = withTiming(next === 'recovery' ? 1 : 0, { duration: 200 });
      successOpacity.value = withTiming(next === 'success' ? 1 : 0, { duration: 200 });
      // UNIFY_PRO_MAX_LAYOUT — Kick fires on every device; 14 & 15 Pro Max
      // both slide tab content down to clear the expanded pill.
      syncLouisPillExpandKickExpanded(next === 'expanded');
    },
    [
      widthSV,
      heightSV,
      stateSV,
      metaOpacity,
      expandedOpacity,
      davinciOpacity,
      recoveryOpacity,
      successOpacity,
      isLouis,
    ],
  );

  const onExpandedTitleTextLayout = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (stateRef.current !== 'expanded') return;
      const n = Math.min(2, Math.max(1, e.nativeEvent.lines.length));
      const key = `${n}|${expandedThemeLabel ?? ''}|${currentTrack?.title ?? ''}`;
      if (key === expandedTitleLayoutKeyRef.current) return;
      expandedTitleLayoutKeyRef.current = key;
      let h =
        EXPANDED_PILL_MIN_HEIGHT_PT +
        (n - 1) * EXPANDED_EXTRA_TITLE_LINE_PT +
        (expandedThemeLabel ? 4 : 0) +
        (isLiveRadio ? 14 : 0);
      h = Math.min(EXPANDED_PILL_MAX_HEIGHT_PT, h);
      heightSV.value = withTiming(h, PILL_GEO_TIMING);
      syncLouisPillKickDelta(h - 44);
    },
    [currentTrack?.title, expandedThemeLabel, heightSV, isLouis, isLiveRadio],
  );

  useEffect(() => {
    if (suppress) syncLouisPillKickDelta(0);
  }, [suppress]);

  // Drive state from playback: idle ↔ playing ↔ recovery. Expanded / davinci
  // are transient user-driven modes that auto-revert.
  useEffect(() => {
    if (stateRef.current === 'expanded' || stateRef.current === 'davinci') return;
    if (isRecovering) {
      applyState('recovery');
      return;
    }
    applyState(showAsPlayingBar ? 'playing' : 'idle');
  }, [showAsPlayingBar, isRecovering, applyState]);

  // SUCCESS flash: external features (PostComposer, etc) bump `successAt` via
  // `useDynamicIslandSignal.flashSuccess()`. We morph the pill into a Shadow
  // Cyan checkmark for 2s, then revert. Skipped on auth screens (suppress).
  useEffect(() => {
    if (!successAt) return;
    if (suppress) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    successCheckSV.value = 0;
    successCheckSV.value = withSequence(
      withTiming(1, { duration: 220 }),
      withTiming(1, { duration: 1500 }),
      withTiming(0.4, { duration: 200 }),
    );
    applyState('success');
    const t = setTimeout(() => {
      if (stateRef.current === 'success') {
        applyState(showAsPlayingBar ? 'playing' : 'idle');
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [successAt, suppress, applyState, showAsPlayingBar, successCheckSV]);

  // Recovery border: pulse a Neon Red glow (vs the Machined Blue play state)
  // so the user sees something happened — playback hit a wall (502 / -1008).
  useEffect(() => {
    if (isRecovering) {
      recoveryHueSV.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 520 }),
          withTiming(0.4, { duration: 520 }),
        ),
        -1,
        true,
      );
      // Auto-revert to idle/playing after 4.2s if nothing else changes — error
      // state shouldn't be sticky on the pill if the user moves on.
      const t = setTimeout(() => {
        if (stateRef.current === 'recovery') {
          if (useDynamicIslandSignal.getState().recoveryLabel === 'VAULT_TIMEOUT') return;
          applyState(showAsPlayingBar ? 'playing' : 'idle');
        }
      }, 4200);
      return () => clearTimeout(t);
    } else {
      recoveryHueSV.value = withTiming(0, { duration: 200 });
    }
  }, [isRecovering, recoveryHueSV, applyState, showAsPlayingBar]);

  // Border hue: amber when the MainStreetTees easter egg is active, otherwise blue.
  useEffect(() => {
    borderHueSV.value = withTiming(eggActive ? 1 : 0, { duration: 280 });
  }, [eggActive, borderHueSV]);

  useEffect(() => {
    const on =
      scIgnitionGlow && currentSource === 'soundcloud' && !eggActive;
    scIgnitionSV.value = withTiming(on ? 1 : 0, { duration: 280 });
  }, [scIgnitionGlow, currentSource, eggActive, scIgnitionSV]);

  // Fire flare — every Fire tap on Now Playing bumps `firedAt`, which fires
  // an SC-Orange border bloom + a one-shot particle burst. The flare bleeds
  // out over ~1.6s so the user gets crisp tactile feedback before the pill
  // returns to its prior visual state (Machined Blue or steady SC ignition).
  // Layout effect: sync with `flashFire()` before paint so Reanimated owns
  // the burst from the same frame as the Fire `onPress` (not a later commit).
  useLayoutEffect(() => {
    if (!firedAt) return;
    fireFlareSV.value = withSequence(
      withTiming(1, { duration: 180 }),
      withTiming(0.55, { duration: 420 }),
      withTiming(0, { duration: 1000 }),
    );
    fireBurstSV.value = 0;
    fireBurstSV.value = withSequence(
      withTiming(1, { duration: 380 }),
      withTiming(0, { duration: 520 }),
    );
  }, [firedAt, fireFlareSV, fireBurstSV]);

  useLayoutEffect(() => {
    if (!radioMachinedPulseAt) return;
    radioCyanPulseSV.value = 0;
    radioCyanPulseSV.value = withSequence(
      withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withTiming(0.88, { duration: 200, easing: Easing.inOut(Easing.quad) }),
      withTiming(0, { duration: 580, easing: Easing.in(Easing.cubic) }),
    );
  }, [radioMachinedPulseAt, radioCyanPulseSV]);

  // Machined-Blue bloom while playing — pill goes from a dim hairline to a
  // full neon glow. Play kick-in gets a brief over-shoot flash ("Integrated
  // Notch" pulse from IMG_3643) before settling to steady glow. Eases out on
  // pause so it feels like the track's energy is "charging" the pill.
  useEffect(() => {
    if (isPlaying || isStreamResolving) {
      glowIntensitySV.value = withSequence(
        withTiming(1.25, { duration: 260 }),
        withTiming(1, { duration: 360 }),
      );
    } else if (showAsPlayingBar) {
      // Paused with a queue — keep a soft cyan ring so title/artist stay legible in the pill.
      glowIntensitySV.value = withTiming(0.42, { duration: 320 });
    } else {
      glowIntensitySV.value = withTiming(0, { duration: 420 });
    }
  }, [isPlaying, isStreamResolving, showAsPlayingBar, glowIntensitySV]);

  // Magenta "heartbeat" while playing.
  useEffect(() => {
    if (isPlaying || isStreamResolving) {
      magPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 520 }),
          withTiming(0.35, { duration: 620 }),
        ),
        -1,
        true,
      );
    } else {
      magPulse.value = withTiming(0.35, { duration: 280 });
    }
  }, [isPlaying, isStreamResolving, magPulse]);

  // SHADOW_HEALING pulse — gentle breathing tied to healingStreamActive so
  // the cyan label reads as "the system is actively working" rather than a
  // static error. Cancelled the moment heal finishes (success or miss).
  useEffect(() => {
    if (healingStreamActive) {
      healingPulseSV.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 520 }),
          withTiming(0.45, { duration: 620 }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(healingPulseSV);
      healingPulseSV.value = withTiming(0.45, { duration: 220 });
    }
  }, [healingStreamActive, healingPulseSV]);

  useEffect(() => {
    isResolvingSV.value = withTiming(isStreamResolving ? 1 : 0, { duration: 160 });
    if (isStreamResolving) {
      resolvePulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 480 }),
          withTiming(0.12, { duration: 520 }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(resolvePulse);
      resolvePulse.value = withTiming(0.2, { duration: 220 });
    }
  }, [isStreamResolving, isResolvingSV, resolvePulse]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  /**
   * DISABLE_NOW_PLAYING_SNAP — pill expansion is fully decoupled from the
   * Now Playing sheet. Tapping the pill toggles its own collapsed/expanded
   * state in place. The page beneath stays anchored; only the pill grows
   * and the kick logic pushes content down to make room.
   */
  const handleTap = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const cur = stateRef.current;
    if (cur === 'expanded') {
      applyState(showAsPlayingBar ? 'playing' : 'idle');
      return;
    }
    if (cur === 'davinci') {
      applyState(showAsPlayingBar ? 'playing' : 'idle');
      return;
    }
    applyState('expanded');
  }, [applyState, showAsPlayingBar]);

  const handleLongPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    applyState('davinci');
    // Auto-revert after the user has time to read it.
    setTimeout(() => {
      if (stateRef.current === 'davinci') {
        applyState(showAsPlayingBar ? 'playing' : 'idle');
      }
    }, 2400);
  }, [applyState, showAsPlayingBar]);

  const openDavinci = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void Linking.openURL('https://davincidynamics.ai');
  }, []);

  /** Dev/QA: force vault-fail → SHADOW_HEALING + SoundCloud match path (see playbackController). */
  const handlePoweredByDavinciLongPress = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    void usePlaybackController.getState().simulateVaultFailure();
  }, []);

  // ── Animated styles ───────────────────────────────────────────────────────
  /**
   * RESTORE_PILL_GLOW — thin 1px cyan capsule, fully transparent fill, soft outer glow
   * breathing with playback energy (`glowIntensitySV`).
   */
  const pillAnimatedStyle = useAnimatedStyle(() => {
    const g = glowIntensitySV.value;
    const r = resolvePulse.value * isResolvingSV.value;
    const flare = fireFlareSV.value;
    const radioPulse = radioCyanPulseSV.value;
    const ring = g + r * 0.85 + flare * 0.9 + radioPulse * 0.5;
    const capped = ring > 1.45 ? 1.45 : ring;
    const glow = 0.22 + capped * 0.38;
    const radius = 999;
    return {
      width: widthSV.value,
      height: heightSV.value,
      borderRadius: radius,
      borderWidth: 1,
      borderColor: PILL_CYAN,
      backgroundColor: 'transparent',
      shadowColor: PILL_CYAN,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: glow,
      shadowRadius: 6 + capped * 14,
      elevation: Platform.OS === 'android' ? Math.min(12, 4 + Math.round(capped * 6)) : 0,
    };
  });

  /**
   * FIX_PILL_COLLISION — expanded pill must grow DOWNWARD from its resting
   * position, not lift up into the hardware Dynamic Island cutout. Removing
   * the -18pt lift keeps the cyan border clearly below Apple's system overlay.
   */
  const pillWrapLiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: 0 * expandedOpacity.value }],
  }));

  const magentaDotStyle = useAnimatedStyle(() => ({
    opacity: magPulse.value,
    transform: [{ scale: 0.85 + magPulse.value * 0.25 }],
  }));

  const metaStyle = useAnimatedStyle(() => ({ opacity: metaOpacity.value }));
  const expandedStyle = useAnimatedStyle(() => ({
    opacity: expandedOpacity.value,
    transform: [{ translateY: (1 - expandedOpacity.value) * -4 }],
  }));
  const davinciStyle = useAnimatedStyle(() => ({
    opacity: davinciOpacity.value,
    transform: [{ scale: 0.96 + davinciOpacity.value * 0.04 }],
  }));
  const recoveryStyle = useAnimatedStyle(() => ({
    opacity: recoveryOpacity.value,
    transform: [{ translateY: (1 - recoveryOpacity.value) * -3 }],
  }));
  const recoveryDotStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + recoveryHueSV.value * 0.6,
    transform: [{ scale: 0.85 + recoveryHueSV.value * 0.25 }],
  }));
  /** Cyan SHADOW_HEALING text — breathing opacity + subtle scale. */
  const healingPulseStyle = useAnimatedStyle(() => ({
    opacity: healingPulseSV.value,
    transform: [{ scale: 0.96 + healingPulseSV.value * 0.06 }],
  }));
  const successStyle = useAnimatedStyle(() => ({
    opacity: successOpacity.value,
    transform: [{ translateY: (1 - successOpacity.value) * -3 }],
  }));
  const successCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + successCheckSV.value * 0.5 }],
  }));

  /** Tiny ember dot pulse — overlay shown briefly while a Fire flare is active. */
  const fireDotStyle = useAnimatedStyle(() => ({
    opacity: fireFlareSV.value,
    transform: [{ scale: 0.6 + fireFlareSV.value * 0.5 }],
  }));

  // Anchor the pill *just below* the status bar instead of centered on the
  // hardware DI band. iOS renders the system status bar (clock/signal/battery)
  // in its own layer above app content — no zIndex beats it — so pills that
  // sit inside the status bar area end up with the clock visually on top and
  // the middle content occluded. Sitting 8pt below insets.top keeps the pill
  // fully visible while still feeling anchored to the top.
  /**
   * UNIFY_PRO_MAX_LAYOUT — hand-tuned −8pt lift locked for BOTH 14 Pro Max
   * and 15 Pro Max. Earlier device-split (`insets.top` on Louis) caused the
   * pill to float lower on the 14 than on the 15; both now use the same
   * baseline so the hardware DI alignment feels identical.
   */
  const pillTop = insets.top - 8;

  /** HD badge appears for premium subs whenever audio is engaged. */
  const showHdBadge = isPremium && (isPlaying || isStreamResolving);

  if (suppress) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.overlay, { top: 0 }]}
      // Critical: we sit ABOVE navigation chrome; box-none means only children
      // with a registered gesture actually grab touches.
    >
      <Animated.View
        pointerEvents="box-none"
        style={[styles.pillWrap, { top: pillTop }, pillWrapLiftStyle]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Vybe dynamic island"
          accessibilityHint="Tap to expand the mini player. Long-press for system status."
          onPress={handleTap}
          onLongPress={handleLongPress}
          delayLongPress={380}
          hitSlop={{ top: 6, bottom: 6, left: 12, right: 12 }}
        >
          <Animated.View style={[styles.pill, pillAnimatedStyle, isLouis && styles.pillLouisBlurHost]}>
            {isLouis ? (
              <BlurView
                pointerEvents="none"
                intensity={25}
                tint="dark"
                style={[StyleSheet.absoluteFillObject, styles.pillLouisBlurFill]}
              />
            ) : null}
            {/* ── IDLE / PLAYING compact content ─────────────────────────── */}
            <Animated.View
              pointerEvents="none"
              style={[styles.row, styles.metaRow, metaStyle]}
            >
              {chillLead ? (
                <View
                  style={[styles.metaThumb, styles.chillThumb, accentChrome.chillThumb]}
                  accessibilityLabel="Chill"
                >
                  <View style={[styles.chillBar, accentChrome.chillBar]} />
                  <View style={[styles.chillBar, styles.chillBarMid, accentChrome.chillBar]} />
                  <View style={[styles.chillBar, accentChrome.chillBar]} />
                </View>
              ) : metaThumbUri ? (
                <Image
                  source={{ uri: metaThumbUri }}
                  style={styles.metaThumb}
                  contentFit="cover"
                  transition={120}
                />
              ) : (
                <View style={[styles.metaThumb, styles.metaThumbFallback, accentChrome.metaThumbFallback]} />
              )}
              <View style={styles.metaText}>
                <Text numberOfLines={1} style={styles.metaTitle}>
                  {currentTrack?.title ?? 'Now Playing'}
                </Text>
                <View style={styles.metaArtistRow}>
                  <Text numberOfLines={1} style={styles.metaArtist}>
                    {metaArtistLine}
                  </Text>
                  {losslessTag ? (
                    <Text style={styles.metaFormatBadge} accessibilityLabel={`${losslessTag} stream`}>
                      {losslessTag}
                    </Text>
                  ) : null}
                </View>
                {healingStreamActive && isStreamResolving ? (
                  <Animated.Text
                    numberOfLines={1}
                    style={[styles.healingLine, accentChrome.healingLine, healingPulseStyle]}
                  >
                    SHADOW_HEALING
                  </Animated.Text>
                ) : null}
              </View>
              {showHdBadge ? (
                <View style={[styles.hdBadge, accentChrome.hdBadge]} pointerEvents="none">
                  <Text style={[styles.hdBadgeText, accentChrome.hdBadgeText]}>HD</Text>
                </View>
              ) : null}
              <Animated.View
                style={[
                  styles.heartbeat,
                  healingStreamActive && isStreamResolving ? styles.heartbeatHeal : null,
                  magentaDotStyle,
                ]}
              />
            </Animated.View>

            {/* ── FIRE FLARE: orange ember overlay during a Fire tap ───── */}
            <FireParticleLayer burstSV={fireBurstSV} />
            <Animated.View
              pointerEvents="none"
              style={[styles.fireEmberDot, fireDotStyle]}
            />

            {/* ── EXPANDED mini-controller ───────────────────────────────── */}
            {/*
             * EDGE_TO_EDGE_PILL — LEFT anchor: art + track text. RIGHT anchor:
             * fidelity badges + heart + transport. Wrapper is `space-between`,
             * so the architectural center stays empty (Machined gap). Strict
             * 8pt margin from the cyan border on both art and rightmost icon.
             */}
            <Animated.View
              pointerEvents={stateRef.current === 'expanded' ? 'auto' : 'none'}
              style={[StyleSheet.absoluteFill, styles.expandedRoot, expandedStyle]}
            >
              <View style={styles.expandedLeftGroup}>
                {expandedArtUri ? (
                  <Image
                    source={{ uri: expandedArtUri }}
                    style={styles.expandedArt}
                    contentFit="cover"
                    transition={160}
                  />
                ) : (
                  <View
                    style={[styles.expandedArt, styles.metaThumbFallback, accentChrome.metaThumbFallback]}
                  />
                )}
                <View style={styles.expandedText}>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={styles.expandedTitle}
                  >
                    {currentTrack?.title ?? 'Nothing playing'}
                  </Text>
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={styles.expandedArtist}
                  >
                    {currentTrack?.artist ?? 'Tap the pill any time to peek'}
                  </Text>
                  <Pressable
                    onLongPress={handlePoweredByDavinciLongPress}
                    delayLongPress={520}
                    hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
                    style={styles.expandedPoweredByHit}
                    accessibilityLabel="Powered by DaVinci"
                    accessibilityHint="Long press to simulate vault failure and shadow healing"
                  >
                    <Text numberOfLines={1} style={styles.expandedPoweredBy}>
                      POWERED_BY_DAVINCI
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.expandedRightGroup} pointerEvents="box-none">
                {losslessTag || expandedThemeLabel ? (
                  <View style={styles.expandedBadgeStack} pointerEvents="none">
                    {losslessTag ? (
                      <Text
                        style={styles.expandedFormatBadge}
                        accessibilityLabel={`${losslessTag} stream`}
                      >
                        {losslessTag}
                      </Text>
                    ) : null}
                    {expandedThemeLabel ? (
                      <Text numberOfLines={1} style={styles.expandedSourceBadge}>
                        {expandedThemeLabel}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {isLiveRadio ? (
                  <View style={styles.expandedSoulInline} pointerEvents="box-none">
                    <RadioParadiseSoulActions layout="island_compact" />
                  </View>
                ) : null}
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    void togglePlay();
                  }}
                  hitSlop={8}
                  style={[styles.transportBtn, accentChrome.transportBtn]}
                  disabled={!currentTrack}
                >
                  {isPlaying ? (
                    <Pause size={18} color={accentColor} strokeWidth={2.2} />
                  ) : (
                    <Play size={18} color={accentColor} strokeWidth={2.2} />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    next();
                  }}
                  hitSlop={8}
                  style={[styles.transportBtn, accentChrome.transportBtn]}
                  disabled={!currentTrack}
                >
                  <SkipForward size={18} color={accentColor} strokeWidth={2.2} />
                </Pressable>
              </View>
            </Animated.View>

            {/* ── DAVINCI system status card ─────────────────────────────── */}
            <Animated.View
              pointerEvents={stateRef.current === 'davinci' ? 'auto' : 'none'}
              style={[StyleSheet.absoluteFill, styles.davinciRoot, davinciStyle]}
            >
              <Pressable onPress={openDavinci} style={styles.davinciInner} hitSlop={6}>
                <Text style={[styles.davinciStatus, accentChrome.davinciStatus]}>SYSTEM STATUS: OPTIMIZED</Text>
                <Text style={styles.davinciSig}>Managed by DaVinci Dynamics</Text>
              </Pressable>
            </Animated.View>

            {/* ── MACHINED_RECOVERY: 502 / -1008 visual state ─────────────── */}
            <Animated.View
              pointerEvents={stateRef.current === 'recovery' ? 'auto' : 'none'}
              style={[StyleSheet.absoluteFill, styles.recoveryRoot, recoveryStyle]}
            >
              <Animated.View
                style={[
                  styles.recoveryDot,
                  isHealingLabel ? [styles.recoveryDotHealing, accentChrome.recoveryDotHealing] : null,
                  recoveryDotStyle,
                ]}
              />
              <Animated.View
                style={[
                  styles.recoveryText,
                  isHealingLabel ? healingPulseStyle : null,
                ]}
              >
                <Text
                  style={[
                    styles.recoveryStatus,
                    isHealingLabel ? [styles.recoveryStatusHealing, accentChrome.recoveryStatusHealing] : null,
                  ]}
                >
                  {recoveryLabelOverride ?? 'MACHINED_RECOVERY'}
                </Text>
                <Text style={styles.recoverySub} numberOfLines={1}>
                  {recoveryLabelOverride === 'TOKEN_REFRESH'
                    ? 'Minting fresh PO token…'
                    : recoveryLabelOverride === 'SHADOW_HEALING'
                      ? 'SoundCloud auto-heal…'
                      : recoveryLabelOverride === 'VAULT_TIMEOUT'
                        ? 'Vault still connecting — you can keep browsing'
                        : playbackError
                          ? playbackError.replace(/^Failed to play:\s*/i, '').slice(0, 42)
                          : 'Re-routing stream'}
                </Text>
              </Animated.View>
            </Animated.View>

            {/* ── SUCCESS: Shadow Cyan checkmark, ~2s flash ───────────────── */}
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, styles.successRoot, successStyle]}
            >
              <Animated.View
                style={[styles.successCheckHost, accentChrome.successCheckHost, successCheckStyle]}
              >
                <Check size={18} color={accentColor} strokeWidth={3} />
              </Animated.View>
              <Text style={[styles.successLabel, accentChrome.successLabel]} numberOfLines={1}>
                {successLabel ?? 'POSTED'}
              </Text>
            </Animated.View>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    elevation: 10000,
  },
  pillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  pillLouisBlurHost: {
    overflow: 'hidden',
  },
  pillLouisBlurFill: {
    borderRadius: 999,
    // EDGE_TO_EDGE_PILL — solid OLED black under the 25-blur so the pill
    // reads as a true #000000 plate, not a frosted screen tint.
    backgroundColor: '#000000',
  },
  pill: {
    backgroundColor: 'transparent',
    borderRadius: 999,
    overflow: 'visible',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 0 },
      },
      android: {},
      default: {},
    }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRow: {
    paddingHorizontal: 14,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metaThumb: {
    width: 22,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#111',
  },
  metaThumbFallback: {
    backgroundColor: 'rgba(0,229,255,0.18)',
  },
  chillThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,255,255,0.45)',
  },
  chillBar: {
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#00FFFF',
    opacity: 0.85,
  },
  chillBarMid: {
    width: 10,
    marginVertical: 3,
    opacity: 0.55,
  },
  metaText: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: Math.round(SCREEN_W * 0.58),
    marginLeft: 10,
    marginRight: 8,
  },
  metaTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    // UNIFY_PRO_MAX_LAYOUT — wider 0.5pt tracking so the title fills the pill.
    letterSpacing: 0.5,
  },
  metaArtistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  metaArtist: {
    color: '#67E8F9',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.15,
    flexShrink: 1,
    minWidth: 0,
  },
  metaFormatBadge: {
    marginLeft: 6,
    paddingHorizontal: 4,
    color: PILL_CYAN,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  healingLine: {
    marginTop: 3,
    // Pure Neon Cyan distinguishes this from a Neon Red error or the BABY_BLUE
    // progress shimmer. Pulses via `healingPulseStyle`.
    color: '#00FFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  heartbeat: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: NEON_MAGENTA,
  },
  heartbeatHeal: {
    backgroundColor: BABY_BLUE,
  },
  expandedRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    // EDGE_TO_EDGE_PILL — `space-between` pushes art/text to the left edge
    // and badges/heart/transport to the right edge, leaving a Machined
    // architectural gap in the middle. 8pt horizontal padding gives the
    // strict 8pt margin from the cyan border on both sides.
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    // UNIFY_PRO_MAX_LAYOUT — 20pt bottom pad so the row sits clear of
    // the pill's lower edge on both 14 and 15 Pro Max.
    paddingBottom: 20,
  },
  /** LEFT ANCHOR — album art + title/artist; max 50% of the pill width. */
  expandedLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: Math.floor(ACTIVE_W / 2) - 8,
  },
  expandedArt: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#111',
  },
  expandedText: {
    flexShrink: 1,
    minWidth: 0,
    marginLeft: 12,
    justifyContent: 'center',
  },
  expandedTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  expandedArtist: {
    color: '#67E8F9',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    flexShrink: 1,
    minWidth: 0,
  },
  expandedPoweredByHit: {
    minWidth: 0,
    justifyContent: 'center',
    paddingVertical: 2,
    marginTop: 4,
  },
  expandedPoweredBy: {
    color: 'rgba(148,148,158,0.92)',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 2.35,
    textTransform: 'uppercase',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontVariant: ['tabular-nums'],
  },
  /** RIGHT ANCHOR — fidelity badges + heart + transport, hugging the right cyan edge. */
  expandedRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    gap: 6,
  },
  expandedBadgeStack: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginRight: 2,
  },
  expandedFormatBadge: {
    color: PILL_CYAN,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  expandedSourceBadge: {
    marginTop: 2,
    color: PILL_CYAN,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
    opacity: 0.92,
    flexShrink: 0,
  },
  expandedSoulInline: {
    flexShrink: 0,
    justifyContent: 'center',
  },
  transportBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,229,255,0.55)',
  },
  davinciRoot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  davinciInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  davinciStatus: {
    color: '#00E5FF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2.6,
  },
  davinciSig: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  recoveryRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  recoveryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: NEON_RED,
    shadowColor: NEON_RED,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    marginRight: 10,
  },
  recoveryDotHealing: {
    backgroundColor: '#00FFFF',
    shadowColor: '#00FFFF',
  },
  recoveryText: {
    flex: 1,
    minWidth: 0,
  },
  recoveryStatus: {
    color: NEON_RED,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  recoveryStatusHealing: {
    color: '#00FFFF',
    textShadowColor: '#00FFFF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  recoverySub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginTop: 1,
  },
  successRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  successCheckHost: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#00E5FF',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 14,
    marginRight: 10,
  },
  successLabel: {
    color: '#00E5FF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  hdBadge: {
    marginRight: 8,
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  hdBadgeText: {
    color: '#00E5FF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  fireBurstHost: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fireParticle: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: SOUNDCLOUD_IGNITION_ORANGE,
    shadowColor: SOUNDCLOUD_IGNITION_ORANGE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  fireEmberDot: {
    position: 'absolute',
    bottom: 4,
    alignSelf: 'center',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SOUNDCLOUD_IGNITION_ORANGE,
    shadowColor: SOUNDCLOUD_IGNITION_ORANGE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
  },
});
