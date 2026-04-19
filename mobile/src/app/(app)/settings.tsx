import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  Easing,
  interpolateColor,
  runOnJS,
} from 'react-native-reanimated';
import Slider from '@react-native-community/slider';
import { VybeTextInput } from '@/components/VybeTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft,
  Search,
  User,
  Mail,
  Lock,
  Link2,
  LogOut,
  Volume2,
  Disc,
  SlidersHorizontal,
  VolumeX,
  Play,
  Wifi,
  Radio,
  Bell,
  BellRing,
  Gift,
  Eye,
  EyeOff,
  UserX,
  Shield,
  AlertCircle,
  Globe,
  Moon,
  Download,
  HardDrive,
  Trash2,
  Info,
  FileText,
  HelpCircle,
  Sparkles,
  RefreshCw,
  Bug,
} from 'lucide-react-native';
import { authClient } from '@/lib/auth/auth-client';
import { terminateAllPillNative } from '@/lib/NowPlayingActivityManager';
import { clearSessionBearerToken } from '@/lib/auth/sessionBearer';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useDownloadsStore, formatFileSize } from '@/stores/downloadsStore';
import { usePlaybackDebugStore } from '@/stores/playbackDebugStore';
import { usePlaybackController } from '@/stores/playbackController';
import { useUserSettingsStore } from '@/stores/userSettingsStore';
import { MINI_PLAYER_HEIGHT } from './_layout';
import { useVybePopup } from '@/components/VybePopup';
import { ShadowNeonSwitch } from '@/components/ShadowNeonSwitch';
import { OLED_BLACK, NAVY_TRACK, NAV_BAR_PURPLE } from '@/constants/machinedTheme';
import { useThemeStore, THEME_COLOR_PRESETS } from '@/stores/themeStore';
import { accentHexToHue, hexToRgba, hsvHueToHex } from '@/lib/themeColorUtils';
import { ListDisclosureMark } from '@/components/account/ListDisclosureMark';

const STROKE = 1.5;

const ROW_ICON = { color: NAV_BAR_PURPLE, glow: NAV_BAR_PURPLE } as const;

type IconCategory =
  | 'account'
  | 'audio'
  | 'data'
  | 'notifications'
  | 'privacy'
  | 'content'
  | 'storage'
  | 'discovery'
  | 'about'
  | 'developer'
  | 'destructive';

const CATEGORY_TINT: Record<
  IconCategory,
  { color: string; glow: string }
> = {
  account: ROW_ICON,
  audio: ROW_ICON,
  data: ROW_ICON,
  notifications: ROW_ICON,
  privacy: ROW_ICON,
  content: ROW_ICON,
  storage: ROW_ICON,
  discovery: ROW_ICON,
  about: ROW_ICON,
  developer: ROW_ICON,
  destructive: { color: '#EF4444', glow: '#EF4444' },
};

function CategoryIcon({
  category,
  children,
}: {
  category: IconCategory;
  children: React.ReactElement<{ color?: string; size?: number; strokeWidth?: number }>;
}) {
  const { color } = CATEGORY_TINT[category];
  return (
    <View style={[styles.iconShell]}>
      {React.cloneElement(children, {
        size: 20,
        color,
        strokeWidth: STROKE,
      })}
    </View>
  );
}

function rowMatchesSearch(title: string, subtitle: string | undefined, q: string) {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return `${title} ${subtitle ?? ''}`.toLowerCase().includes(needle);
}

function useThrottledSelection() {
  const last = useRef(0);
  return useCallback(() => {
    const now = Date.now();
    if (now - last.current > 100) {
      last.current = now;
      void Haptics.selectionAsync();
    }
  }, []);
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.sectionWrap}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <View style={styles.machinedPanel}>{children}</View>
    </View>
  );
}

interface SettingsItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  valueAccessory?: React.ReactNode;
  showChevron?: boolean;
  showSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  onPress?: () => void;
  isDestructive?: boolean;
  searchQuery: string;
}

