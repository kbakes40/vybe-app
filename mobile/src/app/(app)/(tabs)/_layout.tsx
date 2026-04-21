import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Modal, Text, Image } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Download, Headphones, Disc } from 'lucide-react-native';
import {
  VybeVideoNeonIcon,
  VybeMusicNeonIcon,
  VybeWavesNeonIcon,
} from '@/assets/icons/VybeNeonSourceIcons';
import {
  ShadowHomeIcon,
  ShadowLibraryIcon,
  ShadowProfileIcon,
  ShadowSaxSearchIcon,
  ShadowTabIconShell,
  ShadowVaultWaveIcon,
} from '@/components/navigation/ShadowTabBarIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import {
  DOC_LABEL_GAP_PT,
  DOC_ICON_ROW_MIN_HEIGHT_PT,
  TAB_BAR_HEIGHT,
} from '@/constants/Layout';
import { ShadowMachinedTabBar } from '@/components/navigation/ShadowMachinedTabBar';
import { LouisOledTabOverlays } from '@/components/LouisOledTabOverlays';
import { useTabBarBloomStore } from '@/stores/tabBarBloomStore';
import { DOCK_CYAN } from '@/constants/machinedTheme';

const VYBE_TAB_ICON = require('../../../../assets/images/icon.png');

/** Inactive tab icon: 0.4 opacity white on OLED black (spec). */
const TAB_INACTIVE = 'rgba(255,255,255,0.4)';
/** Active tab + labels — branded Doc cyan #00E5FF (see DOCK_CYAN). */
const TAB_ACTIVE = DOCK_CYAN;

const ICON_SIZE = 25;
const CENTER_ICON_SIZE = 30;

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

function HapticTabButton(props: BottomTabBarButtonProps & { bloomRoute?: string }) {
  const { children, onPress, style, bloomRoute, ...rest } = props;

  return (
    <Pressable
      {...rest}
      hitSlop={{ top: 8, bottom: 12, left: 4, right: 4 }}
      unstable_pressDelay={0}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (bloomRoute) useTabBarBloomStore.getState().pulse(bloomRoute);
      }}
      onPress={onPress}
      style={[style, styles.tabButton]}
    >
      {children}
    </Pressable>
  );
}

function SearchTabButton(props: BottomTabBarButtonProps & { onAlreadySelected?: () => void; bloomRoute?: string }) {
  const { children, onPress, style, accessibilityState, onAlreadySelected, bloomRoute, ...rest } = props;
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
      hitSlop={{ top: 8, bottom: 12, left: 4, right: 4 }}
      unstable_pressDelay={0}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (bloomRoute) useTabBarBloomStore.getState().pulse(bloomRoute);
      }}
      onPress={handlePress}
      style={[style, styles.tabButton]}
    >
      {children}
    </Pressable>
  );
}

function VaultTabButton(props: BottomTabBarButtonProps & { onAlreadySelected?: () => void; bloomRoute?: string }) {
  const { children, onPress, style, accessibilityState, onAlreadySelected, bloomRoute, ...rest } = props;
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
      hitSlop={{ top: 8, bottom: 12, left: 4, right: 4 }}
      unstable_pressDelay={0}
      onPressIn={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (bloomRoute) useTabBarBloomStore.getState().pulse(bloomRoute);
      }}
      onPress={handlePress}
      style={[style, styles.tabButton]}
    >
      {children}
    </Pressable>
  );
}

/**
 * MAIN TABS (the Doc) — primary shell after auth.
 *
 * NAV_AUDIT:
 * - Root: `app/_layout.tsx` → `RootLayoutNav` Stack → authenticated branch includes `Stack.Screen name="(app)"`.
 * - App shell: `(app)/_layout.tsx` → `Stack.Screen name="(tabs)"` is the TabNavigator host (not duplicate stack routes for these five).
 * - This file: `Tabs` registers exactly five children — `index`, `search`, `discover`, `vault`, `profile` — symmetric dock only (matches filenames).
 * - `tabBarHideOnKeyboard: false`. Dock is always visible on tab routes.
 * - Post-auth entry: `getPostAuthDestination()` → `/(app)/(tabs)/discover`; sign-in uses `router.replace(dest)` to land on MainTabs.
 * - Safe area: `paddingBottom` uses `insets.bottom` + `TAB_BAR_HOME_CLEARANCE_PT` so labels sit above the home indicator.
 */
