import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { VybeTextInput } from '@/components/VybeTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import {
  ChevronLeft,
  FileAudio,
  Upload,
  CheckCircle,
  Info,
  HardDrive,
  Music,
  Edit3,
  Disc,
  Clock,
  Folder,
} from 'lucide-react-native';
import {
  useDownloadsStore,
  formatFileSize,
  getAudioFormat,
  isLosslessFormat,
  DownloadedTrack,
} from '@/stores/downloadsStore';
import { usePlaybackController } from '@/stores/playbackController';
import { useRecentsStore } from '@/stores/recentsStore';
import { MINI_PLAYER_HEIGHT } from './_layout';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect, Path, Text as SvgText } from 'react-native-svg';
import { useVybePopup } from '@/components/VybePopup';

const SUPPORTED_FORMATS = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'];

// Storage directory for imported files
const IMPORTS_DIR = `${FileSystem.documentDirectory}Library/VYBE/Imported/`;

interface SelectedFile {
  uri: string;
  name: string;
  size: number;
  format: string;
  formatLabel: string;
  isLossless: boolean;
  mimeType?: string;
}

interface ImportedFileHash {
  hash: string;
  timestamp: number;
}

// Generate a hash from file path and modified time for duplicate detection
async function generateFileHash(uri: string, size: number): Promise<string> {
  const hashInput = `${uri}:${size}:${Date.now()}`;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    hashInput
  );
  return hash.substring(0, 16); // Short hash
}

// Clean filename: remove extension and bracketed suffixes like "[Stereo mix (WAV)]"
function cleanFilename(filename: string): string {
  // Remove extension
  let name = filename.replace(/\.[^/.]+$/, '');
  // Remove bracketed suffixes like [Stereo mix (WAV)], (Remastered), etc.
  name = name.replace(/\s*[\[\(][^\]\)]*[\]\)]\s*$/g, '');
  // Remove trailing dashes and spaces
  name = name.replace(/\s*-\s*$/, '').trim();
  return name;
}

// Parse artist and title from filename
function parseFilename(filename: string): { title: string; artist: string } {
  const cleaned = cleanFilename(filename);

  // Common patterns: "Artist - Title", "Title"
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(' - ').trim(),
      };
    }
  }

  return {
    title: cleaned,
    artist: '', // Will use placeholder
  };
}

