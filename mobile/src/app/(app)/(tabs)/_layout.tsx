import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Modal, Text } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Home, Search, Library, Compass, Download } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';

// ── Platform icons ────────────────────────────────────────────────────────────
function YouTubeIcon() {
  return (
    <View style={{ width: 36, height: 36, backgroundColor: '#FF0000', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 0, height: 0, borderLeftWidth: 14, borderTopWidth: 8, borderBottomWidth: 8, borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 3 }} />
    </View>
  );
}

function YouTubeMusicIcon() {
  return (
    <View style={{ width: 36, height: 36, backgroundColor: '#FF0000', borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 0, height: 0, borderLeftWidth: 14, borderTopWidth: 8, borderBottomWidth: 8, borderLeftColor: '#fff', borderTopColor: 'transparent', borderBottomColor: 'transparent', marginLeft: 3 }} />
    </View>
  );
}

function SoundCloudIcon() {
  return (
    <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FF5500', fontSize: 22, fontWeight: '900', letterSpacing: -1 }}>))))</Text>
    </View>
  );
}

function SpotifyIcon() {
  // Green circle with Spotify's three-arc soundwave logo
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36">
      <Circle cx={18} cy={18} r={18} fill="#1DB954" />
      {/* Top arc — widest */}
      <Path
        d="M8.5 15 Q18 10.5 27.5 14.5"
        stroke="white" strokeWidth="2.6" strokeLinecap="round" fill="none"
      />
      {/* Middle arc */}
      <Path
        d="M10 19.5 Q18 15.5 26 19"
        stroke="white" strokeWidth="2.3" strokeLinecap="round" fill="none"
      />
      {/* Bottom arc — narrowest */}
      <Path
        d="M11.5 24 Q18 20.5 24.5 23.5"
        stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"
      />
    </Svg>
  );
}

function AppleMusicIcon() {
  // Gradient red rounded-square with white eighth-note
  return (
    <Svg width={36} height={36} viewBox="0 0 36 36">
      <Defs>
        <LinearGradient id="amGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FC5C65" stopOpacity="1" />
          <Stop offset="1" stopColor="#C0152A" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={36} height={36} rx={8} fill="url(#amGrad)" />
      {/* Note head */}
      <Path
        d="M11 25.5 C11 23.6 12.6 22 14.5 22 C16.4 22 18 23.6 18 25.5 C18 27.4 16.4 29 14.5 29 C12.6 29 11 27.4 11 25.5Z"
        fill="white"
      />
      {/* Stem */}
      <Rect x={16.5} y={10} width={2.2} height={16} rx={1.1} fill="white" />
      {/* Beam top-right flag */}
      <Path
        d="M18.7 10 C22 10.5 25 13 25 16 C25 18 23 19.5 18.7 19"
        stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
    </Svg>
  );
}

// Mini player dimensions - exported for use in screens
export const MINI_PLAYER_HEIGHT = 66; // 48px artwork + 16px padding + 2px progress bar

// Standard tab bar height (content area, excluding safe area)
const TAB_BAR_CONTENT_HEIGHT = 76;

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
              <Text style={{ color: '#fff', fontSize: 16, flex: 1, marginLeft: 16 }}>YouTube</Text>
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
              <Text style={{ color: '#fff', fontSize: 16, flex: 1, marginLeft: 16 }}>YouTube Music</Text>
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
              <Text style={{ color: '#fff', fontSize: 16, flex: 1, marginLeft: 16 }}>SoundCloud</Text>
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
              <Text style={{ color: '#fff', fontSize: 16, flex: 1, marginLeft: 16 }}>Spotify</Text>
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
              <Text style={{ color: '#fff', fontSize: 16, flex: 1, marginLeft: 16 }}>Apple Music</Text>
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
          name="two"
          options={{
            href: null,
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
});