function SettingsItem({
  icon,
  title,
  subtitle,
  value,
  valueAccessory,
  showChevron = false,
  showSwitch = false,
  switchValue = false,
  onSwitchChange,
  onPress,
  isDestructive = false,
  searchQuery,
}: SettingsItemProps) {
  if (!rowMatchesSearch(title, subtitle, searchQuery)) return null;

  return (
    <Pressable
      onPress={() => {
        if (onPress) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }
      }}
      disabled={!onPress && !showSwitch}
      style={({ pressed }) => [
        styles.row,
        styles.rowBorder,
        pressed && onPress ? { backgroundColor: 'rgba(255,255,255,0.04)' } : null,
      ]}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.rowBody}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.rowTitle, isDestructive && { color: '#EF4444' }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {valueAccessory}
        </View>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={3}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {showChevron ? (
        <View style={styles.rowDisclosure} accessibilityRole="image" accessibilityLabel="Opens detail">
          <ListDisclosureMark />
        </View>
      ) : null}
      {showSwitch ? (
        <ShadowNeonSwitch
          value={switchValue}
          onValueChange={(val) => {
            void Haptics.selectionAsync();
            onSwitchChange?.(val);
          }}
        />
      ) : null}
    </Pressable>
  );
}

function ShadowSliderRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  minimumValue,
  maximumValue,
  searchQuery,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  value: number;
  onValueChange: (v: number) => void;
  minimumValue: number;
  maximumValue: number;
  searchQuery: string;
}) {
  if (!rowMatchesSearch(title, subtitle, searchQuery)) return null;
  const bump = useThrottledSelection();
  const trackAccent = useThemeStore((s) => s.accentColor);

  return (
    <View style={[styles.row, styles.sliderRow, styles.rowBorder]}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={styles.sliderBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
        <Slider
          style={styles.slider}
          minimumValue={minimumValue}
          maximumValue={maximumValue}
          value={value}
          onValueChange={(v) => {
            bump();
            onValueChange(v);
          }}
          minimumTrackTintColor={trackAccent}
          maximumTrackTintColor={NAVY_TRACK}
          thumbTintColor={trackAccent}
        />
      </View>
    </View>
  );
}

function ColorEngineSection({ searchQuery }: { searchQuery: string }) {
  if (
    !rowMatchesSearch('Color Engine', 'App Preferences pill tabs chrome artwork.', searchQuery) &&
    !rowMatchesSearch('Sync to Artwork', 'album art dominant color.', searchQuery) &&
    !rowMatchesSearch('Hue ring', 'spectrum accent', searchQuery)
  ) {
    return null;
  }
  const accent = useThemeStore((s) => s.accentColor);
  const setAccent = useThemeStore((s) => s.setAccentColor);
  const syncToArtwork = useThemeStore((s) => s.syncToArtwork);
  const setSyncToArtwork = useThemeStore((s) => s.setSyncToArtwork);
  const [hue, setHue] = useState(() => accentHexToHue(accent));

  useEffect(() => {
    setHue(accentHexToHue(accent));
  }, [accent]);

  const pickManualAccent = (hex: string) => {
    setSyncToArtwork(false);
    setAccent(hex);
  };

  return (
    <SettingsSection title="Color Engine">
      <View style={styles.colorEngineIntro}>
        <Text style={styles.rowSubtitle}>
          App Preferences — dock, in-app pill, mini strip, and machined borders follow this accent
          instantly (native bridge + AsyncStorage).
        </Text>
      </View>
      <View style={styles.presetRow}>
        {THEME_COLOR_PRESETS.map((p) => {
          const selected = accent === p.hex;
          return (
            <Pressable
              key={p.id}
              onPress={() => {
                void Haptics.selectionAsync();
                pickManualAccent(p.hex);
              }}
              style={[
                styles.presetChip,
                { borderColor: selected ? p.hex : 'rgba(255,255,255,0.18)' },
                selected && { backgroundColor: hexToRgba(p.hex, 0.14) },
              ]}
            >
              <View style={[styles.presetSwatch, { backgroundColor: p.hex }]} />
              <Text style={[styles.presetLabel, selected && { color: p.hex }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.row, styles.sliderRow, styles.rowBorder, styles.colorEngineHueRow]}>
        <View style={styles.rowIcon}>
          <CategoryIcon category="content">
            <SlidersHorizontal />
          </CategoryIcon>
        </View>
        <View style={styles.sliderBody}>
          <Text style={styles.rowTitle}>Hue ring</Text>
          <Text style={styles.rowSubtitle}>Sweep the spectrum — updates instantly.</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={359}
            value={hue}
            onValueChange={(v) => {
              setHue(v);
              pickManualAccent(hsvHueToHex(v));
            }}
            minimumTrackTintColor={accent}
            maximumTrackTintColor={NAVY_TRACK}
            thumbTintColor={accent}
          />
        </View>
      </View>

      <View style={[styles.row, styles.rowBorder, styles.colorEngineHueRow]}>
        <View style={styles.rowIcon}>
          <CategoryIcon category="content">
            <Sparkles />
          </CategoryIcon>
        </View>
        <View style={{ flex: 1, minWidth: 0, paddingVertical: 10, paddingRight: 8 }}>
          <Text style={styles.rowTitle}>Sync to Artwork</Text>
          <Text style={styles.rowSubtitle}>
            When on, the accent follows the dominant color from the current track&apos;s album art.
          </Text>
        </View>
        <ShadowNeonSwitch
          value={syncToArtwork}
          onValueChange={(v) => {
            void Haptics.selectionAsync();
            setSyncToArtwork(v);
          }}
        />
      </View>
    </SettingsSection>
  );
}

function HqBadge({ label }: { label: string }) {
  const accent = useThemeStore((s) => s.accentColor);
  return (
    <View
      style={[
        styles.hqBadge,
        { borderColor: hexToRgba(accent, 0.5), backgroundColor: hexToRgba(accent, 0.1) },
      ]}
    >
      <Text style={[styles.hqBadgeText, { color: accent }]}>{label}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const [searchQuery, setSearchQuery] = useState('');
  const [crossfade, setCrossfade] = useState(false);
  const [crossfadeSec, setCrossfadeSec] = useState(4);
  const [pushNotifications, setPushNotifications] = useState(true);

  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const playbackVolume = usePlaybackController((s) => s.volume);
  const setPlaybackVolume = usePlaybackController((s) => s.setVolume);
  const showMiniPlayer = !!currentTrack;

  const gapless = useUserSettingsStore((s) => s.gapless);
  const setGapless = useUserSettingsStore((s) => s.setGapless);
  const normalizeVolume = useUserSettingsStore((s) => s.normalizeVolume);
  const setNormalizeVolume = useUserSettingsStore((s) => s.setNormalizeVolume);
  const autoplay = useUserSettingsStore((s) => s.autoplay);
  const setAutoplay = useUserSettingsStore((s) => s.setAutoplay);
  const audioQuality = useUserSettingsStore((s) => s.audioQuality);
  const setAudioQuality = useUserSettingsStore((s) => s.setAudioQuality);
  const dataSaver = useUserSettingsStore((s) => s.dataSaver);
  const setDataSaver = useUserSettingsStore((s) => s.setDataSaver);
  const cellularStreamingQuality = useUserSettingsStore((s) => s.cellularStreamingQuality);
  const setCellularStreamingQuality = useUserSettingsStore((s) => s.setCellularStreamingQuality);
  const downloadCellular = useUserSettingsStore((s) => s.downloadCellular);
  const setDownloadCellular = useUserSettingsStore((s) => s.setDownloadCellular);
  const downloadQuality = useUserSettingsStore((s) => s.downloadQuality);
  const setDownloadQuality = useUserSettingsStore((s) => s.setDownloadQuality);
  const newMusicNotifications = useUserSettingsStore((s) => s.newMusicNotifications);
  const setNewMusicNotifications = useUserSettingsStore((s) => s.setNewMusicNotifications);
  const productAnnouncements = useUserSettingsStore((s) => s.productAnnouncements);
  const setProductAnnouncements = useUserSettingsStore((s) => s.setProductAnnouncements);
  const privateSession = useUserSettingsStore((s) => s.privateSession);
  const setPrivateSession = useUserSettingsStore((s) => s.setPrivateSession);
  const listeningActivity = useUserSettingsStore((s) => s.listeningActivity);
  const setListeningActivity = useUserSettingsStore((s) => s.setListeningActivity);
  const explicitContent = useUserSettingsStore((s) => s.explicitContent);
  const setExplicitContent = useUserSettingsStore((s) => s.setExplicitContent);

  const autoRefreshEnabled = useDiscoveryStore((s) => s.autoRefreshEnabled);
  const setAutoRefreshEnabled = useDiscoveryStore((s) => s.setAutoRefreshEnabled);
  const clearDiscoveryCache = useDiscoveryStore((s) => s.clearDiscoveryCache);
  const downloads = useDownloadsStore((s) => s.downloads);
  const clearAllDownloads = useDownloadsStore((s) => s.clearAllDownloads);
  const totalDownloadBytes = downloads.reduce((sum, t) => sum + (t.fileSize ?? 0), 0);
  const seedTracksCount = useDiscoveryStore((s) => s.seedTracks.length);
  const discoveredTracksCount = useDiscoveryStore((s) => s.discoveredTracks.length);

  const debugModeEnabled = usePlaybackDebugStore((s) => s.debugModeEnabled);
  const setDebugModeEnabled = usePlaybackDebugStore((s) => s.setDebugModeEnabled);
  const handleUnlockTap = usePlaybackDebugStore((s) => s.handleUnlockTap);
  const debugOverlayVisible = usePlaybackDebugStore((s) => s.debugOverlayVisible);
  const toggleDebugOverlay = usePlaybackDebugStore((s) => s.toggleDebugOverlay);

  const deviceAccent = useThemeStore((s) => s.accentColor);

  const bottomPadding = insets.bottom + (showMiniPlayer ? MINI_PLAYER_HEIGHT : 0) + 48;

  const cycleAudioQuality = () => {
    void Haptics.selectionAsync();
    const order: Array<'Low' | 'Normal' | 'High'> = ['Low', 'Normal', 'High'];
    const i = order.indexOf(audioQuality);
    setAudioQuality(order[(i + 1) % order.length]);
  };

  const cycleCellularQuality = () => {
    void Haptics.selectionAsync();
    const order: Array<'Low' | 'Normal' | 'High'> = ['Low', 'Normal', 'High'];
    const i = order.indexOf(cellularStreamingQuality);
    setCellularStreamingQuality(order[(i + 1) % order.length]);
  };

  const cycleDownloadQuality = () => {
    void Haptics.selectionAsync();
    const order: Array<'Low' | 'Normal' | 'High'> = ['Low', 'Normal', 'High'];
    const i = order.indexOf(downloadQuality);
    setDownloadQuality(order[(i + 1) % order.length]);
  };

  const handleSignOut = async () => {
    console.log('[signOut] starting…');
    terminateAllPillNative();
    // Step 1: best-effort backend sign-out (don't let a backend hiccup block local cleanup).
    try {
      await authClient.signOut();
      console.log('[signOut] backend signOut ok');
    } catch (e) {
      console.warn('[signOut] backend signOut failed (continuing anyway):', e);
    }

    // Step 2: nuke the bearer token from SecureStore.
    try {
      await clearSessionBearerToken();
      console.log('[signOut] bearer cleared');
    } catch (e) {
      console.warn('[signOut] clearSessionBearerToken failed:', e);
    }

    // Step 3: nuke ALL Better Auth keys SecureStore may be caching.
    try {
      const SecureStore = await import('expo-secure-store');
      const KEYS = [
        'vybe.session_data',
        'vybe.session-token',
        'vybe.cookie',
        'vybe_api_session_bearer',
        'better-auth.session_data',
        'better-auth.session-token',
        'better-auth.cookie',
      ];
      await Promise.all(
        KEYS.map((k) => SecureStore.deleteItemAsync(k).catch(() => undefined)),
      );
      console.log('[signOut] SecureStore session keys purged');
    } catch (e) {
      console.warn('[signOut] SecureStore purge failed:', e);
    }

    // Step 4: force-navigate to the sign-in screen so we don't sit on a
    // stale Settings page if the root layout's session listener is slow to fire.
    try {
      router.replace('/sign-in');
      console.log('[signOut] navigated to /sign-in');
    } catch (e) {
      console.warn('[signOut] router.replace failed:', e);
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => { void handleSignOut(); } },
      ],
      { cancelable: true },
    );
  };

  const onGhostSignOut = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    confirmSignOut();
  };

  const q = searchQuery;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: OLED_BLACK }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerTop}>
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={styles.backBtn}
          >
            <ChevronLeft size={28} color="#fff" strokeWidth={STROKE} />
          </Pressable>
          <Text style={styles.headerTitle}>SETTINGS</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={[styles.searchShell, { borderColor: hexToRgba(deviceAccent, 0.24) }]}>
          <Search size={20} color="rgba(255,255,255,0.5)" strokeWidth={STROKE} />
          <VybeTextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search settings"
            variant="search"
            style={styles.searchInput}
          />
          {searchQuery.length > 0 ? (
            <Pressable
              onPress={() => {
                setSearchQuery('');
                Keyboard.dismiss();
              }}
              hitSlop={10}
            >
              <Text style={[styles.cancelBtn, { color: deviceAccent }]}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <SettingsSection title="Account">
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="account"><User /></CategoryIcon>}
            title="Profile"
            subtitle="Edit your name, photo, and how you appear on VYBE."
            showChevron
            onPress={() => router.push('/(app)/profile' as never)}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="account"><Mail /></CategoryIcon>}
            title="Email"
            subtitle="Manage the email linked to your account."
            showChevron
            onPress={() =>
              showVybePopup({
                title: 'Change Email',
                message: 'To update your email, sign out and sign back in with your new email address.',
                type: 'info',
              })
            }
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="account"><Lock /></CategoryIcon>}
            title="Password"
            subtitle="Update your password to keep your account secure."
            showChevron
            onPress={() =>
              showVybePopup({
                title: 'Password',
                message: 'VYBE uses passwordless sign-in via email code. No password to manage!',
                type: 'info',
              })
            }
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="account"><Link2 /></CategoryIcon>}
            title="Connected services"
            subtitle="Manage services you've connected to VYBE."
            showChevron
            onPress={() => router.push('/(app)/accounts' as never)}
          />
        </SettingsSection>

        <SettingsSection title="Connected Devices">
          <View style={[styles.row, styles.rowBorder, styles.deviceRow]}>
            <View style={styles.rowIcon}>
              <CategoryIcon category="account"><Wifi /></CategoryIcon>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={3}>
                Steve Jobs&apos; Left Toe (iPhone 15 Pro Max)
              </Text>
            </View>
            <View
              style={[
                styles.activeBadge,
                {
                  borderColor: deviceAccent,
                  backgroundColor: hexToRgba(deviceAccent, 0.14),
                },
              ]}
            >
              <Text style={[styles.activeBadgeText, { color: deviceAccent }]}>LOGIC ACTIVE</Text>
            </View>
          </View>
          <View style={[styles.row, styles.rowBorder, styles.deviceRow]}>
            <View style={styles.rowIcon}>
              <CategoryIcon category="account"><Wifi /></CategoryIcon>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={3}>
                {'Louis 🔐🔐🏴☠️ (iPhone 14 Pro Max)'}
              </Text>
            </View>
            <View
              style={[
                styles.activeBadge,
                {
                  borderColor: deviceAccent,
                  backgroundColor: hexToRgba(deviceAccent, 0.14),
                },
              ]}
            >
              <Text style={[styles.activeBadgeText, { color: deviceAccent }]}>NATIVE PILL ACTIVE</Text>
            </View>
          </View>
        </SettingsSection>

        <SettingsSection title="Playback">
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="audio"><Volume2 /></CategoryIcon>}
            title="Audio quality"
            subtitle="Choose how your music sounds. Higher quality uses more data."
            value={audioQuality}
            valueAccessory={
              audioQuality === 'High' ? <HqBadge label="LOSSLESS" /> : null
            }
            showChevron
            onPress={cycleAudioQuality}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="audio"><Disc /></CategoryIcon>}
            title="Crossfade"
            subtitle="Smoothly blend songs together."
            showSwitch
            switchValue={crossfade}
            onSwitchChange={setCrossfade}
          />
          {crossfade ? (
            <ShadowSliderRow
              searchQuery={q}
              icon={<CategoryIcon category="audio"><Disc /></CategoryIcon>}
              title="Crossfade duration"
              subtitle="Seconds of overlap between tracks."
              value={crossfadeSec}
              minimumValue={1}
              maximumValue={12}
              onValueChange={setCrossfadeSec}
            />
          ) : null}
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="audio"><Play /></CategoryIcon>}
            title="Gapless playback"
            subtitle="Play albums and playlists without silence between tracks."
            showSwitch
            switchValue={gapless}
            onSwitchChange={setGapless}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="audio"><SlidersHorizontal /></CategoryIcon>}
            title="Equalizer"
            subtitle="Adjust the sound to your taste."
            showChevron
            onPress={() => {}}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="audio"><VolumeX /></CategoryIcon>}
            title="Normalize volume"
            subtitle="Keep volume consistent between songs."
            showSwitch
            switchValue={normalizeVolume}
            onSwitchChange={setNormalizeVolume}
          />
          <ShadowSliderRow
            searchQuery={q}
            icon={<CategoryIcon category="audio"><Volume2 /></CategoryIcon>}
            title="Playback volume"
            subtitle="In-app level for supported sources."
            value={playbackVolume}
            minimumValue={0}
            maximumValue={1}
            onValueChange={(v) => setPlaybackVolume(v)}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="audio"><Radio /></CategoryIcon>}
            title="Autoplay"
            subtitle="Keep the music going when your queue ends."
            showSwitch
            switchValue={autoplay}
            onSwitchChange={setAutoplay}
          />
        </SettingsSection>

        <SettingsSection title="Data Saver">
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="data"><Wifi /></CategoryIcon>}
            title="Data saver"
            subtitle="Reduce data usage while streaming."
            showSwitch
            switchValue={dataSaver}
            onSwitchChange={setDataSaver}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="data"><Radio /></CategoryIcon>}
            title="Streaming quality on cellular"
            subtitle="Lower quality uses less data."
            value={cellularStreamingQuality}
            showChevron
            onPress={cycleCellularQuality}
          />
        </SettingsSection>

        <SettingsSection title="Notifications">
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="notifications"><Bell /></CategoryIcon>}
            title="Push notifications"
            subtitle="Allow notifications from VYBE."
            showSwitch
            switchValue={pushNotifications}
            onSwitchChange={setPushNotifications}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="notifications"><BellRing /></CategoryIcon>}
            title="New music and updates"
            subtitle="Get notified about new releases and recommendations."
            showSwitch
            switchValue={newMusicNotifications}
            onSwitchChange={setNewMusicNotifications}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="notifications"><Gift /></CategoryIcon>}
            title="Product announcements"
            subtitle="Hear about new features."
            showSwitch
            switchValue={productAnnouncements}
            onSwitchChange={setProductAnnouncements}
          />
        </SettingsSection>

        <SettingsSection title="Privacy and Social">
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="privacy"><EyeOff /></CategoryIcon>}
            title="Private session"
            subtitle="Listening won't affect recommendations or social features."
            showSwitch
            switchValue={privateSession}
            onSwitchChange={setPrivateSession}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="privacy"><Eye /></CategoryIcon>}
            title="Listening activity"
            subtitle="Share what you're listening to."
            showSwitch
            switchValue={listeningActivity}
            onSwitchChange={setListeningActivity}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="privacy"><UserX /></CategoryIcon>}
            title="Blocked users"
            subtitle="Manage blocked accounts."
            showChevron
            onPress={() => {}}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="privacy"><Shield /></CategoryIcon>}
            title="Data and privacy"
            subtitle="Learn how we collect and use your data."
            showChevron
            onPress={() => {}}
          />
        </SettingsSection>

        <SettingsSection title="Content and Display">
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="content"><AlertCircle /></CategoryIcon>}
            title="Explicit content"
            subtitle="Allow music marked explicit."
            showSwitch
            switchValue={explicitContent}
            onSwitchChange={setExplicitContent}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="content"><Globe /></CategoryIcon>}
            title="Language"
            subtitle="Choose your app language."
            value="English"
            showChevron
            onPress={() => {}}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="content"><Moon /></CategoryIcon>}
            title="Theme"
            subtitle="Dark (locked)."
            value="Dark"
          />
        </SettingsSection>

        <ColorEngineSection searchQuery={q} />

        <SettingsSection title="Downloads">
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="audio"><Download /></CategoryIcon>}
            title="Download audio quality"
            subtitle="Choose quality for downloaded music."
            value={downloadQuality}
            valueAccessory={downloadQuality === 'High' ? <HqBadge label="HQ" /> : null}
            showChevron
            onPress={cycleDownloadQuality}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="data"><Wifi /></CategoryIcon>}
            title="Download over cellular"
            subtitle="Allow downloads without Wi-Fi."
            showSwitch
            switchValue={downloadCellular}
            onSwitchChange={setDownloadCellular}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="storage"><HardDrive /></CategoryIcon>}
            title="Manage downloads"
            subtitle="Remove downloaded music from this device."
            showChevron
            onPress={() => {}}
          />
        </SettingsSection>

        <Text style={styles.helperNote}>Downloads apply only to VYBE music.</Text>

        <SettingsSection title="Storage">
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="storage"><Trash2 /></CategoryIcon>}
            title="Clear cache"
            subtitle="Free up space. Downloads won't be removed."
            showChevron
            onPress={() => {
              showVybePopup({
                title: 'Cache Cleared',
                message: 'Successfully cleared 245 MB of cached data.',
                type: 'success',
              });
            }}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="storage"><HardDrive /></CategoryIcon>}
            title="Cache size"
            value="245 MB"
          />
        </SettingsSection>

        <SettingsSection title="Discovery">
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="discovery"><RefreshCw /></CategoryIcon>}
            title="Auto-refresh on app open"
            subtitle="Automatically discover new tracks when you open VYBE."
            showSwitch
            switchValue={autoRefreshEnabled}
            onSwitchChange={setAutoRefreshEnabled}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="discovery"><Sparkles /></CategoryIcon>}
            title="Seed tracks"
            subtitle="Tracks used to find similar music."
            value={`${seedTracksCount} tracks`}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="discovery"><Sparkles /></CategoryIcon>}
            title="Discovered tracks"
            subtitle="Tracks found based on your listening."
            value={`${discoveredTracksCount} tracks`}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="destructive"><Trash2 /></CategoryIcon>}
            title="Clear discovery cache"
            subtitle="Reset Fresh Finds and rebuild from scratch."
            showChevron
            isDestructive
            onPress={() => {
              showVybePopup({
                title: 'Clear Discovery Cache',
                message: 'This will reset your Fresh Finds section. Your seed tracks will be kept.',
                type: 'warning',
                actions: [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                      clearDiscoveryCache();
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      showVybePopup({
                        title: 'Done',
                        message: 'Discovery cache cleared. New tracks will appear on next refresh.',
                        type: 'success',
                      });
                    },
                  },
                ],
              });
            }}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="destructive"><Trash2 /></CategoryIcon>}
            title="Wipe all downloads"
            subtitle={
              downloads.length === 0
                ? 'No offline tracks stored.'
                : `${downloads.length} track${downloads.length === 1 ? '' : 's'} · ${formatFileSize(totalDownloadBytes)}`
            }
            showChevron
            isDestructive
            onPress={() => {
              if (downloads.length === 0) {
                showVybePopup({
                  title: 'Vault Empty',
                  message: 'You have no downloaded tracks to clear.',
                  type: 'info',
                });
                return;
              }
              showVybePopup({
                title: 'Wipe All Downloads',
                message: `Permanently delete ${downloads.length} offline track${downloads.length === 1 ? '' : 's'} (${formatFileSize(totalDownloadBytes)}) from this device?`,
                type: 'warning',
                actions: [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Wipe All',
                    style: 'destructive',
                    onPress: async () => {
                      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                      try {
                        await clearAllDownloads();
                        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        showVybePopup({
                          title: 'Vault Wiped',
                          message: 'All offline tracks removed from this device.',
                          type: 'success',
                        });
                      } catch (e) {
                        showVybePopup({
                          title: 'Wipe Failed',
                          message: e instanceof Error ? e.message : 'Could not delete all files.',
                          type: 'error',
                        });
                      }
                    },
                  },
                ],
              });
            }}
          />
        </SettingsSection>

        <SettingsSection title="About">
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="about"><Info /></CategoryIcon>}
            title="Version"
            subtitle="Tap 5 times to unlock developer options"
            value="VYBE 1.0.0"
            onPress={() => {
              const unlocked = handleUnlockTap();
              if (unlocked) {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showVybePopup({
                  title: 'Developer Mode',
                  message: 'Playback Debug Mode has been unlocked!',
                  type: 'success',
                });
              }
            }}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="about"><FileText /></CategoryIcon>}
            title="Terms of Service"
            showChevron
            onPress={() => {}}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="about"><Shield /></CategoryIcon>}
            title="Privacy Policy"
            showChevron
            onPress={() => {}}
          />
          <SettingsItem
            searchQuery={q}
            icon={<CategoryIcon category="about"><HelpCircle /></CategoryIcon>}
            title="Contact support"
            showChevron
            onPress={() => {}}
          />
        </SettingsSection>

        {debugModeEnabled ? (
          <SettingsSection title="Developer">
            <SettingsItem
              searchQuery={q}
              icon={<CategoryIcon category="developer"><Bug /></CategoryIcon>}
              title="Playback Debug Mode"
              subtitle="Show debug overlay with audio session info"
              showSwitch
              switchValue={debugOverlayVisible}
              onSwitchChange={(val) => {
                if (val !== debugOverlayVisible) toggleDebugOverlay();
              }}
            />
            <SettingsItem
              searchQuery={q}
              icon={<CategoryIcon category="developer"><Bug /></CategoryIcon>}
              title="Disable Debug Mode"
              subtitle="Hide developer options"
              showChevron
              onPress={() => {
                showVybePopup({
                  title: 'Disable Debug Mode',
                  message: 'This will hide all developer options. You can re-enable by tapping the version 5 times.',
                  type: 'confirm',
                  actions: [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Disable',
                      onPress: () => {
                        setDebugModeEnabled(false);
                        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      },
                    },
                  ],
                });
              }}
            />
          </SettingsSection>
        ) : null}

        <Pressable style={styles.ghostSignOut} onPress={onGhostSignOut}>
          <LogOut size={18} color="#FF00FF" strokeWidth={STROKE} />
          <Text style={[styles.ghostSignOutText, { marginLeft: 10 }]}>Sign out</Text>
        </Pressable>

        <VybeSystemFooter />
      </ScrollView>
    </View>
    </KeyboardAvoidingView>
  );
}

