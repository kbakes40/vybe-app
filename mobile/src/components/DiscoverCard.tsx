import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { ExternalLink } from 'lucide-react-native';
import {
  DiscoverItem,
  useDiscoverFeedStore,
} from '@/stores/discoverFeedStore';
import {
  openExternal,
  getActionButtonText,
  getPlatformColor,
  getSoundCloudHelperText,
} from '@/lib/openExternal';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface DiscoverCardProps {
  item: DiscoverItem;
  onVisible?: () => void;
}

/**
 * DiscoverCard - Displays a recommended track from external platforms.
 *
 * IMPORTANT: This card does NOT have a play button.
 * External items can only be opened in their native apps.
 *
 * Features:
 * - Platform badge (YouTube red, SoundCloud orange)
 * - Thumbnail with gradient overlay
 * - Action button to open in external app
 * - Helper text for SoundCloud explaining availability
 * - Impression tracking when card becomes visible
 * - Open tracking when user taps to open
 */
export function DiscoverCard({ item, onVisible }: DiscoverCardProps) {
  const scale = useSharedValue(1);
  const trackEvent = useDiscoverFeedStore((s) => s.trackEvent);
  const hasTrackedImpression = useRef(false);

  // Track impression when card becomes visible
  useEffect(() => {
    if (!hasTrackedImpression.current) {
      trackEvent(item.id, 'impression');
      hasTrackedImpression.current = true;
      onVisible?.();
    }
  }, [item.id, trackEvent, onVisible]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    openExternal({
      itemId: item.id,
      platform: item.sourcePlatform,
      deepLinkUrl: item.deepLinkUrl,
      externalUrl: item.externalUrl,
      searchQuery: item.searchQuery,
    });
  };

  const platformColor = getPlatformColor(item.sourcePlatform);
  const actionText = getActionButtonText(item.sourcePlatform);
  const isSoundCloud = item.sourcePlatform === 'SOUNDCLOUD';

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.97);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={animatedStyle}
      className="mr-4"
    >
      <View style={{ width: 160 }}>
        {/* Thumbnail with platform badge */}
        <View className="relative overflow-hidden rounded-xl">
          <Image
            source={{ uri: item.thumbnailUrl }}
            style={{ width: 160, height: 160, borderRadius: 12 }}
            contentFit="cover"
          />

          {/* Gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 70,
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 12,
            }}
          />

          {/* Platform badge */}
          <View
            className="absolute top-2 left-2 flex-row items-center rounded px-2 py-1"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
          >
            <PlatformIcon platform={item.sourcePlatform} />
            <Text
              className="text-white text-[10px] font-semibold ml-1"
              style={{ color: platformColor }}
            >
              {item.sourcePlatform === 'YOUTUBE' ? 'YouTube' : 'SoundCloud'}
            </Text>
          </View>

          {/* Open external indicator */}
          <View className="absolute bottom-2 right-2 bg-white/20 rounded-full p-2">
            <ExternalLink size={16} color="#fff" />
          </View>
        </View>

        {/* Track info */}
        <Text
          className="text-white font-semibold text-sm mt-2"
          numberOfLines={2}
        >
          {item.title}
        </Text>
        <Text className="text-white/60 text-xs mt-0.5" numberOfLines={1}>
          {item.creatorName}
        </Text>

        {/* Action button */}
        <Pressable
          onPress={handlePress}
          className="mt-2 rounded-lg py-2 px-3 flex-row items-center justify-center"
          style={{ backgroundColor: platformColor }}
        >
          <ExternalLink size={14} color="#fff" />
          <Text className="text-white text-xs font-semibold ml-1.5">
            {actionText}
          </Text>
        </Pressable>

        {/* SoundCloud helper text */}
        {isSoundCloud ? (
          <Text className="text-white/40 text-[10px] mt-1.5 text-center">
            {getSoundCloudHelperText()}
          </Text>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

/**
 * Platform icon component
 */
function PlatformIcon({ platform }: { platform: 'YOUTUBE' | 'SOUNDCLOUD' }) {
  if (platform === 'YOUTUBE') {
    return (
      <View
        style={{
          width: 14,
          height: 14,
          backgroundColor: '#FF0000',
          borderRadius: 3,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 5,
            borderTopWidth: 3,
            borderBottomWidth: 3,
            borderLeftColor: '#fff',
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
            marginLeft: 1,
          }}
        />
      </View>
    );
  }

  // SoundCloud icon
  return (
    <View
      style={{
        width: 14,
        height: 14,
        backgroundColor: '#FF5500',
        borderRadius: 3,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: 7, fontWeight: 'bold' }}>SC</Text>
    </View>
  );
}

/**
 * Compact version of DiscoverCard for smaller displays
 */
export function DiscoverCardCompact({ item }: DiscoverCardProps) {
  const scale = useSharedValue(1);
  const trackEvent = useDiscoverFeedStore((s) => s.trackEvent);
  const hasTrackedImpression = useRef(false);

  useEffect(() => {
    if (!hasTrackedImpression.current) {
      trackEvent(item.id, 'impression');
      hasTrackedImpression.current = true;
    }
  }, [item.id, trackEvent]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    openExternal({
      itemId: item.id,
      platform: item.sourcePlatform,
      deepLinkUrl: item.deepLinkUrl,
      externalUrl: item.externalUrl,
      searchQuery: item.searchQuery,
    });
  };

  const platformColor = getPlatformColor(item.sourcePlatform);

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.98);
      }}
      onPressOut={() => {
        scale.value = withSpring(1);
      }}
      style={animatedStyle}
      className="flex-row items-center py-3 px-4 bg-white/5 rounded-xl mb-2"
    >
      {/* Thumbnail */}
      <Image
        source={{ uri: item.thumbnailUrl }}
        style={{ width: 56, height: 56, borderRadius: 8 }}
        contentFit="cover"
      />

      {/* Info */}
      <View className="flex-1 ml-3">
        <Text className="text-white font-medium" numberOfLines={1}>
          {item.title}
        </Text>
        <Text className="text-white/60 text-sm" numberOfLines={1}>
          {item.creatorName}
        </Text>
        <View className="flex-row items-center mt-1">
          <PlatformIcon platform={item.sourcePlatform} />
          <Text
            className="text-xs ml-1"
            style={{ color: platformColor }}
          >
            {item.sourcePlatform === 'YOUTUBE' ? 'YouTube' : 'SoundCloud'}
          </Text>
        </View>
      </View>

      {/* Open button */}
      <View
        className="rounded-full p-2.5"
        style={{ backgroundColor: platformColor }}
      >
        <ExternalLink size={18} color="#fff" />
      </View>
    </AnimatedPressable>
  );
}
