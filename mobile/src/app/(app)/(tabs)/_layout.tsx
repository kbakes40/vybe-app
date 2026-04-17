import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Modal, Text } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Home, Search, Library, Compass, Download, Play, Music, Radio, Headphones, Disc, User, Sparkles } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { TAB_BAR_BASE_HEIGHT } from '@/constants/miniPlayer';

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

// Standard tab bar height (content area, excluding safe area)
const TAB_BAR_CONTENT_HEIGHT = TAB_BAR_BASE_HEIGHT;

// Fixed icon size - THE ONLY PLACE ICON SIZE IS DEFINED
const ICON_SIZE = 28;

/**
 * Custom tab bar button with premium haptic feedback
 * - Medium impact on new tab selection
 * - Light impact when reselecting current tab
 *
 * CRITICAL: This ONLY handles haptics and forwards children as-is.
 * It does NOT modify icon styles, size, or add any wrappers around the icon.
 */
function HapticTabButton(props: BottomTabBarButtonProps) {
  const { children, onPress, accessibilityState, ...rest } = props;
  const isSelected = accessibilityState?.selected ?? false;

  const handlePress = (e: Parameters<NonNullable<typeof onPress>>[0]) => {
    // Trigger haptic FIRST
    if (isSelected) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    // Immediately forward the original onPress
    onPress?.(e);
  };

  return (
    <Pressable
      {...rest}
      onPress={handlePress}
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

  const handlePress = (e: Parameters<NonNullable<typeof onPress>>[0]) => {
    if (isSelected) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onAlreadySelected?.();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onPress?.(e);
    }
  };

  return (
    <Pressable {...rest} onPress={handlePress} style={styles.tabButton}>
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onAlreadySelected?.();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (!isSelected) onPress?.(e);
    }
  };

  return (
    <Pressable {...rest} onPress={handlePress} style={styles.tabButton}>
      {children}
    </Pressable>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [showSearchMenu, setShowSearchMenu] = useState(false);

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
              <YouTubeIcon />
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
              <YouTubeMusicIcon />
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
              <SoundCloudIcon />
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
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          // Tab bar style - height explicitly locked
          tabBarStyle: {
            backgroundColor: '#121212',
            borderTopWidth: 0,
            elevation: 0,
            height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
            paddingTop: 10,
            paddingBottom: insets.bottom,
            alignItems: 'center',
            justifyContent: 'center',
          },
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#B3B3B3',
          // Icon container size - explicitly locked
          tabBarIconStyle: {
            width: ICON_SIZE,
            height: ICON_SIZE,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarButton: (props) => <HapticTabButton {...props} />,
            tabBarIcon: ({ color, size }) => (
              <Home
                color={color}
                size={size}
                strokeWidth={2}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="search"
          options={{
            title: 'Search',
            tabBarButton: (props) => (
              <SearchTabButton {...props} onAlreadySelected={() => setShowSearchMenu(true)} />
            ),
            tabBarIcon: ({ color, size }) => (
              <Search
                color={color}
                size={size}
                strokeWidth={2}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            title: 'Discover',
            tabBarButton: (props) => <HapticTabButton {...props} />,
            tabBarIcon: ({ color, size }) => (
              <Compass
                color={color}
                size={size}
                strokeWidth={2}
              />
            ),
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
            tabBarIcon: ({ color, size }) => (
              <Library
                color={color}
                size={size}
                strokeWidth={2}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarButton: (props) => <HapticTabButton {...props} />,
            tabBarIcon: ({ color, size }) => (
              <User color={color} size={size} strokeWidth={2} />
            ),
          }}
        />
        <Tabs.Screen
          name="social"
          options={{
            title: 'Social',
            tabBarButton: (props) => <HapticTabButton {...props} />,
            tabBarIcon: ({ color, size }) => (
              <Sparkles color={color} size={size} strokeWidth={2} />
            ),
          }}
        />
        <Tabs.Screen name="two" options={{ href: null }} />
        <Tabs.Screen name="library 2" options={{ href: null }} />
        <Tabs.Screen name="library 3" options={{ href: null }} />
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
});
