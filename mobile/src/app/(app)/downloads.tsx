import React, { useRef } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal, StyleSheet, type TextStyle } from 'react-native';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { SharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Download, Trash2, FileAudio, HardDrive, Music, Share2, Cloud, Settings } from 'lucide-react-native';
import { useDownloadsStore, formatFileSize, DownloadedTrack } from '@/stores/downloadsStore';
import { useStorageSettingsStore } from '@/stores/storageSettingsStore';
import { usePlaybackController } from '@/stores/playbackController';
import { useVybePopup } from '@/components/VybePopup';
import { VaultImportCard } from '@/components/VaultImportCard';
import { stackScreenContentContainerPaddingBottom } from '@/constants/Layout';
import { VIBRANT_BLUE, GRAPHITE_GREY } from '@/constants/machinedTheme';

const VAULT_ROW_TITLE: TextStyle = {
  color: VIBRANT_BLUE,
  fontWeight: '600',
  fontSize: 14,
  textShadowColor: 'rgba(0,229,255,0.5)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 8,
};

// ─── TrackRow ────────────────────────────────────────────────────────────────

interface TrackRowProps {
  track: DownloadedTrack;
  isActive: boolean;
  onPlay: (track: DownloadedTrack) => void;
  onDelete: (track: DownloadedTrack) => void;
  onShare: (track: DownloadedTrack) => void;
}

function DeleteAction({
  progress,
  onPress,
}: {
  progress: SharedValue<number>;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0.8, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(progress.value, [0, 1], [16, 0], Extrapolation.CLAMP) }],
  }));

  return (
    <Animated.View style={[style, { width: 80, justifyContent: 'center', alignItems: 'center' }]}>
      <Pressable
        onPress={onPress}
        style={{
          width: 68,
          height: '100%',
          backgroundColor: '#EF4444',
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Trash2 size={22} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 3 }}>Delete</Text>
      </Pressable>
    </Animated.View>
  );
}

