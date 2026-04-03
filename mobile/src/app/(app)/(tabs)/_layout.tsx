import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Tabs } from 'expo-router';
import { Home, Search, Library, Compass } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';

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

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
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
            tabBarButton: (props) => <HapticTabButton {...props} />,
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
            tabBarButton: (props) => <HapticTabButton {...props} />,
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
