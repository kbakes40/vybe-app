import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Modal, Text } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Download, Play, Music, Radio, Headphones, Disc } from 'lucide-react-native';
import {
  ShadowDiscoverIcon,
  ShadowHomeIcon,
  ShadowLibraryIcon,
  ShadowProfileIcon,
  ShadowSearchIcon,
  ShadowSparkleIcon,
  ShadowTabIconShell,
  SHADOW_TAB_ACTIVE,
  SHADOW_TAB_INACTIVE,
} from '@/components/navigation/ShadowTabBarIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { TAB_BAR_HEIGHT } from '@/constants/Layout';
import { useKeyboardChromeStore } from '@/stores/keyboardChromeStore';

// ── Source icons (streaming brand colors, neutral shapes — no brand logos) ──
function YouTubeIcon() {
  return (
    <View style={{ width: 36, height: 36, backgroundColor: '#FF0000', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
      <Play size={20} color="#fff" fill="#fff" />
    </View>
  );
}

function YouTubeMusicIcon() {
  return (
    <View style={{ width: 36, height: 36, backgroundColor: '#FF0000', borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
      <Music size={20} color="#fff" strokeWidth={2.5} />
    </View>
  );
}

function SoundCloudIcon() {
  return (
    <View style={{ width: 36, height: 36, backgroundColor: '#FF5500', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
      <Radio size={20} color="#fff" strokeWidth={2.5} />
    </View>
  );
}

function SpotifyIcon() {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#1DB954', alignItems: 'center', justifyContent: 'center' }}>
      <Headphones size={20} color="#fff" strokeWidth={2.5} />
    </View>
  );
}

function AppleMusicIcon() {
  return (
    <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#FC3C44', alignItems: 'center', justifyContent: 'center' }}>
      <Disc size={20} color="#fff" strokeWidth={2.5} />
    </View>
  );
}

// Fixed icon size - THE ONLY PLACE ICON SIZE IS DEFINED
const ICON_SIZE = 28;

/**
 * Tab bar button — Shadow theme uses light haptic on every press.
 * Forwards children unchanged (icons + labels come from `screenOptions`).
 */
function HapticTabButton(props: BottomTabBarButtonProps) {
  const { children, onPress, ...rest } = props;

  return (
    <Pressable
      {...rest}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPress={onPress}
      style={styles.tabButton}
    >
      {/* Render children as-is, untouched - NO modifications */}
      {children}
    </Pressable>
  );
}

function SearchTabButton(props: BottomTabBarButtonProps & { onAlreadySelected?: () => void }) {
  const { children, onPress, accessibilityState, onAlreadySelected, ...rest } = props;
  const isSelected = accessibilityState?.selected ?? false;
  const lastTapRef = React.useRef(0);

  /** Same double-tap affordance as Library: first tap when already on Search does nothing; double tap opens quick actions. */
  const handlePress = (e: Parameters<NonNullable<typeof onPress>>[0]) => {
    const now = Date.now();
    const isDoubleTap = isSelected && now - lastTapRef.current < 400;
    lastTapRef.current = now;

    if (isDoubleTap) {
      onAlreadySelected?.();
    } else if (!isSelected) {
      onPress?.(e);
    }
  };

  return (
    <Pressable
      {...rest}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPress={handlePress}
      style={styles.tabButton}
    >
      {children}
    </Pressable>
  );
}

function LibraryTabButton(props: BottomTabBarButtonProps & { onAlreadySelected?: () => void }) {
  const { children, onPress, accessibilityState, onAlreadySelected, ...rest } = props;
  const isSelected = accessibilityState?.selected ?? false;
  const lastTapRef = React.useRef(0);

  const handlePress = (e: Parameters<NonNullable<typeof onPress>>[0]) => {
    const now = Date.now();
    const isDoubleTap = isSelected && (now - lastTapRef.current) < 400;
    lastTapRef.current = now;

    if (isDoubleTap) {
      onAlreadySelected?.();
    } else {
      if (!isSelected) onPress?.(e);
    }
  };

  return (
    <Pressable
      {...rest}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPress={handlePress}
      style={styles.tabButton}
    >
      {children}
    </Pressable>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const keyboardVisible = useKeyboardChromeStore((s) => s.keyboardVisible);
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showSearchMenu, setShowSearchMenu] = useState(false);

  const tabBarChrome = keyboardVisible
    ? {
        display: 'none' as const,
        height: 0,
        opacity: 0,
        paddingTop: 0,
        paddingBottom: 0,
        borderTopWidth: 0,
      }
    : {
        height: TAB_BAR_HEIGHT + insets.bottom,
        paddingTop: 8,
        paddingBottom: Math.max(6, insets.bottom > 0 ? insets.bottom - 2 : 6),
      };

  return (
    <View style={styles.container}>
      {/* View My Modal */}
      <Modal
        visible={showViewMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowViewMenu(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setShowViewMenu(false)}
          />
          <View style={{ backgroundColor: '#282828', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: insets.bottom + 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>View my</Text>
              <Pressable
                onPress={() => setShowViewMenu(false)}
                style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>✕</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowViewMenu(false);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18 }}
            >
              <Text style={{ color: '#fff', fontSize: 16, flex: 1 }}>Library</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowViewMenu(false);
                router.push('/(app)/downloads' as never);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18 }}
            >
              <View style={{ marginRight: 14 }}>
                <Download size={20} color="#fff" />
              </View>
              <Text style={{ color: '#fff', fontSize: 16, flex: 1 }}>Downloads</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Search quick actions — Shadow OLED sheet (matches Search screen chrome) */}
      <Modal
        visible={showSearchMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSearchMenu(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.72)' }}
            onPress={() => setShowSearchMenu(false)}
          />
          <View style={[styles.searchSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.searchSheetHeader}>
              <Text style={styles.searchSheetTitle}>Add music</Text>
              <Pressable
                onPress={() => setShowSearchMenu(false)}
                style={({ pressed }) => [styles.searchSheetClose, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.searchSheetCloseGlyph}>✕</Text>
              </Pressable>
            </View>
            <Text style={styles.searchSheetHint}>Sources</Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSearchMenu(false);
                router.push('/(app)/add-music-youtube' as never);
              }}
              style={({ pressed }) => [styles.searchSheetRow, pressed && styles.searchSheetRowPressed]}
            >
              <YouTubeIcon />
              <Text style={styles.searchSheetRowLabel}>Vybe Video</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSearchMenu(false);
                router.push('/(app)/add-music-youtube-music' as never);
              }}
              style={({ pressed }) => [styles.searchSheetRow, pressed && styles.searchSheetRowPressed]}
            >
              <YouTubeMusicIcon />
              <Text style={styles.searchSheetRowLabel}>Vybe Music</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSearchMenu(false);
                router.push('/(app)/add-music-soundcloud' as never);
              }}
              style={({ pressed }) => [styles.searchSheetRow, pressed && styles.searchSheetRowPressed]}
            >
              <SoundCloudIcon />
              <Text style={styles.searchSheetRowLabel}>Vybe Waves</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSearchMenu(false);
                router.push('/(app)/add-music-spotify' as never);
              }}
              style={({ pressed }) => [styles.searchSheetRow, pressed && styles.searchSheetRowPressed]}
            >
              <SpotifyIcon />
              <Text style={styles.searchSheetRowLabel}>Stream Library</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSearchMenu(false);
                router.push('/(app)/add-music-apple-music' as never);
              }}
              style={({ pressed }) => [styles.searchSheetRow, styles.searchSheetRowLast, pressed && styles.searchSheetRowPressed]}
            >
              <AppleMusicIcon />
              <Text style={styles.searchSheetRowLabel}>Music Library</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 10,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            fontWeight: '600',
            marginTop: 2,
          },
          tabBarStyle: {
            backgroundColor: '#000000',
            borderTopWidth: 0.5,
            borderTopColor: '#ffffff15',
            zIndex: 20,
            elevation: 20,
            alignItems: 'center',
            justifyContent: 'center',
            ...tabBarChrome,
          },
          tabBarActiveTintColor: SHADOW_TAB_ACTIVE,
          tabBarInactiveTintColor: SHADOW_TAB_INACTIVE,
          tabBarIconStyle: {
            width: ICON_SIZE,
            height: ICON_SIZE,
            marginTop: 0,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarButton: (props) => <HapticTabButton {...props} />,
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? SHADOW_TAB_ACTIVE : SHADOW_TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused}>
                  <ShadowHomeIcon size={dim} color={c} />
                </ShadowTabIconShell>
              );
            },
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarButton: (props) => (
              <SearchTabButton {...props} onAlreadySelected={() => setShowSearchMenu(true)} />
            ),
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? SHADOW_TAB_ACTIVE : SHADOW_TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused}>
                  <ShadowSearchIcon size={dim} color={c} />
                </ShadowTabIconShell>
              );
            },
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: 'Discover',
            tabBarButton: (props) => <HapticTabButton {...props} />,
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? SHADOW_TAB_ACTIVE : SHADOW_TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused}>
                  <ShadowDiscoverIcon size={dim} color={c} />
                </ShadowTabIconShell>
              );
            },
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Your Library',
            tabBarButton: (props) => (
              <LibraryTabButton
                {...props}
                onAlreadySelected={() => setShowViewMenu(true)}
              />
            ),
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? SHADOW_TAB_ACTIVE : SHADOW_TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused}>
                  <ShadowLibraryIcon size={dim} color={c} />
                </ShadowTabIconShell>
              );
            },
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarButton: (props) => <HapticTabButton {...props} />,
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? SHADOW_TAB_ACTIVE : SHADOW_TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused}>
                  <ShadowProfileIcon size={dim} color={c} />
                </ShadowTabIconShell>
              );
            },
          }}
        />
        <Tabs.Screen
          name="social"
          options={{
            title: 'Social',
            tabBarButton: (props) => <HapticTabButton {...props} />,
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? SHADOW_TAB_ACTIVE : SHADOW_TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused}>
                  <ShadowSparkleIcon size={dim} color={c} />
                </ShadowTabIconShell>
              );
            },
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  // Tab button style - only handles layout, NOT icon size
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSheet: {
    backgroundColor: '#121214',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  searchSheetTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  searchSheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSheetCloseGlyph: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '600',
  },
  searchSheetHint: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
  },
  searchSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  searchSheetRowLast: {
    borderBottomWidth: 0,
  },
  searchSheetRowPressed: {
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  searchSheetRowLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginLeft: 16,
    letterSpacing: -0.2,
  },
});