function TrackRow({ track, isActive, onPlay, onDelete, onShare }: TrackRowProps) {
  const swipeRef = useRef<SwipeableMethods>(null);

  const handleDelete = () => {
    swipeRef.current?.close();
    onDelete(track);
  };

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={60}
      renderRightActions={(progress) => (
        <DeleteAction progress={progress} onPress={handleDelete} />
      )}
      onSwipeableWillOpen={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
      containerStyle={{ marginBottom: 8 }}
    >
      <Pressable
        onPress={() => onPlay(track)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: isActive ? 'rgba(0,229,255,0.08)' : '#000000',
          borderRadius: 10,
          padding: 12,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isActive ? 'rgba(0,229,255,0.35)' : 'rgba(255,255,255,0.06)',
        }}
      >
        {track.artwork ? (
          <Image
            source={{ uri: track.artwork }}
            style={{ width: 50, height: 50, borderRadius: 6 }}
            contentFit="cover"
          />
        ) : (
          <View style={{ width: 50, height: 50, backgroundColor: 'rgba(0,229,255,0.12)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Music size={24} color={VIBRANT_BLUE} />
          </View>
        )}

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={VAULT_ROW_TITLE} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={{ color: GRAPHITE_GREY, fontSize: 13, marginTop: 1 }} numberOfLines={1}>
            {track.artist}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ color: GRAPHITE_GREY, fontSize: 11 }}>
              {formatFileSize(track.fileSize)}
            </Text>
            <Text style={{ color: GRAPHITE_GREY, marginHorizontal: 4 }}>•</Text>
            <Text style={{ color: GRAPHITE_GREY, fontSize: 11 }}>
              {track.fileFormat}
            </Text>
            {track.isUserImported && (
              <>
                <Text style={{ color: GRAPHITE_GREY, marginHorizontal: 4 }}>•</Text>
                <View style={{ backgroundColor: 'rgba(0,229,255,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(0,229,255,0.35)' }}>
                  <Text style={{ color: VIBRANT_BLUE, fontSize: 10, fontWeight: '700' }}>Imported</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Share button — blocks swipe/play propagation */}
        <View onStartShouldSetResponder={() => true}>
          <Pressable
            onPress={() => onShare(track)}
            hitSlop={8}
            style={{ padding: 8 }}
          >
            <Share2 size={16} color="rgba(255,255,255,0.45)" />
          </Pressable>
        </View>

        <Trash2 size={15} color="rgba(239,68,68,0.35)" style={{ marginLeft: 4 }} />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

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

  const preferICloud = useStorageSettingsStore(s => s.preferICloud);

  const [exportingAll, setExportingAll] = React.useState(false);
  const [exportDone, setExportDone] = React.useState(0);
  const [exportTotal, setExportTotal] = React.useState(0);
  const [exportPhase, setExportPhase] = React.useState<'idle' | 'copying' | 'sharing'>('idle');
  const [folderModalVisible, setFolderModalVisible] = React.useState(false);

  const bottomPadding = stackScreenContentContainerPaddingBottom(insets.bottom);
  const totalStorage = getTotalStorageUsed();
  const userImported = downloads.filter(d => d.isUserImported);
  const otherDownloads = downloads.filter(d => !d.isUserImported);

  const handlePlayTrack = async (track: DownloadedTrack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (track.localFilePath) {
      const info = await FileSystem.getInfoAsync(track.localFilePath);
      if (!info.exists) {
        showVybePopup({
          title: 'File Not Found',
          message: 'This download is missing from your device. Remove it and download again.',
          type: 'warning',
          actions: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Remove', style: 'destructive', onPress: () => removeDownload(track.id) },
          ],
        });
        return;
      }
    }
    playTrack(track, downloads);
  };

  const handleDeleteTrack = (track: DownloadedTrack) => {
    showVybePopup({
      title: 'Remove Download',
      message: `Remove "${track.title}" from downloads? This will delete the file from your device.`,
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
      ],
    });
  };

  const handleShareTrack = async (track: DownloadedTrack) => {
    if (!track.localFilePath) return;
    const info = await FileSystem.getInfoAsync(track.localFilePath);
    if (!info.exists) {
      showVybePopup({ title: 'File Not Found', message: 'Cannot share — file is missing from device.', type: 'warning' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Sharing.shareAsync(track.localFilePath, {
        mimeType: track.fileFormat === 'MP3' ? 'audio/mpeg' : 'audio/mp4',
        dialogTitle: `Share ${track.title}`,
        UTI: track.fileFormat === 'MP3' ? 'public.mp3' : 'public.mpeg-4-audio',
      });
    } catch (e) {
      console.error('[Share]', e);
    }
  };

  const handleExportAll = () => {
    const exportable = downloads.filter(d => !!d.localFilePath);
    if (exportable.length === 0) return;
    setFolderModalVisible(true);
  };

  // Build a clean filename: "Artist - Title.ext"
  const buildExportName = (track: DownloadedTrack): string => {
    const ext = track.fileFormat?.toLowerCase() === 'mp3' ? 'mp3' : 'm4a';
    const artist = (track.artist || 'Unknown Artist').replace(/[/\\:*?"<>|]/g, '_').trim();
    const title = (track.title || 'Unknown Title').replace(/[/\\:*?"<>|]/g, '_').trim();
    return `${artist} - ${title}.${ext}`;
  };

  const startExport = async () => {
    const exportable = downloads.filter(d => !!d.localFilePath);
    setFolderModalVisible(false);
    setExportingAll(true);
    setExportDone(0);
    setExportTotal(exportable.length);
    setExportPhase('copying');

    // Step 1: copy all files with proper Artist - Title.ext names into a temp folder
    const exportDir = (FileSystem.cacheDirectory ?? '') + 'vybe-export/';
    try {
      await FileSystem.deleteAsync(exportDir, { idempotent: true });
      await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });
    } catch {}

    const copied: string[] = [];
    for (const track of exportable) {
      try {
        const info = await FileSystem.getInfoAsync(track.localFilePath);
        if (info.exists) {
          const destPath = exportDir + buildExportName(track);
          await FileSystem.copyAsync({ from: track.localFilePath, to: destPath });
          copied.push(destPath);
        }
      } catch {}
      setExportDone(n => n + 1);
    }

    if (copied.length === 0) {
      setExportingAll(false);
      setExportPhase('idle');
      return;
    }

    // Step 2: share — try the whole folder first (one share sheet, user picks iCloud once)
    setExportPhase('sharing');
    try {
      await Sharing.shareAsync(exportDir, {
        dialogTitle: 'Export Vault to iCloud Drive',
        UTI: 'public.folder',
      });
    } catch {
      // Fallback: share each renamed file individually
      for (const filePath of copied) {
        try {
          const isMP3 = filePath.endsWith('.mp3');
          await Sharing.shareAsync(filePath, {
            mimeType: isMP3 ? 'audio/mpeg' : 'audio/mp4',
            UTI: isMP3 ? 'public.mp3' : 'public.mpeg-4-audio',
            dialogTitle: 'Export Vault to iCloud Drive',
          });
        } catch {}
      }
    }

    setExportingAll(false);
    setExportPhase('idle');
  };

  const handleClearAll = () => {
    if (downloads.length === 0) return;
    showVybePopup({
      title: 'Purge Vault',
      message: 'Remove all Vault assets? Files are deleted from this device.',
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
      ],
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000000' }}>
        {/* Header — Vault command center */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12 }}>
          <Pressable onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(app)/(tabs)' as never); }} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={28} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: 'rgba(34,211,238,0.9)', fontSize: 10, fontWeight: '800', letterSpacing: 2 }}>VYBE+</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Download size={18} color={VIBRANT_BLUE} />
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900', marginLeft: 8, letterSpacing: -0.3 }}>VAULT</Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: bottomPadding }}>
          {/* Storage Summary — machined panel */}
          <View style={{
            backgroundColor: 'rgba(10,10,12,0.96)',
            borderRadius: 14,
            padding: 16,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: 'rgba(0,229,255,0.35)',
            shadowColor: VIBRANT_BLUE,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.2,
            shadowRadius: 12,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <HardDrive size={20} color={VIBRANT_BLUE} />
                <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>Storage Used</Text>
              </View>
              <Text style={{ color: VIBRANT_BLUE, fontWeight: '700' }}>{formatFileSize(totalStorage)}</Text>
            </View>
            {/* Storage location row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {preferICloud
                  ? <Cloud size={14} color="#0A84FF" />
                  : <HardDrive size={14} color="rgba(255,255,255,0.4)" />}
                <Text style={{ color: preferICloud ? '#0A84FF' : 'rgba(255,255,255,0.4)', fontSize: 12, marginLeft: 6 }}>
                  {preferICloud ? 'iCloud Drive' : 'This iPhone'}
                </Text>
              </View>
              <Pressable
                onPress={() => router.push('/(app)/settings' as never)}
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center' }}
              >
                <Settings size={13} color="rgba(255,255,255,0.3)" />
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginLeft: 4 }}>Storage Settings</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <Text style={{ color: GRAPHITE_GREY, fontSize: 13 }}>
                {downloads.length} {downloads.length === 1 ? 'asset' : 'assets'} secured in Vault
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {downloads.length > 0 && (
                  exportingAll ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator size="small" color="#0A84FF" />
                      <Text style={{ color: '#0A84FF', fontSize: 12, fontWeight: '600' }}>
                        {exportPhase === 'copying' ? `Preparing ${exportDone}/${exportTotal}` : 'Opening Files…'}
                      </Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={handleExportAll}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,229,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,229,255,0.25)' }}
                    >
                      <Share2 size={13} color={VIBRANT_BLUE} />
                      <Text style={{ color: VIBRANT_BLUE, fontSize: 12, fontWeight: '700', marginLeft: 5 }}>Export All</Text>
                    </Pressable>
                  )
                )}
                {downloads.length > 0 && (
                  <Pressable
                    onPress={handleClearAll}
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.12)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                  >
                    <Trash2 size={13} color="#EF4444" />
                    <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700', marginLeft: 5 }}>Clear All</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>

          <VaultImportCard
            spacious
            subtitle="Ingest from iCloud Drive or on-device storage"
            onPress={() => {
              router.push('/(app)/import-audio' as never);
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          />

          {downloads.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 48 }}>
              <View style={{ width: 80, height: 80, backgroundColor: 'rgba(0,229,255,0.1)', borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <FileAudio size={40} color={VIBRANT_BLUE} />
              </View>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Vault clear</Text>
              <Text style={{ color: GRAPHITE_GREY, textAlign: 'center', paddingHorizontal: 32 }}>
                Import to Vault or pull tracks from Vybe — assets stay local, zero cloud lock-in.
              </Text>
            </View>
          ) : (
            <>
              {userImported.length > 0 && (
                <View style={{ marginBottom: 24 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <FileAudio size={15} color={VIBRANT_BLUE} />
                    <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 6 }}>Imported</Text>
                    <Text style={{ color: GRAPHITE_GREY, fontSize: 13, marginLeft: 6 }}>({userImported.length})</Text>
                  </View>
                  {userImported.map(track => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      isActive={currentTrack?.id === track.id}
                      onPlay={handlePlayTrack}
                      onDelete={handleDeleteTrack}
                      onShare={handleShareTrack}
                    />
                  ))}
                </View>
              )}

              {otherDownloads.length > 0 && (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <Download size={15} color={VIBRANT_BLUE} />
                    <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 6 }}>Downloaded</Text>
                    <Text style={{ color: GRAPHITE_GREY, fontSize: 13, marginLeft: 6 }}>({otherDownloads.length})</Text>
                  </View>
                  {otherDownloads.map(track => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      isActive={currentTrack?.id === track.id}
                      onPlay={handlePlayTrack}
                      onDelete={handleDeleteTrack}
                      onShare={handleShareTrack}
                    />
                  ))}
                </View>
              )}

              <Text style={{ color: GRAPHITE_GREY, fontSize: 12, textAlign: 'center', marginTop: 24 }}>
                Swipe left on a track to delete it
              </Text>
            </>
          )}
        </ScrollView>

        {/* Export Preview Modal */}
        <Modal
          visible={folderModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setFolderModalVisible(false)}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <View style={{ backgroundColor: '#1C1C1E', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', overflow: 'hidden' }}>
              {/* Handle */}
              <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
              </View>

              {/* Header */}
              <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Cloud size={22} color="#0A84FF" />
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', marginLeft: 10 }}>
                    Vault → iCloud Drive
                  </Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                  {downloads.filter(d => !!d.localFilePath).length} songs — tap "Export to Files" then choose your iCloud folder
                </Text>
              </View>

              {/* Track list preview */}
              <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingVertical: 8 }}>
                {downloads.filter(d => !!d.localFilePath).map((track, i) => (
                  <View key={track.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, width: 24 }}>{i + 1}</Text>
                    <View style={{ flex: 1, marginLeft: 4 }}>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }} numberOfLines={1}>
                        {buildExportName(track)}
                      </Text>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 1 }}>
                        {track.fileFormat ?? 'Audio'} · {formatFileSize(track.fileSize)}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              {/* Actions */}
              <View style={{ padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
                <Pressable
                  onPress={startExport}
                  style={{ backgroundColor: '#0A84FF', borderRadius: 14, paddingVertical: 16, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Export to Files →</Text>
                </Pressable>
                <Pressable
                  onPress={() => setFolderModalVisible(false)}
                  style={{ paddingVertical: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>Cancel</Text>
                </Pressable>
              </View>

              <View style={{ height: insets.bottom }} />
            </View>
          </View>
        </Modal>
    </View>
  );
}