// Generate placeholder artwork SVG as data URI
function generatePlaceholderArtwork(title: string, artist: string): string {
  // Generate consistent colors based on title
  const hash = title.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = hash % 360;
  const color1 = `hsl(${hue}, 60%, 20%)`;
  const color2 = `hsl(${(hue + 40) % 360}, 70%, 30%)`;

  // Create a simple waveform path
  const waveformPath = 'M0,50 Q25,30 50,50 T100,50 T150,50 T200,50';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${color1}"/>
          <stop offset="100%" style="stop-color:${color2}"/>
        </linearGradient>
        <linearGradient id="glow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:rgba(255,255,255,0.1)"/>
          <stop offset="100%" style="stop-color:rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="url(#bg)"/>
      <rect width="400" height="200" fill="url(#glow)"/>
      <g transform="translate(100, 180)" stroke="rgba(255,255,255,0.3)" stroke-width="2" fill="none">
        <path d="${waveformPath}"/>
      </g>
      <rect x="150" y="320" width="100" height="24" rx="4" fill="rgba(139,92,246,0.3)"/>
      <text x="200" y="338" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="12" font-family="system-ui">Imported</text>
    </svg>
  `;

  // Return as data URI
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export default function ImportAudioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const addDownload = useDownloadsStore(s => s.addDownload);
  const downloads = useDownloadsStore(s => s.downloads);
  const isImporting = useDownloadsStore(s => s.isImporting);
  const setImporting = useDownloadsStore(s => s.setImporting);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playTrack = usePlaybackController(s => s.playTrack);
  const addToRecents = useRecentsStore(s => s.addToRecents);

  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [trackTitle, setTrackTitle] = useState('');
  const [trackArtist, setTrackArtist] = useState('');
  const [trackAlbum, setTrackAlbum] = useState('Imported');
  const [isImported, setIsImported] = useState(false);
  const [importedTrack, setImportedTrack] = useState<DownloadedTrack | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Refs for preventing double-tap
  const importInProgressRef = useRef(false);
  const lastImportHashRef = useRef<string | null>(null);

  // Check if mini player is visible
  const showMiniPlayer = !!currentTrack;

  // Calculate bottom padding: safe area + mini player height (if visible) + extra padding for button
  const bottomPadding = insets.bottom + (showMiniPlayer ? MINI_PLAYER_HEIGHT : 0) + 100;

  const handleSelectFile = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const file = result.assets[0];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (!SUPPORTED_FORMATS.includes(ext)) {
        showVybePopup({
          title: 'Unsupported Format',
          message: `The file format "${ext}" is not supported. Please select an audio file in one of these formats: ${SUPPORTED_FORMATS.join(', ')}`,
          type: 'warning',
        });
        return;
      }

      const formatLabel = getAudioFormat(file.name);
      const isLossless = isLosslessFormat(ext);

      setSelectedFile({
        uri: file.uri,
        name: file.name,
        size: file.size || 0,
        format: ext,
        formatLabel,
        isLossless,
        mimeType: file.mimeType,
      });

      // Parse title and artist from filename
      const { title, artist } = parseFilename(file.name);
      setTrackTitle(title);
      setTrackArtist(artist);
      setTrackAlbum('Imported');
      setImportError(null);
      setIsImported(false);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('File picker error:', error);
      showVybePopup({
        title: 'Error',
        message: 'Could not select file. Please try again.',
        type: 'error',
      });
    }
  };

  const handleImport = async () => {
    if (!selectedFile || importInProgressRef.current) return;

    // Generate hash for duplicate detection
    const fileHash = await generateFileHash(selectedFile.uri, selectedFile.size);

    // Check if this exact import is in progress or was just completed
    if (lastImportHashRef.current === fileHash) {
      console.log('[Import] Duplicate import detected, skipping');
      return;
    }

    importInProgressRef.current = true;
    lastImportHashRef.current = fileHash;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setImporting(true);
    setImportError(null);

    try {
      // Create imports directory if it doesn't exist
      const dirInfo = await FileSystem.getInfoAsync(IMPORTS_DIR);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(IMPORTS_DIR, { intermediates: true });
      }

      // Generate unique filename using hash
      const timestamp = Date.now();
      const safeFilename = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const newFilename = `${fileHash}_${safeFilename}`;
      const newPath = `${IMPORTS_DIR}${newFilename}`;

      // Check if file with this hash already exists (duplicate detection)
      const existingTrack = downloads.find(d =>
        d.localFilePath?.includes(fileHash) || d.id === `imported-${fileHash}`
      );

      if (existingTrack) {
        setImporting(false);
        importInProgressRef.current = false;
        showVybePopup({
          title: 'Already Imported',
          message: 'This file has already been imported to VYBE.',
          type: 'info',
          actions: [{ text: 'OK', onPress: () => router.back() }]
        });
        return;
      }

      // Copy file to app's documents directory (preserves original quality)
      await FileSystem.copyAsync({
        from: selectedFile.uri,
        to: newPath,
      });

      // Verify file was copied successfully
      const copiedFileInfo = await FileSystem.getInfoAsync(newPath);
      if (!copiedFileInfo.exists) {
        throw new Error('File copy failed');
      }

      // Generate placeholder artwork
      const finalTitle = trackTitle || 'Untitled';
      const finalArtist = trackArtist || 'Unknown Artist';
      const artwork = generatePlaceholderArtwork(finalTitle, finalArtist);

      // Create track record
      const track: DownloadedTrack = {
        id: `imported-${fileHash}`,
        title: finalTitle,
        artist: finalArtist,
        artistId: 'user-imported',
        album: trackAlbum || 'Imported',
        albumId: 'user-imports',
        artwork: artwork,
        duration: 0, // Would need audio metadata parsing for accurate duration
        isLiked: false,
        source: 'vybe',
        isDownloaded: true,
        localFilePath: newPath,
        importedAt: timestamp,
        isUserImported: true,
        fileSize: selectedFile.size,
        fileFormat: selectedFile.formatLabel,
        audioUrl: newPath,
        // Additional metadata
        tags: ['imported'],
        genreTags: ['Imported'],
      };

      // Add to downloads store
      addDownload(track);

      // Add to recents
      addToRecents(track);

      setImportedTrack(track);
      setIsImported(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    } catch (error) {
      console.error('Import error:', error);
      setImportError('Could not import the audio file. Please try again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setImporting(false);
      importInProgressRef.current = false;
    }
  };

  const handlePlayImported = useCallback(() => {
    if (importedTrack) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playTrack(importedTrack);
    }
  }, [importedTrack, playTrack]);

  const handleViewInLibrary = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace('/(app)/downloads' as never);
  }, [router]);

  const handleClearSelection = () => {
    setSelectedFile(null);
    setTrackTitle('');
    setTrackArtist('');
    setTrackAlbum('Imported');
    setImportError(null);
    lastImportHashRef.current = null;
  };

  const handleRetryPlayback = useCallback(() => {
    setImportError(null);
    if (importedTrack) {
      handlePlayImported();
    }
  }, [importedTrack, handlePlayImported]);

  // Error modal for playback issues
  const renderPlaybackErrorModal = () => {
    if (!importError) return null;

    return (
      <View className="absolute inset-0 bg-black/80 items-center justify-center z-50" style={{ paddingTop: insets.top }}>
        <View className="bg-[#1A1A1A] rounded-2xl p-6 mx-6 max-w-sm">
          <Text className="text-white text-xl font-bold text-center mb-2">
            Playback Issue
          </Text>
          <Text className="text-white/60 text-center mb-6">
            This file could not be played. Try a different format or re-import.
          </Text>
          <View className="space-y-3">
            <Pressable
              onPress={handleRetryPlayback}
              className="bg-[#8B5CF6] rounded-xl py-3 items-center"
            >
              <Text className="text-white font-semibold">Retry</Text>
            </Pressable>
            <Pressable
              onPress={handleClearSelection}
              className="bg-white/10 rounded-xl py-3 items-center mt-3"
            >
              <Text className="text-white font-semibold">Pick Another File</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <LinearGradient
          colors={['#1a1a2e', '#0F0F0F', '#0A0A0A']}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View
            className="flex-row items-center px-4 py-3"
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
                <FileAudio size={20} color="#8B5CF6" />
                <Text className="text-white text-lg font-bold ml-2">
                  Import Audio
                </Text>
              </View>
            </View>
            <View className="w-10" />
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{
              padding: 20,
              paddingBottom: bottomPadding,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {isImported && importedTrack ? (
              // Success State
              <View className="items-center py-8">
                <View className="w-24 h-24 bg-[#1DB954]/20 rounded-full items-center justify-center mb-6">
                  <CheckCircle size={56} color="#1DB954" />
                </View>
                <Text className="text-white text-2xl font-bold mb-2">
                  Imported to VYBE
                </Text>
                <Text className="text-white/60 text-center mb-8">
                  "{importedTrack.title}" is now in your library.
                </Text>

                {/* Track Preview */}
                <View className="bg-[#1A1A1A] rounded-xl p-4 w-full mb-6">
                  <View className="flex-row items-center">
                    <View className="w-16 h-16 bg-[#8B5CF6]/20 rounded-lg items-center justify-center">
                      <Music size={32} color="#8B5CF6" />
                    </View>
                    <View className="flex-1 ml-4">
                      <Text className="text-white font-semibold" numberOfLines={1}>
                        {importedTrack.title}
                      </Text>
                      <Text className="text-white/60 text-sm" numberOfLines={1}>
                        {importedTrack.artist}
                      </Text>
                      <Text className="text-white/40 text-xs mt-1">
                        {importedTrack.fileFormat} • {formatFileSize(importedTrack.fileSize)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Action Buttons */}
                <Pressable
                  onPress={handlePlayImported}
                  className="w-full rounded-xl overflow-hidden mb-3"
                >
                  <LinearGradient
                    colors={['#8B5CF6', '#7C3AED']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      paddingVertical: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                    }}
                  >
                    <Music size={20} color="#fff" />
                    <Text className="text-white font-bold text-base ml-2">
                      Play Now
                    </Text>
                  </LinearGradient>
                </Pressable>

                <Pressable
                  onPress={handleViewInLibrary}
                  className="w-full bg-white/10 rounded-xl py-4 items-center mb-3"
                >
                  <Text className="text-white font-semibold">View in Library</Text>
                </Pressable>

                <Pressable
                  onPress={handleClearSelection}
                  className="py-4 items-center"
                >
                  <Text className="text-[#8B5CF6] font-medium">
                    Import Another File
                  </Text>
                </Pressable>
              </View>
            ) : !selectedFile ? (
              // File Selection State
              <>
                <View className="bg-[#1A1A1A] rounded-xl p-6 mb-6">
                  <Text className="text-white font-semibold text-lg mb-2">
                    Import Your Audio Files
                  </Text>
                  <Text className="text-white/60 text-sm mb-6">
                    Import audio files from your device to play offline in VYBE.
                    Original quality is preserved — no transcoding.
                  </Text>

                  <Pressable
                    onPress={handleSelectFile}
                    className="border-2 border-dashed border-[#8B5CF6]/50 rounded-xl py-8 items-center"
                  >
                    <Upload size={40} color="#8B5CF6" />
                    <Text className="text-white font-semibold mt-4">
                      Select Audio File
                    </Text>
                    <Text className="text-white/50 text-sm mt-1">
                      Tap to browse files
                    </Text>
                  </Pressable>
                </View>

                {/* Supported Formats */}
                <View className="bg-[#1A1A1A]/50 rounded-xl p-4 mb-6">
                  <View className="flex-row items-center mb-3">
                    <Info size={16} color="rgba(255,255,255,0.5)" />
                    <Text className="text-white/50 text-sm font-medium ml-2">
                      Supported Formats
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap">
                    {SUPPORTED_FORMATS.map(format => (
                      <View
                        key={format}
                        className="bg-[#8B5CF6]/20 px-3 py-1 rounded-full mr-2 mb-2"
                      >
                        <Text className="text-[#8B5CF6] text-sm font-medium">
                          {format.toUpperCase()}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                {/* Info Note */}
                <View className="bg-[#1A1A1A]/50 rounded-xl p-4">
                  <View className="flex-row items-start">
                    <HardDrive size={18} color="rgba(255,255,255,0.5)" />
                    <View className="flex-1 ml-3">
                      <Text className="text-white/70 text-sm font-medium mb-1">
                        Storage Info
                      </Text>
                      <Text className="text-white/40 text-xs leading-4">
                        Imported files are stored on your device. Lossless formats
                        (FLAC, WAV) are preserved without transcoding.
                      </Text>
                    </View>
                  </View>
                </View>
              </>
            ) : (
              // File Preview State
              <>
                <View className="bg-[#1A1A1A] rounded-xl overflow-hidden mb-6">
                  {/* File Preview */}
                  <View className="p-4 border-b border-white/10">
                    <View className="flex-row items-center">
                      <View className="w-16 h-16 bg-[#8B5CF6]/20 rounded-lg items-center justify-center">
                        <Music size={32} color="#8B5CF6" />
                      </View>
                      <View className="flex-1 ml-4">
                        <Text className="text-white font-semibold" numberOfLines={1}>
                          {selectedFile.name}
                        </Text>
                        <View className="flex-row items-center mt-1 flex-wrap">
                          <View className="flex-row items-center">
                            <Folder size={12} color="rgba(255,255,255,0.4)" />
                            <Text className="text-white/60 text-sm ml-1">
                              {formatFileSize(selectedFile.size)}
                            </Text>
                          </View>
                          <Text className="text-white/30 mx-2">•</Text>
                          <View className="flex-row items-center">
                            <Disc size={12} color="rgba(255,255,255,0.4)" />
                            <Text className="text-white/60 text-sm ml-1">
                              {selectedFile.formatLabel}
                            </Text>
                          </View>
                        </View>
                        {selectedFile.isLossless && (
                          <View className="flex-row items-center mt-2">
                            <View className="bg-[#1DB954]/20 px-2 py-0.5 rounded">
                              <Text className="text-[#1DB954] text-xs font-medium">
                                Lossless Quality
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Track Info Form */}
                  <View className="p-4">
                    <View className="mb-4">
                      <View className="flex-row items-center mb-2">
                        <Text className="text-white/60 text-sm">Track Title</Text>
                        <Edit3 size={12} color="rgba(255,255,255,0.4)" className="ml-2" />
                      </View>
                      <VybeTextInput
                        value={trackTitle}
                        onChangeText={setTrackTitle}
                        placeholder="Enter title"
                        style={{ backgroundColor: '#0A0A0A', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 }}
                      />
                    </View>

                    <View className="mb-4">
                      <View className="flex-row items-center mb-2">
                        <Text className="text-white/60 text-sm">Artist</Text>
                        <Edit3 size={12} color="rgba(255,255,255,0.4)" className="ml-2" />
                      </View>
                      <VybeTextInput
                        value={trackArtist}
                        onChangeText={setTrackArtist}
                        placeholder="Unknown Artist"
                        style={{ backgroundColor: '#0A0A0A', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 }}
                      />
                      {!trackArtist && (
                        <Text className="text-white/40 text-xs mt-1">
                          You can edit this now
                        </Text>
                      )}
                    </View>

                    <View>
                      <View className="flex-row items-center mb-2">
                        <Text className="text-white/60 text-sm">Album</Text>
                        <Text className="text-white/30 text-xs ml-2">(optional)</Text>
                      </View>
                      <VybeTextInput
                        value={trackAlbum}
                        onChangeText={setTrackAlbum}
                        placeholder="Imported"
                        style={{ backgroundColor: '#0A0A0A', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 }}
                      />
                    </View>
                  </View>
                </View>

                {/* Quality Notice */}
                <View className="bg-[#1A1A1A]/50 rounded-xl p-4 mb-6">
                  <View className="flex-row items-start">
                    <Info size={16} color="rgba(255,255,255,0.5)" />
                    <Text className="text-white/50 text-xs ml-2 flex-1 leading-4">
                      Stored at original quality. No transcoding.
                      {selectedFile.isLossless && ' Your lossless audio is preserved.'}
                    </Text>
                  </View>
                </View>

                {/* Import Error */}
                {importError && (
                  <View className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6">
                    <Text className="text-red-400 text-sm text-center">
                      {importError}
                    </Text>
                  </View>
                )}

                {/* Actions - Fixed at bottom with proper spacing */}
                <View>
                  <Pressable
                    onPress={handleImport}
                    disabled={isImporting}
                    className="rounded-xl overflow-hidden mb-3"
                    style={{ opacity: isImporting ? 0.6 : 1 }}
                  >
                    <LinearGradient
                      colors={['#8B5CF6', '#7C3AED']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        paddingVertical: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                      }}
                    >
                      {isImporting ? (
                        <>
                          <ActivityIndicator color="#fff" size="small" />
                          <Text className="text-white font-bold text-base ml-2">
                            Importing...
                          </Text>
                        </>
                      ) : (
                        <>
                          <Upload size={20} color="#fff" />
                          <Text className="text-white font-bold text-base ml-2">
                            Import to VYBE
                          </Text>
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>

                  <Pressable
                    onPress={handleClearSelection}
                    disabled={isImporting}
                    className="py-4 items-center"
                    style={{ opacity: isImporting ? 0.5 : 1 }}
                  >
                    <Text className="text-[#8B5CF6] font-medium">
                      Select Different File
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </ScrollView>
        </LinearGradient>
      </KeyboardAvoidingView>

      {/* Playback Error Modal */}
      {renderPlaybackErrorModal()}
    </View>
  );
}
