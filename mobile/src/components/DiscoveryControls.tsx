import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { ThumbsDown, EyeOff, RotateCcw } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useDiscoveryAlgorithmStore } from '@/stores/discoveryAlgorithmStore';
import { useVybePopup } from '@/components/VybePopup';

interface DiscoveryControlsProps {
  trackId: string;
  artistId: string;
  artistName: string;
  onAction?: () => void;
}

export function DiscoveryControls({
  trackId,
  artistId,
  artistName,
  onAction
}: DiscoveryControlsProps) {
  const { showVybePopup } = useVybePopup();
  const dislikeTrack = useDiscoveryAlgorithmStore(s => s.dislikeTrack);
  const hideArtist = useDiscoveryAlgorithmStore(s => s.hideArtist);

  const handleDislike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dislikeTrack(trackId);
    onAction?.();
  };

  const handleHideArtist = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showVybePopup({
      title: 'Hide Artist',
      message: `Stop seeing ${artistName} in recommendations?`,
      type: 'confirm',
      actions: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          style: 'destructive',
          onPress: () => {
            hideArtist(artistId, artistName);
            onAction?.();
          }
        },
      ]
    });
  };

  return (
    <View className="flex-row items-center">
      <Pressable
        onPress={handleDislike}
        className="p-2 mr-2"
        hitSlop={8}
      >
        <ThumbsDown size={20} color="rgba(255,255,255,0.6)" />
      </Pressable>
      <Pressable
        onPress={handleHideArtist}
        className="p-2"
        hitSlop={8}
      >
        <EyeOff size={20} color="rgba(255,255,255,0.6)" />
      </Pressable>
    </View>
  );
}

// Settings component for resetting taste profile
export function DiscoverySettings() {
  const { showVybePopup } = useVybePopup();
  const resetProfile = useDiscoveryAlgorithmStore(s => s.resetProfile);
  const tasteProfile = useDiscoveryAlgorithmStore(s => s.tasteProfile);

  const handleReset = () => {
    showVybePopup({
      title: 'Reset Discovery',
      message: 'This will clear your taste profile and start fresh. Are you sure?',
      type: 'warning',
      actions: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            resetProfile();
          }
        },
      ]
    });
  };

  return (
    <View className="bg-white/5 rounded-xl p-4 mx-5">
      <Text className="text-white font-semibold text-lg mb-2">Discovery Settings</Text>

      {tasteProfile ? (
        <View className="mb-4">
          <Text className="text-white/60 text-sm mb-1">Your taste profile</Text>
          <Text className="text-white/40 text-xs">
            Tempo: {tasteProfile.preferredTempoMin}-{tasteProfile.preferredTempoMax} BPM
          </Text>
          <Text className="text-white/40 text-xs">
            Energy: {Math.round(tasteProfile.preferredEnergy * 100)}%
          </Text>
          <Text className="text-white/40 text-xs">
            Top moods: {Object.entries(tasteProfile.moodWeights)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([mood]) => mood.replace('_', ' '))
              .join(', ') || 'None yet'}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={handleReset}
        className="flex-row items-center justify-center bg-red-500/20 rounded-lg py-3"
      >
        <RotateCcw size={18} color="#EF4444" />
        <Text className="text-red-400 font-medium ml-2">Reset Taste Profile</Text>
      </Pressable>
    </View>
  );
}
