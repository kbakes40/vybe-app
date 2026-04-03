import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft,
  Download,
  Play,
  Trash2,
  FileAudio,
  HardDrive,
  Music,
  Upload,
  MoreVertical,
} from 'lucide-react-native';
import { useDownloadsStore, formatFileSize, DownloadedTrack } from '@/stores/downloadsStore';
import { usePlaybackController } from '@/stores/playbackController';
import { MINI_PLAYER_HEIGHT } from './_layout';
import { useVybePopup } from '@/components/VybePopup';

export default function DownloadsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const downloads = useDownloadsStore(s => s.downloads);
  const removeDownload = useDownloadsStore(s => s.removeDownload);
  const getTotalStorageUsed = useDownloadsStore(s => s.getTotalStorageUsed);
  const clearAllDownloads = useDownloadsStore(s => s.clearAllDownloads);
  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);

  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

  // Check if mini player is visible
  const showMiniPlayer = !!currentTrack;

  // Calculate bottom padding: safe area + mini player height (if visible) + extra padding
  const bottomPadding = insets.bottom + (showMiniPlayer ? MINI_PLAYER_HEIGHT : 0) + 40;

  const totalStorage = getTotalStorageUsed();
  const userImported = downloads.filter(d => d.isUserImported);
  // Non-imported downloads (FreePD or other sources with direct audio URLs)
  const otherDownloads = downloads.filter(d => !d.isUserImported);

  const handlePlayTrack = (track: DownloadedTrack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(track, downloads);
  };

  const handleDeleteTrack = (track: DownloadedTrack) => {
    showVybePopup({
      title: 'Remove Download',
      message: `Are you sure you want to remove "${track.title}" from downloads? This will delete the file from your device.`,
      type: 'confirm',
      actions: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await removeDownload(track.id);
          },
        },
      ]
    });
  };

  const handleClearAll = () => {
    if (downloads.length === 0) return;

    showVybePopup({
      title: 'Clear All Downloads',
      message: 'Are you sure you want to remove all downloads? This will delete all files from your device.',
      type: 'warning',
      actions: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await clearAllDownloads();
          },
        },
      ]
    });
  };

  const renderTrackItem = (track: DownloadedTrack) => (
    <Pressable
      key={track.id}
      onPress={() => handlePlayTrack(track)}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setSelectedTrackId(selectedTrackId === track.id ? null : track.id);
      }}
      className="flex-row items-center bg-[#1A1A1A] rounded-lg p-3 mb-2"
    >
      {track.artwork ? (
        <Image
          source={{ uri: track.artwork }}
          style={{ width: 50, height: 50, borderRadius: 6 }}
          contentFit="cover"
        />
      ) : (
        <View className="w-[50px] h-[50px] bg-[#8B5CF6]/20 rounded-md items-center justify-center">
          <Music size={24} color="#8B5CF6" />
        </View>
      )}
      <View className="flex-1 ml-3">
        <Text className="text-white font-medium" numberOfLines={1}>
          {track.title}
        </Text>
        <Text className="text-white/60 text-sm" numberOfLines={1}>
          {track.artist}
        </Text>
        <View className="flex-row items-center mt-1">
          <Text className="text-white/40 text-xs">
            {formatFileSize(track.fileSize)}
          </Text>
          <Text className="text-white/30 mx-1">•</Text>
          <Text className="text-white/40 text-xs">
            {track.fileFormat}
          </Text>
          {track.isUserImported && (
            <>
              <Text className="text-white/30 mx-1">•</Text>
              <View className="bg-[#8B5CF6]/20 px-1.5 py-0.5 rounded">
                <Text className="text-[#8B5CF6] text-[10px]">Imported</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {selectedTrackId === track.id ? (
        <Pressable
          onPress={() => handleDeleteTrack(track)}
          className="w-10 h-10 items-center justify-center"
        >
          <Trash2 size={20} color="#EF4444" />
        </Pressable>
      ) : (
        <View className="w-10 h-10 items-center justify-center">
          <Play size={20} color="#8B5CF6" fill="#8B5CF6" />
        </View>
      )}
    </Pressable>
  );

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <LinearGradient
        colors={['#1a1a2e', '#0F0F0F', '#0A0A0A']}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View
          className="flex-row items-center justify-between px-4 py-3"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 items-center justify-center -ml-2"
          >
            <ChevronLeft size={28} color="#fff" />
          </Pressable>
          <View className="flex-1 items-center">
            <View className="flex-row items-center">
              <Download size={20} color="#8B5CF6" />
              <Text className="text-white text-lg font-bold ml-2">
                Downloads
              </Text>
            </View>
          </View>
          <Pressable
            onPress={handleClearAll}
            className="w-10 h-10 items-center justify-center"
            disabled={downloads.length === 0}
          >
            <MoreVertical size={20} color={downloads.length > 0 ? '#fff' : 'rgba(255,255,255,0.3)'} />
          </Pressable>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 20, paddingBottom: bottomPadding }}
        >
          {/* Storage Summary */}
          <View className="bg-[#1A1A1A] rounded-xl p-4 mb-6">
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <HardDrive size={20} color="#8B5CF6" />
                <Text className="text-white font-semibold ml-2">Storage Used</Text>
              </View>
              <Text className="text-[#8B5CF6] font-bold">
                {formatFileSize(totalStorage)}
              </Text>
            </View>
            <View className="flex-row items-center mt-3">
              <Text className="text-white/50 text-sm">
                {downloads.length} {downloads.length === 1 ? 'track' : 'tracks'} available offline
              </Text>
            </View>
          </View>

          {/* Import Button */}
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(app)/import-audio' as never);
            }}
            className="mb-6"
          >
            <LinearGradient
              colors={['#8B5CF6', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 16,
                borderRadius: 12,
              }}
            >
              <Upload size={24} color="#fff" />
              <View className="flex-1 ml-3">
                <Text className="text-white font-bold">Import Audio</Text>
                <Text className="text-white/70 text-sm">Add files from your device</Text>
              </View>
            </LinearGradient>
          </Pressable>

          {downloads.length === 0 ? (
            // Empty State
            <View className="items-center py-12">
              <View className="w-20 h-20 bg-[#1A1A1A] rounded-full items-center justify-center mb-6">
                <FileAudio size={40} color="rgba(255,255,255,0.3)" />
              </View>
              <Text className="text-white text-lg font-semibold mb-2">
                No Downloads Yet
              </Text>
              <Text className="text-white/50 text-center px-8">
                Import audio files or download royalty-free tracks to listen offline.
              </Text>
            </View>
          ) : (
            <>
              {/* User Imported Section */}
              {userImported.length > 0 && (
                <View className="mb-6">
                  <View className="flex-row items-center mb-3">
                    <FileAudio size={16} color="#8B5CF6" />
                    <Text className="text-white font-semibold ml-2">
                      User Imported
                    </Text>
                    <Text className="text-white/40 text-sm ml-2">
                      ({userImported.length})
                    </Text>
                  </View>
                  {userImported.map(renderTrackItem)}
                </View>
              )}

              {/* Downloaded Tracks Section (FreePD, etc.) */}
              {otherDownloads.length > 0 && (
                <View>
                  <View className="flex-row items-center mb-3">
                    <Download size={16} color="#4CAF50" />
                    <Text className="text-white font-semibold ml-2">
                      Downloaded Tracks
                    </Text>
                    <Text className="text-white/40 text-sm ml-2">
                      ({otherDownloads.length})
                    </Text>
                  </View>
                  {otherDownloads.map(renderTrackItem)}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </LinearGradient>
    </View>
  );
}
