import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Linking,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { usePlaybackSettingsStore } from '@/stores/playbackSettingsStore';
import { VybeTextInput } from '@/components/VybeTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  User,
  Mail,
  Lock,
  Link2,
  LogOut,
  Volume2,
  Disc,
  Sliders,
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
  Cloud,
} from 'lucide-react-native';
import { authClient } from '@/lib/auth/auth-client';
import { useStorageSettingsStore } from '@/stores/storageSettingsStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePlaybackDebugStore } from '@/stores/playbackDebugStore';
import { usePlaybackController } from '@/stores/playbackController';
import { useUserSettingsStore } from '@/stores/userSettingsStore';
import { MINI_PLAYER_HEIGHT } from './_layout';
import { useVybePopup } from '@/components/VybePopup';

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <View className="mb-8">
      <Text className="text-white/50 text-xs uppercase tracking-wider px-5 mb-3 font-medium">
        {title}
      </Text>
      <View className="bg-[#1A1A1A] mx-4 rounded-xl overflow-hidden">
        {children}
      </View>
    </View>
  );
}

interface SettingsItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  value?: string;
  showChevron?: boolean;
  showSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  onPress?: () => void;
  isDestructive?: boolean;
}

function SettingsItem({
  icon,
  title,
  subtitle,
  value,
  showChevron = false,
  showSwitch = false,
  switchValue = false,
  onSwitchChange,
  onPress,
  isDestructive = false,
}: SettingsItemProps) {
  return (
    <Pressable
      onPress={() => {
        if (onPress) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }
      }}
      disabled={!onPress && !showSwitch}
      className="flex-row items-center py-3.5 px-4"
      style={({ pressed }) => ({
        backgroundColor: pressed && onPress ? 'rgba(255,255,255,0.05)' : 'transparent',
      })}
    >
      <View className="w-8 items-center">{icon}</View>
      <View className="flex-1 ml-3">
        <Text
          className="text-base font-medium"
          style={{ color: isDestructive ? '#EF4444' : '#fff' }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-white/50 text-[13px] mt-0.5" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text className="text-white/50 text-sm mr-2">{value}</Text>
      ) : null}
      {showChevron ? (
        <ChevronRight size={18} color="rgba(255,255,255,0.3)" />
      ) : null}
      {showSwitch ? (
        <Switch
          value={switchValue}
          onValueChange={(val) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onSwitchChange?.(val);
          }}
          trackColor={{ false: '#3E3E3E', true: '#8B5CF6' }}
          thumbColor="#fff"
        />
      ) : null}
    </Pressable>
  );
}

