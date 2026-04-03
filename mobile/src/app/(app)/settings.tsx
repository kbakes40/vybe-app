import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
} from 'react-native';
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
} from 'lucide-react-native';
import { authClient } from '@/lib/auth/auth-client';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePlaybackDebugStore } from '@/stores/playbackDebugStore';
import { usePlaybackController } from '@/stores/playbackController';
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

  // Debug store
  const debugModeEnabled = usePlaybackDebugStore(s => s.debugModeEnabled);
  const setDebugModeEnabled = usePlaybackDebugStore(s => s.setDebugModeEnabled);
  const handleUnlockTap = usePlaybackDebugStore(s => s.handleUnlockTap);
  const debugOverlayVisible = usePlaybackDebugStore(s => s.debugOverlayVisible);
  const toggleDebugOverlay = usePlaybackDebugStore(s => s.toggleDebugOverlay);

  // Calculate bottom padding: safe area + mini player height (if visible) + extra padding
  const bottomPadding = insets.bottom + (showMiniPlayer ? MINI_PLAYER_HEIGHT : 0) + 40;

  // Account settings state
  const [crossfade, setCrossfade] = useState(false);
  const [gapless, setGapless] = useState(true);
  const [normalizeVolume, setNormalizeVolume] = useState(true);
  const [autoplay, setAutoplay] = useState(true);
  const [dataSaver, setDataSaver] = useState(false);
  const [cellularStreaming, setCellularStreaming] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [newMusicNotifications, setNewMusicNotifications] = useState(true);
  const [productAnnouncements, setProductAnnouncements] = useState(false);
  const [privateSession, setPrivateSession] = useState(false);
  const [listeningActivity, setListeningActivity] = useState(true);
  const [explicitContent, setExplicitContent] = useState(true);
  const [downloadCellular, setDownloadCellular] = useState(false);

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      router.replace('/sign-in');
    } catch (error) {
      console.error('Sign out error:', error);
    }
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
            onPress={() => {}}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Lock size={20} color="#fff" />}
            title="Password"
            subtitle="Update your password to keep your account secure."
            showChevron
            onPress={() => {}}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Link2 size={20} color="#fff" />}
            title="Connected services"
            subtitle="Manage services you've connected to VYBE."
            showChevron
            onPress={() => {}}
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
            value="High"
            showChevron
            onPress={() => {}}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Disc size={20} color="#fff" />}
            title="Crossfade"
            subtitle="Smoothly blend songs together."
            showSwitch
            switchValue={crossfade}
            onSwitchChange={setCrossfade}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Play size={20} color="#fff" />}
            title="Gapless playback"
            subtitle="Play albums and playlists without silence between tracks."
            showSwitch
            switchValue={gapless}
            onSwitchChange={setGapless}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Sliders size={20} color="#fff" />}
            title="Equalizer"
            subtitle="Adjust the sound to your taste."
            showChevron
            onPress={() => {}}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<VolumeX size={20} color="#fff" />}
            title="Normalize volume"
            subtitle="Keep volume consistent between songs."
            showSwitch
            switchValue={normalizeVolume}
            onSwitchChange={setNormalizeVolume}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Radio size={20} color="#fff" />}
            title="Autoplay"
            subtitle="Keep the music going when your queue ends."
            showSwitch
            switchValue={autoplay}
            onSwitchChange={setAutoplay}
          />
        </SettingsSection>

        {/* DATA SAVER */}
        <SettingsSection title="Data Saver">
          <SettingsItem
            icon={<Wifi size={20} color="#fff" />}
            title="Data saver"
            subtitle="Reduce data usage while streaming."
            showSwitch
            switchValue={dataSaver}
            onSwitchChange={setDataSaver}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Radio size={20} color="#fff" />}
            title="Streaming quality on cellular"
            subtitle="Lower quality uses less data."
            value="Normal"
            showChevron
            onPress={() => {}}
          />
        </SettingsSection>

        {/* NOTIFICATIONS */}
        <SettingsSection title="Notifications">
          <SettingsItem
            icon={<Bell size={20} color="#fff" />}
            title="Push notifications"
            subtitle="Allow notifications from VYBE."
            showSwitch
            switchValue={pushNotifications}
            onSwitchChange={setPushNotifications}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<BellRing size={20} color="#fff" />}
            title="New music and updates"
            subtitle="Get notified about new releases and recommendations."
            showSwitch
            switchValue={newMusicNotifications}
            onSwitchChange={setNewMusicNotifications}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Gift size={20} color="#fff" />}
            title="Product announcements"
            subtitle="Hear about new features."
            showSwitch
            switchValue={productAnnouncements}
            onSwitchChange={setProductAnnouncements}
          />
        </SettingsSection>

        {/* PRIVACY AND SOCIAL */}
        <SettingsSection title="Privacy and Social">
          <SettingsItem
            icon={<EyeOff size={20} color="#fff" />}
            title="Private session"
            subtitle="Listening won't affect recommendations or social features."
            showSwitch
            switchValue={privateSession}
            onSwitchChange={setPrivateSession}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Eye size={20} color="#fff" />}
            title="Listening activity"
            subtitle="Share what you're listening to."
            showSwitch
            switchValue={listeningActivity}
            onSwitchChange={setListeningActivity}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<UserX size={20} color="#fff" />}
            title="Blocked users"
            subtitle="Manage blocked accounts."
            showChevron
            onPress={() => {}}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Shield size={20} color="#fff" />}
            title="Data and privacy"
            subtitle="Learn how we collect and use your data."
            showChevron
            onPress={() => {}}
          />
        </SettingsSection>

        {/* CONTENT AND DISPLAY */}
        <SettingsSection title="Content and Display">
          <SettingsItem
            icon={<AlertCircle size={20} color="#fff" />}
            title="Explicit content"
            subtitle="Allow music marked explicit."
            showSwitch
            switchValue={explicitContent}
            onSwitchChange={setExplicitContent}
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
            value="High"
            showChevron
            onPress={() => {}}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Wifi size={20} color="#fff" />}
            title="Download over cellular"
            subtitle="Allow downloads without Wi-Fi."
            showSwitch
            switchValue={downloadCellular}
            onSwitchChange={setDownloadCellular}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<HardDrive size={20} color="#fff" />}
            title="Manage downloads"
            subtitle="Remove downloaded music from this device."
            showChevron
            onPress={() => {}}
          />
        </SettingsSection>

        {/* Helper text */}
        <Text className="text-white/40 text-xs px-5 -mt-4 mb-8">
          Downloads apply only to VYBE music.
        </Text>

        {/* STORAGE */}
        <SettingsSection title="Storage">
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
            onPress={() => {}}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<Shield size={20} color="#fff" />}
            title="Privacy Policy"
            showChevron
            onPress={() => {}}
          />
          <SettingsDivider />
          <SettingsItem
            icon={<HelpCircle size={20} color="#fff" />}
            title="Contact support"
            showChevron
            onPress={() => {}}
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