export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showSearchMenu, setShowSearchMenu] = useState(false);

  return (
    <View style={styles.container}>
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
              <Text
                style={{
                  fontSize: 16,
                  flex: 1,
                  marginLeft: 16,
                  fontWeight: '700',
                  color: DOCK_CYAN,
                  textShadowColor: 'rgba(0, 229, 255, 0.5)',
                  textShadowOffset: { width: 0, height: 0 },
                  textShadowRadius: 4,
                }}
              >
                Vybe Waves
              </Text>
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
        initialRouteName="index"
        tabBar={(tabProps) => <ShadowMachinedTabBar {...tabProps} />}
        screenOptions={{
          headerShown: false,
          lazy: true,
          freezeOnBlur: true,
          tabBarHideOnKeyboard: false,
          tabBarShowLabel: true,
          tabBarLabelPosition: 'below-icon',
          tabBarLabelStyle: {
            fontSize: 10,
            lineHeight: 12,
            fontWeight: '600',
            letterSpacing: 0.6,
            marginTop: DOC_LABEL_GAP_PT,
            textAlign: 'center',
            alignSelf: 'center',
            width: '100%',
            textTransform: 'uppercase',
            textShadowColor: 'rgba(0, 229, 255, 0.45)',
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 4,
          },
          tabBarItemStyle: {
            paddingVertical: 6,
          },
          tabBarStyle: {
            position: 'absolute',
            bottom: 16,
            left: 0,
            right: 0,
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            /* Must paint above tab scene content so the Doc is never covered by scroll layers. */
            zIndex: 100000,
            elevation: 100000,
            alignItems: 'center',
            justifyContent: 'center',
            /* Default RN tab bar uses 49pt content — too tight for below-icon labels; explicit height avoids clipping. */
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingTop: 6,
            paddingBottom: insets.bottom,
          },
          tabBarActiveTintColor: TAB_ACTIVE,
          tabBarInactiveTintColor: TAB_INACTIVE,
          tabBarIconStyle: {
            minHeight: DOC_ICON_ROW_MIN_HEIGHT_PT,
            marginTop: 0,
            marginBottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
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
              const c = focused ? TAB_ACTIVE : TAB_INACTIVE;
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
              const c = focused ? TAB_ACTIVE : TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused} pressRoute="search">
                  <ShadowSaxSearchIcon size={dim} color={c} />
                </ShadowTabIconShell>
              );
            },
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: 'Discover',
            tabBarAccessibilityLabel: 'Vybe Discover',
            tabBarButton: (props) => <HapticTabButton {...props} bloomRoute="discover" />,
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? CENTER_ICON_SIZE;
              return (
                <ShadowTabIconShell focused={focused} variant="vybe" pressRoute="discover">
                  <Image
                    source={VYBE_TAB_ICON}
                    style={{
                      width: dim,
                      height: dim,
                      borderRadius: Math.max(6, dim * 0.22),
                      opacity: focused ? 1 : 0.4,
                    }}
                    resizeMode="contain"
                  />
                </ShadowTabIconShell>
              );
            },
          }}
        />
        <Tabs.Screen
          name="vault"
          options={{
            title: 'Library',
            tabBarButton: (props) => (
              <VaultTabButton
                {...props}
                bloomRoute="vault"
                onAlreadySelected={() => setShowViewMenu(true)}
              />
            ),
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? TAB_ACTIVE : TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused} pressRoute="vault">
                  <ShadowVaultWaveIcon size={dim} color={c} />
                </ShadowTabIconShell>
              );
            },
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Account',
            tabBarButton: (props) => <HapticTabButton {...props} bloomRoute="profile" />,
            tabBarIcon: ({ focused, size }) => {
              const dim = size ?? ICON_SIZE;
              const c = focused ? TAB_ACTIVE : TAB_INACTIVE;
              return (
                <ShadowTabIconShell focused={focused} pressRoute="profile">
                  <ShadowProfileIcon size={dim} color={c} />
                </ShadowTabIconShell>
              );
            },
          }}
        />
      </Tabs>
      <LouisOledTabOverlays />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    minHeight: 46,
  },
});