/** Minimal footer — pulses the live global UI accent (no legacy brand colors). */
function VybeSystemFooter() {
  const accent = useThemeStore((s) => s.accentColor);
  const [scanning, setScanning] = useState(false);
  const tint = useSharedValue(0);
  const scanX = useSharedValue(-1);
  const scanOpacity = useSharedValue(0);

  useEffect(() => {
    if (scanning) {
      tint.value = withTiming(1, { duration: 180 });
      scanOpacity.value = withTiming(1, { duration: 120 });
      scanX.value = withSequence(
        withTiming(-1, { duration: 0 }),
        withTiming(1, { duration: 720, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      tint.value = withTiming(0, { duration: 260 });
      scanOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [scanning, tint, scanOpacity, scanX]);

  const onLongPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setScanning(true);
    tint.value = withSequence(
      withTiming(1, { duration: 180 }),
      withTiming(1, { duration: 560 }),
      withTiming(0, { duration: 260 }, (finished) => {
        if (finished) runOnJS(setScanning)(false);
      }),
    );
  }, [tint]);

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(tint.value, [0, 1], ['rgba(255,255,255,0.22)', accent]),
  }), [accent]);

  const scanStyle = useAnimatedStyle(() => ({
    opacity: scanOpacity.value,
    transform: [{ translateX: scanX.value * 140 }],
  }));

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={480}
      style={styles.settingsFooterEgg}
      accessibilityLabel="VYBE system status"
      accessibilityHint="Long press for status pulse"
    >
      <View style={styles.settingsFooterEggScanWrap}>
        <Animated.Text style={[styles.settingsFooterEggText, textStyle]}>
          {scanning ? 'SIGNAL LOCKED' : 'VYBE · CONTINUOUS PLAYBACK CORE'}
        </Animated.Text>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.settingsFooterEggScan,
            { backgroundColor: hexToRgba(accent, 0.35) },
            scanStyle,
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#000000',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#FFFFFF10',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 3.2,
  },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: OLED_BLACK,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderWidth: 0,
    fontSize: 16,
  },
  cancelBtn: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 10,
  },
  scroll: {
    flex: 1,
  },
  sectionWrap: {
    marginBottom: 22,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: 'rgba(230,252,255,0.95)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  machinedPanel: {
    backgroundColor: OLED_BLACK,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,255,255,0.22)',
  },
  deviceRow: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#FFFFFF10',
  },
  rowIcon: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconShell: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  rowTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  rowSubtitle: {
    color: '#666666',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 18,
  },
  rowValue: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 6,
    maxWidth: 100,
  },
  rowDisclosure: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBadge: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 6,
    alignSelf: 'center',
    maxWidth: 132,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.45,
    textAlign: 'center',
  },
  sliderRow: {
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  sliderBody: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
    paddingRight: 4,
  },
  slider: {
    width: '100%',
    height: 36,
    marginTop: 8,
  },
  colorEngineIntro: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  presetSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  presetLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  colorEngineHueRow: {
    borderBottomWidth: 0,
  },
  hqBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  hqBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  helperNote: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 20,
    marginTop: -12,
    marginBottom: 20,
  },
  ghostSignOut: {
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 24,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,0,255,0.55)',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostSignOutText: {
    color: '#FF00FF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  settingsFooterEgg: {
    alignSelf: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  settingsFooterEggScanWrap: {
    position: 'relative',
    overflow: 'hidden',
    paddingHorizontal: 2,
  },
  settingsFooterEggText: {
    color: 'rgba(255,255,255,0.22)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  settingsFooterEggScan: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    width: 22,
    left: '50%',
    marginLeft: -11,
    opacity: 0.35,
  },
});
