import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { ChevronRight, Music, RefreshCw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Track } from '@/types/music';
import { FreePDTrackCard } from './FreePDTrackCard';
import { cn } from '@/lib/cn';

interface FreePDSectionProps {
  tracks: Track[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSeeAll?: () => void;
  onDownload?: (track: Track) => void;
  className?: string;
}

/**
 * FreePD section for home screen - horizontal carousel of royalty-free tracks
 * Features: section header, subtitle, horizontal scroll, loading/error states
 */
export function FreePDSection({
  tracks,
  isLoading = false,
  error = null,
  onRetry,
  onSeeAll,
  onDownload,
  className,
}: FreePDSectionProps) {
  const handleSeeAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSeeAll?.();
  };

  const handleRetry = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRetry?.();
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <View className={cn('mt-8', className)}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 mb-2">
          <View className="flex-row items-center">
            <View className="w-5 h-5 bg-[#4CAF50]/30 rounded" />
            <View className="ml-2 w-28 h-6 bg-white/10 rounded" />
          </View>
        </View>
        {/* Subtitle skeleton */}
        <View className="px-5 mb-4">
          <View className="w-48 h-4 bg-white/10 rounded" />
        </View>
        {/* Track skeletons */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20 }}
          style={{ flexGrow: 0 }}
        >
          {[1, 2, 3, 4].map(i => (
            <View key={i} className="mr-4">
              <View
                className="bg-white/10 rounded-xl"
                style={{ width: 160, height: 160 }}
              />
              <View className="mt-2 w-32 h-4 bg-white/10 rounded" />
              <View className="mt-1 w-24 h-3 bg-white/10 rounded" />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View className={cn('mt-8', className)}>
        {/* Header */}
        <View className="flex-row items-center px-5 mb-2">
          <Music size={20} color="#4CAF50" />
          <Text className="text-white text-xl font-bold ml-2">Royalty Free</Text>
        </View>
        {/* Error message */}
        <View className="mx-5 bg-white/5 rounded-xl p-6 items-center">
          <Text className="text-white/60 text-sm text-center mb-4">
            {error}
          </Text>
          {onRetry ? (
            <Pressable
              onPress={handleRetry}
              className="flex-row items-center bg-[#4CAF50] px-4 py-2 rounded-full"
            >
              <RefreshCw size={16} color="#fff" />
              <Text className="text-white font-medium ml-2">Try Again</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  // Empty state
  if (tracks.length === 0) {
    return null;
  }

  return (
    <View className={cn('mt-8', className)}>
      {/* Section header */}
      <View className="flex-row items-center justify-between px-5 mb-2">
        <View className="flex-row items-center">
          <Music size={20} color="#4CAF50" />
          <Text className="text-white text-xl font-bold ml-2">Royalty Free</Text>
        </View>
        {onSeeAll ? (
          <Pressable onPress={handleSeeAll} className="flex-row items-center">
            <Text className="text-white/60 text-sm mr-1">See all</Text>
            <ChevronRight size={16} color="rgba(255,255,255,0.6)" />
          </Pressable>
        ) : null}
      </View>

      {/* Subtitle */}
      <Text className="text-white/50 text-sm px-5 mb-4">
        Clean audio you can download
      </Text>

      {/* Horizontal carousel */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
        style={{ flexGrow: 0 }}
      >
        {tracks.map(track => (
          <FreePDTrackCard
            key={track.id}
            track={track}
            queue={tracks}
            onDownload={onDownload}
          />
        ))}
      </ScrollView>
    </View>
  );
}