function SettingsDivider() {
  return <View className="h-px bg-white/10 ml-16" />;
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const [searchQuery, setSearchQuery] = useState('');

  // Check if mini player is visible
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const showMiniPlayer = !!currentTrack;

  // Discovery store
  const autoRefreshEnabled = useDiscoveryStore(s => s.autoRefreshEnabled);
  const setAutoRefreshEnabled = useDiscoveryStore(s => s.setAutoRefreshEnabled);
  const clearDiscoveryCache = useDiscoveryStore(s => s.clearDiscoveryCache);
  const seedTracksCount = useDiscoveryStore(s => s.seedTracks.length);
  const discoveredTracksCount = useDiscoveryStore(s => s.discoveredTracks.length);

  // Storage settings
  const preferICloud = useStorageSettingsStore(s => s.preferICloud);
  const setPreferICloud = useStorageSettingsStore(s => s.setPreferICloud);

  // Debug store
  const debugModeEnabled = usePlaybackDebugStore(s => s.debugModeEnabled);
  const setDebugModeEnabled = usePlaybackDebugStore(s => s.setDebugModeEnabled);
  const handleUnlockTap = usePlaybackDebugStore(s => s.handleUnlockTap);
  const debugOverlayVisible = usePlaybackDebugStore(s => s.debugOverlayVisible);
  const toggleDebugOverlay = usePlaybackDebugStore(s => s.toggleDebugOverlay);

  // Calculate bottom padding: safe area + mini player height (if visible) + extra padding
  const bottomPadding = insets.bottom + (showMiniPlayer ? MINI_PLAYER_HEIGHT : 0) + 40;

  // Crossfade settings (persisted)
  const crossfade = usePlaybackSettingsStore(s => s.crossfadeEnabled);
  const setCrossfadeEnabled = usePlaybackSettingsStore(s => s.setCrossfadeEnabled);
  const crossfadeDuration = usePlaybackSettingsStore(s => s.crossfadeDuration);
  const setCrossfadeDuration = usePlaybackSettingsStore(s => s.setCrossfadeDuration);

  // Persistent user settings
  const s = useUserSettingsStore();

  const showQualityPicker = (
    title: string,
    current: 'Low' | 'Normal' | 'High',
    onSelect: (v: 'Low' | 'Normal' | 'High') => void
  ) => {
    showVybePopup({
      title,
      message: 'Choose a quality level. Higher quality uses more storage and data.',
      type: 'confirm',
      actions: [
        { text: 'Low', style: current === 'Low' ? 'default' : 'cancel', onPress: () => { onSelect('Low'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } },
        { text: 'Normal', style: current === 'Normal' ? 'default' : 'cancel', onPress: () => { onSelect('Normal'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } },
        { text: 'High', style: current === 'High' ? 'default' : 'cancel', onPress: () => { onSelect('High'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } },
      ],
    });
  };

  const handleSignOut = () => {
    router.replace('/sign-in');
  };

  const confirmSignOut = () => {
    showVybePopup({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out?',
      type: 'confirm',
      actions: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: handleSignOut },
      ]
    });
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      {/* Header */}
      <LinearGradient
        colors={['#1a1a2e', '#0A0A0A']}
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="w-10 h-10 items-center justify-center -ml-2"
          >
            <ChevronLeft size={28} color="#fff" />
          </Pressable>
          <Text className="text-white text-xl font-bold flex-1 text-center mr-8">
            Settings
          </Text>
        </View>

        {/* Search Bar */}
        <View className="px-4 pb-4">
          <View className="flex-row items-center bg-white/10 rounded-lg px-4 py-3">
            <Search size={18} color="rgba(255,255,255,0.5)" />
            <VybeTextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search settings"
              variant="search"
              style={{ flex: 1, marginLeft: 12, backgroundColor: 'transparent', padding: 0, borderWidth: 0 }}
            />
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {/* ACCOUNT */}
        <SettingsSection title="Account">
          <SettingsItem
            icon={<User size={20} color="#fff" />}
            title="Profile"
            subtitle="Edit your name, photo, and how you appear on VYBE."
            showChevron
            onPress={() => router.push('/(app)/profile' as never)}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Mail size={20} color="#fff" />}
            title="Email"
            subtitle="Manage the email linked to your account."
            showChevron
            onPress={() => showVybePopup({ title: 'Change Email', message: 'To update your email, sign out and sign back in with your new email address.', type: 'info' })}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Lock size={20} color="#fff" />}
            title="Password"
            subtitle="Update your password to keep your account secure."
            showChevron
            onPress={() => showVybePopup({ title: 'Password', message: 'VYBE uses passwordless sign-in via email code. No password to manage!', type: 'info' })}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Link2 size={20} color="#fff" />}
            title="Connected services"
            subtitle="Manage services you've connected to VYBE."
            showChevron
            onPress={() => router.push('/(app)/accounts' as never)}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<LogOut size={20} color="#EF4444" />}
            title="Sign out"
            subtitle="Sign out of this account on this device."
            isDestructive
            onPress={confirmSignOut}
          />
        </SettingsSection>

        {/* PLAYBACK */}
        <SettingsSection title="Playback">
          <SettingsItem
            icon={<Volume2 size={20} color="#fff" />}
            title="Audio quality"
            subtitle="Choose how your music sounds. Higher quality uses more data."
            value={s.audioQuality}
            showChevron
            onPress={() => showQualityPicker('Audio Quality', s.audioQuality, s.setAudioQuality)}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Disc size={20} color="#fff" />}
            title="Crossfade"
            subtitle="Smoothly blend songs together."
            showSwitch
            switchValue={crossfade}
            onSwitchChange={setCrossfadeEnabled}
          />
          {crossfade && (
            <View style={{ paddingHorizontal: 20, paddingBottom: 16, backgroundColor: 'rgba(255,255,255,0.03)' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Duration</Text>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{crossfadeDuration}s</Text>
              </View>
              <Slider
                minimumValue={1}
                maximumValue={12}
                step={1}
                value={crossfadeDuration}
                onValueChange={setCrossfadeDuration}
                minimumTrackTintColor="#8B5CF6"
                maximumTrackTintColor="rgba(255,255,255,0.15)"
                thumbTintColor="#fff"
                style={{ height: 36 }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>1s</Text>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>12s</Text>
              </View>
            </View>
          )}
          <SettingsDivider />
          <SettingsItem
            icon={<Play size={20} color="#fff" />}
            title="Gapless playback"
            subtitle="Play albums and playlists without silence between tracks."
            showSwitch
            switchValue={s.gapless}
            onSwitchChange={s.setGapless}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<VolumeX size={20} color="#fff" />}
            title="Normalize volume"
            subtitle="Keep volume consistent between songs."
            showSwitch
            switchValue={s.normalizeVolume}
            onSwitchChange={s.setNormalizeVolume}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Radio size={20} color="#fff" />}
            title="Autoplay"
            subtitle="Keep the music going when your queue ends."
            showSwitch
            switchValue={s.autoplay}
            onSwitchChange={s.setAutoplay}
          />
        </SettingsSection>

        {/* DATA SAVER */}
        <SettingsSection title="Data Saver">
          <SettingsItem
            icon={<Wifi size={20} color="#fff" />}
            title="Data saver"
            subtitle="Reduce data usage while streaming."
            showSwitch
            switchValue={s.dataSaver}
            onSwitchChange={s.setDataSaver}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Radio size={20} color="#fff" />}
            title="Streaming quality on cellular"
            subtitle="Lower quality uses less data."
            value={s.cellularStreamingQuality}
            showChevron
            onPress={() => showQualityPicker('Cellular Streaming Quality', s.cellularStreamingQuality, s.setCellularStreamingQuality)}
          />
        </SettingsSection>

        {/* NOTIFICATIONS */}
        <SettingsSection title="Notifications">
          <SettingsItem
            icon={<Bell size={20} color="#fff" />}
            title="Push notifications"
            subtitle="Manage notification permissions in iOS Settings."
            showChevron
            onPress={() => Linking.openURL('app-settings:')}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<BellRing size={20} color="#fff" />}
            title="New music and updates"
            subtitle="Get notified about new releases and recommendations."
            showSwitch
            switchValue={s.newMusicNotifications}
            onSwitchChange={s.setNewMusicNotifications}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Gift size={20} color="#fff" />}
            title="Product announcements"
            subtitle="Hear about new features."
            showSwitch
            switchValue={s.productAnnouncements}
            onSwitchChange={s.setProductAnnouncements}
          />
        </SettingsSection>

        {/* PRIVACY AND SOCIAL */}
        <SettingsSection title="Privacy and Social">
          <SettingsItem
            icon={<EyeOff size={20} color="#fff" />}
            title="Private session"
            subtitle="Listening won't affect recommendations or social features."
            showSwitch
            switchValue={s.privateSession}
            onSwitchChange={s.setPrivateSession}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Eye size={20} color="#fff" />}
            title="Listening activity"
            subtitle="Share what you're listening to."
            showSwitch
            switchValue={s.listeningActivity}
            onSwitchChange={s.setListeningActivity}
          />
        </SettingsSection>

        {/* CONTENT AND DISPLAY */}
        <SettingsSection title="Content and Display">
          <SettingsItem
            icon={<AlertCircle size={20} color="#fff" />}
            title="Explicit content"
            subtitle="Allow music marked explicit."
            showSwitch
            switchValue={s.explicitContent}
            onSwitchChange={s.setExplicitContent}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Globe size={20} color="#fff" />}
            title="Language"
            subtitle="Choose your app language."
            value="English"
            showChevron
            onPress={() => {}}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Moon size={20} color="#fff" />}
            title="Theme"
            subtitle="Dark (locked)."
            value="Dark"
          />
        </SettingsSection>

        {/* DOWNLOADS */}
        <SettingsSection title="Downloads">
          <SettingsItem
            icon={<Download size={20} color="#fff" />}
            title="Download audio quality"
            subtitle="Choose quality for downloaded music."
            value={s.downloadQuality}
            showChevron
            onPress={() => showQualityPicker('Download Quality', s.downloadQuality, s.setDownloadQuality)}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Wifi size={20} color="#fff" />}
            title="Download over cellular"
            subtitle="Allow downloads without Wi-Fi."
            showSwitch
            switchValue={s.downloadCellular}
            onSwitchChange={s.setDownloadCellular}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<HardDrive size={20} color="#fff" />}
            title="Manage downloads"
            subtitle="Remove downloaded music from this device."
            showChevron
            onPress={() => router.push('/(app)/downloads' as never)}
          />
        </SettingsSection>

        {/* Helper text */}
        <Text className="text-white/40 text-xs px-5 -mt-4 mb-8">
          Downloads apply only to VYBE music.
        </Text>

        {/* STORAGE */}
        <SettingsSection title="Storage">
          <SettingsItem
            icon={<Cloud size={20} color={preferICloud ? '#0A84FF' : '#fff'} />}
            title="Save to iCloud Drive"
            subtitle={
              preferICloud
                ? 'New downloads saved to iCloud Drive and available across your devices'
                : 'New downloads saved to this device only'
            }
            showSwitch
            switchValue={preferICloud}
            onSwitchChange={(v) => {
              setPreferICloud(v);
              showVybePopup({
                title: v ? 'iCloud Drive On' : 'iCloud Drive Off',
                message: v
                  ? 'New downloads will be saved to iCloud Drive. Note: this requires iCloud Documents to be enabled for VYBE in iOS Settings → Apple ID → iCloud.'
                  : 'New downloads will be saved locally on this device.',
                type: 'info',
              });
            }}
          />
          {preferICloud && (
            <View style={{ backgroundColor: 'rgba(10,132,255,0.08)', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }}>
              <Text style={{ color: 'rgba(10,132,255,0.9)', fontSize: 12, lineHeight: 17 }}>
                ℹ️  Full iCloud sync requires iCloud Documents access. If files aren't syncing across devices, go to iOS Settings → [Your Name] → iCloud → Apps Using iCloud and enable VYBE. Without this entitlement, files remain on-device only.
              </Text>
            </View>
          )}
          <SettingsDivider />
          <SettingsItem
            icon={<Trash2 size={20} color="#fff" />}
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
          <SettingsDivider />
          <SettingsItem
            icon={<HardDrive size={20} color="#fff" />}
            title="Cache size"
            value="245 MB"
          />
        </SettingsSection>

        {/* DISCOVERY */}
        <SettingsSection title="Discovery">
          <SettingsItem
            icon={<RefreshCw size={20} color="#fff" />}
            title="Auto-refresh on app open"
            subtitle="Automatically discover new tracks when you open VYBE."
            showSwitch
            switchValue={autoRefreshEnabled}
            onSwitchChange={setAutoRefreshEnabled}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Sparkles size={20} color="#fff" />}
            title="Seed tracks"
            subtitle="Tracks used to find similar music."
            value={`${seedTracksCount} tracks`}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Sparkles size={20} color="#fff" />}
            title="Discovered tracks"
            subtitle="Tracks found based on your listening."
            value={`${discoveredTracksCount} tracks`}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Trash2 size={20} color="#EF4444" />}
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
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      showVybePopup({
                        title: 'Done',
                        message: 'Discovery cache cleared. New tracks will appear on next refresh.',
                        type: 'success',
                      });
                    },
                  },
                ]
              });
            }}
          />
        </SettingsSection>

        {/* ABOUT */}
        <SettingsSection title="About">
          <SettingsItem
            icon={<Info size={20} color="#fff" />}
            title="Version"
            subtitle="Tap 5 times to unlock developer options"
            value="VYBE 1.0.0"
            onPress={() => {
              const unlocked = handleUnlockTap();
              if (unlocked) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showVybePopup({
                  title: 'Developer Mode',
                  message: 'Playback Debug Mode has been unlocked!',
                  type: 'success',
                });
              }
            }}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<FileText size={20} color="#fff" />}
            title="Terms of Service"
            showChevron
            onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Shield size={20} color="#fff" />}
            title="Privacy Policy"
            showChevron
            onPress={() => Linking.openURL('https://www.termsfeed.com/live/sample-privacy-policy')}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<HelpCircle size={20} color="#fff" />}
            title="Contact support"
            showChevron
            onPress={() => Linking.openURL('mailto:support@vybe.app?subject=VYBE Support')}
          />
        </SettingsSection>

        {/* DEVELOPER (only visible when debug mode is unlocked) */}
        {debugModeEnabled && (
          <SettingsSection title="Developer">
            <SettingsItem
              icon={<Bug size={20} color="#8B5CF6" />}
              title="Playback Debug Mode"
              subtitle="Show debug overlay with audio session info"
              showSwitch
              switchValue={debugOverlayVisible}
              onSwitchChange={() => toggleDebugOverlay()}
            />
            <SettingsDivider />
            <SettingsItem
              icon={<Bug size={20} color="#fff" />}
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
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      },
                    },
                  ]
                });
              }}
            />
          </SettingsSection>
        )}
      </ScrollView>
    </View>
  );
}
