import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Modal, Text, Image } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Download, Play, Headphones, Disc } from 'lucide-react-native';
import {
  VybeVideoNeonIcon,
  VybeMusicNeonIcon,
  VybeWavesNeonIcon,
} from '@/assets/icons/VybeNeonSourceIcons';
import {
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
import * as Haptics from 'expo-haptics';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { TAB_BAR_HEIGHT } from '@/constants/Layout';
import { useKeyboardChromeStore } from '@/stores/keyboardChromeStore';
import { ShadowMachinedTabBar } from '@/components/navigation/ShadowMachinedTabBar';
import { useTabBarBloomStore } from '@/stores/tabBarBloomStore';

const VYBE_TAB_ICON = require('../../../../assets/images/icon.png');

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
function HapticTabButton(props: BottomTabBarButtonProps & { bloomRoute?: string }) {
  const { children, onPress, bloomRoute, ...rest } = props;

  return (
    <Pressable
      {...rest}
      unstable_pressDelay={0}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (bloomRoute) useTabBarBloomStore.getState().pulse(bloomRoute);
      }}
      onPress={onPress}
      style={styles.tabButton}
    >
      {children}
    </Pressable>
  );
}

function SearchTabButton(props: BottomTabBarButtonProps & { onAlreadySelected?: () => void; bloomRoute?: string }) {
  const { children, onPress, accessibilityState, onAlreadySelected, bloomRoute, ...rest } = props;
  const isSelected = accessibilityState?.selected ?? false;

  const handlePress = (e: Parameters<NonNullable<typeof onPress>>[0]) => {
    if (isSelected) {
      onAlreadySelected?.();
    } else {
      onPress?.(e);
    }
  };

  return (
    <Pressable
      {...rest}
      unstable_pressDelay={0}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (bloomRoute) useTabBarBloomStore.getState().pulse(bloomRoute);
      }}
      onPress={handlePress}
      style={styles.tabButton}
    >
      {children}
    </Pressable>
  );
}

function LibraryTabButton(props: BottomTabBarButtonProps & { onAlreadySelected?: () => void; bloomRoute?: string }) {
  const { children, onPress, accessibilityState, onAlreadySelected, bloomRoute, ...rest } = props;
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
      unstable_pressDelay={0}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (bloomRoute) useTabBarBloomStore.getState().pulse(bloomRoute);
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
        paddingTop: 10,
        paddingBottom: Math.max(8, insets.bottom > 0 ? insets.bottom - 2 : 8),
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

      {/* Search Menu Modal */}
      <Modal
        visible={showSearchMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSearchMenu(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            onPress={() => setShowSearchMenu(false)}
          />
          <View style={{ backgroundColor: '#282828', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: insets.bottom + 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Search</Text>
              <Pressable
                onPress={() => setShowSearchMenu(false)}
                style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>✕</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSearchMenu(false);
                router.push('/(app)/add-music-youtube' as never);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}
            >
              <VybeVideoNeonIcon size={36} />
              <Text style={{ color: '#fff', fontSize: 16, flex: 1, marginLeft: 16 }}>Vybe Video</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSearchMenu(false);
                router.push('/(app)/add-music-youtube-music' as never);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}
            >
              <VybeMusicNeonIcon size={36} />
              <Text style={{ color: '#fff', fontSize: 16, flex: 1, marginLeft: 16 }}>Vybe Music</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSearchMenu(false);
                router.push('/(app)/add-music-soundcloud' as never);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}
            >
              <VybeWavesNeonIcon size={36} />
              <Text style={{ color: '#fff', fontSize: 16, flex: 1, marginLeft: 16 }}>Vybe Waves</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSearchMenu(false);
                router.push('/(app)/add-music-spotify' as never);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}
            >
              <SpotifyIcon />
              <Text style={{ color: '#fff', fontSize: 16, flex: 1, marginLeft: 16 }}>Stream Library</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowSearchMenu(false);
                router.push('/(app)/add-music-apple-music' as never);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 }}
            >
              <AppleMusicIcon />
              <Text style={{ color: '#fff', fontSize: 16, flex: 1, marginLeft: 16 }}>Music Library</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Tabs
        tabBar={(tabProps) => <ShadowMachinedTabBar {...tabProps} />}
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
          tabBarShowLabel: false,
          tabBarStyle: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: '#000000',
            // Sharp 1px OLED Black "machined" separation between mini-player
            // bottom and tab-bar top. Black-on-black creates a physical seam
            // (no visible color, but a 1px structural gap).
            borderTopWidth: 1,
            borderTopColor: '#000000',
            zIndex: 1000,
            elevation: 1000,
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
            marginBottom: 0,
            alignSelf: 'center',
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarButton: (props) => <HapticTabButton {...props} bloomRoute="index" />,
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? SHADOW_TAB_ACTIVE : SHADOW_TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused} pressRoute="index">
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
              <SearchTabButton
                {...props}
                bloomRoute="search"
                onAlreadySelected={() => setShowSearchMenu(true)}
              />
            ),
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? SHADOW_TAB_ACTIVE : SHADOW_TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused} pressRoute="search">
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
            tabBarButton: (props) => <HapticTabButton {...props} bloomRoute="discover" />,
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              return (
                <ShadowTabIconShell focused={focused} variant="vybe" pressRoute="discover">
                  <Image
                    source={VYBE_TAB_ICON}
                    style={{
                      width: dim,
                      height: dim,
                      borderRadius: Math.max(6, dim * 0.22),
                      opacity: focused ? 1 : 0.72,
                    }}
                    resizeMode="cover"
                  />
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
                bloomRoute="library"
                onAlreadySelected={() => setShowViewMenu(true)}
              />
            ),
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? SHADOW_TAB_ACTIVE : SHADOW_TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused} pressRoute="library">
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
            tabBarButton: (props) => <HapticTabButton {...props} bloomRoute="profile" />,
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? SHADOW_TAB_ACTIVE : SHADOW_TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused} pressRoute="profile">
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
            tabBarButton: (props) => <HapticTabButton {...props} bloomRoute="social" />,
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? SHADOW_TAB_ACTIVE : SHADOW_TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused} pressRoute="social">
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
    backgroundColor: '#000000',
  },
  // Tab button style - only handles layout, NOT icon size
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    minHeight: 48,
  },
});
