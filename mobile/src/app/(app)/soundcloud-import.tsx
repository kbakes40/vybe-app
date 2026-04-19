import React, { useState, useEffect } from 'react';
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
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import {
  ChevronLeft,
  Link,
  Cloud,
  Play,
  Check,
  ExternalLink,
  Plus,
  Sparkles,
  Radio,
  Zap,
} from 'lucide-react-native';
import { api } from '@/lib/api/api';
import { usePlaybackController } from '@/stores/playbackController';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { Track, RelatedTrack, Tag } from '@/types/music';
import { MINI_PLAYER_HEIGHT } from './_layout';
import { useVybePopup } from '@/components/VybePopup';

// Available tags for categorization
const TAGS = [
  { id: 'lofi', name: 'Lo-fi' },
  { id: 'ambient', name: 'Ambient' },
  { id: 'downtempo', name: 'Downtempo' },
  { id: 'electronic', name: 'Electronic' },
  { id: 'instrumental', name: 'Instrumental' },
  { id: 'cinematic', name: 'Cinematic' },
  { id: 'late-night', name: 'Late Night' },
  { id: 'focus', name: 'Focus' },
  { id: 'experimental', name: 'Experimental' },
  { id: 'chill', name: 'Chill' },
];

interface ImportedTrack extends Track {
  artistUrl?: string;
  description?: string;
}

interface ImportResponse {
  track: ImportedTrack;
  suggestedTags?: Tag[];
  suggestedSections?: string[];
  relatedTracks?: RelatedTrack[];
}

interface RelatedResponse {
  tracks: RelatedTrack[];
  basedOnTags: string[];
  totalAvailable: number;
}

export default function SoundCloudImportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const addSeedTrack = useDiscoveryStore(s => s.addSeedTrack);
  const markTrackAsImported = useDiscoveryStore(s => s.markTrackAsImported);

  // Check if mini player is visible
  const showMiniPlayer = !!currentTrack;

  // Calculate bottom padding: safe area + mini player height (if visible) + extra padding
  const bottomPadding = insets.bottom + (showMiniPlayer ? MINI_PLAYER_HEIGHT : 0) + 40;

  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [importedTrack, setImportedTrack] = useState<ImportedTrack | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [suggestedTags, setSuggestedTags] = useState<Tag[]>([]);
  const [suggestedSections, setSuggestedSections] = useState<string[]>([]);
  const [isAdded, setIsAdded] = useState(false);
  const [relatedTracks, setRelatedTracks] = useState<RelatedTrack[]>([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);

  // Fetch related tracks when tags change
  useEffect(() => {
    if (importedTrack && selectedTags.length > 0) {
      fetchRelatedTracks();
    }
  }, [selectedTags, importedTrack?.id]);

  const fetchRelatedTracks = async () => {
    if (!importedTrack) return;

    setIsLoadingRelated(true);
    try {
      const response = await api.post<RelatedResponse>('/api/soundcloud/related', {
        trackId: importedTrack.id,
        tags: selectedTags,
      });
      if (response?.tracks) {
        setRelatedTracks(response.tracks);
      }
    } catch (error) {
      console.error('Failed to fetch related tracks:', error);
    } finally {
      setIsLoadingRelated(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && (text.includes('soundcloud.com') || text.includes('on.soundcloud.com'))) {
        setUrl(text);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        showVybePopup({
          title: 'No SoundCloud URL',
          message: 'The clipboard does not contain a SoundCloud link.',
          type: 'warning',
        });
      }
    } catch {
      showVybePopup({
        title: 'Error',
        message: 'Could not read from clipboard.',
        type: 'error',
      });
    }
  };

  const handleImport = async () => {
    if (!url.trim()) {
      showVybePopup({
        title: 'Enter URL',
        message: 'Please enter a SoundCloud track URL.',
        type: 'warning',
      });
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    setImportedTrack(null);
    setRelatedTracks([]);
    setSuggestedTags([]);
    setSuggestedSections([]);

    try {
      const response = await api.post<ImportResponse>('/api/soundcloud/import', { url: url.trim() });
      if (response?.track) {
        setImportedTrack(response.track);

        // Auto-select suggested tags
        if (response.suggestedTags && response.suggestedTags.length > 0) {
          setSuggestedTags(response.suggestedTags);
          const suggestedIds = response.suggestedTags.map(t => t.id);
          setSelectedTags(suggestedIds.slice(0, 3)); // Auto-select first 3
        }

        // Store suggested sections
        if (response.suggestedSections) {
          setSuggestedSections(response.suggestedSections);
        }

        // Load initial related tracks from response
        if (response.relatedTracks && response.relatedTracks.length > 0) {
          setRelatedTracks(response.relatedTracks);
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Import error:', error);
      showVybePopup({
        title: 'Import Failed',
        message: 'Could not import track from SoundCloud. Please check the URL and try again.',
        type: 'error',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTag = (tagId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    );
  };

  const handlePlay = () => {
    if (importedTrack) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playTrack(importedTrack, [importedTrack]);
    }
  };

  const handlePlayRelated = (track: RelatedTrack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(track, relatedTracks);
  };

  const handleAddToLibrary = () => {
    if (importedTrack) {
      // Add as seed track for discovery
      addSeedTrack(importedTrack, selectedTags);
      markTrackAsImported(importedTrack.id);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsAdded(true);

      // Show sections where track will appear
      const sectionNames = suggestedSections.map(s => {
        const names: Record<string, string> = {
          ai_artists: 'AI Artists to Watch',
          late_night: 'Late Night',
          time_traveler: 'Time Traveler Radio',
          discover_different: 'Discover Something Different',
          old_soul: 'Old Soul, New Sound',
        };
        return names[s] || s;
      }).filter(Boolean);

      const message = sectionNames.length > 0
        ? `"${importedTrack.title}" has been added to your library and will appear in: ${sectionNames.join(', ')}`
        : `"${importedTrack.title}" has been added to your library.`;

      showVybePopup({
        title: 'Added to Library',
        message,
        type: 'success',
      });
    }
  };

  const handleImportAnother = () => {
    setUrl('');
    setImportedTrack(null);
    setSelectedTags([]);
    setSuggestedTags([]);
    setSuggestedSections([]);
    setIsAdded(false);
    setRelatedTracks([]);
  };

  const isSuggestedTag = (tagId: string) => {
    return suggestedTags.some(t => t.id === tagId);
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <LinearGradient
        colors={['#1a1510', '#0F0F0F', '#0A0A0A']}
        style={{ flex: 1 }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                <Cloud size={20} color="#FF5500" />
                <Text className="text-white text-lg font-bold ml-2">
                  Import from SoundCloud
                </Text>
              </View>
            </View>
            <View className="w-10" />
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: bottomPadding }}
            keyboardShouldPersistTaps="handled"
          >
            {!importedTrack ? (
              <>
                {/* URL Input Section */}
                <View className="bg-[#1A1A1A] rounded-xl p-4 mb-6">
                  <Text className="text-white font-semibold mb-3">
                    Paste SoundCloud URL
                  </Text>
                  <View className="flex-row items-center bg-[#0A0A0A] rounded-lg px-4 py-3 mb-3">
                    <Link size={18} color="rgba(255,255,255,0.5)" />
                    <VybeTextInput
                      value={url}
                      onChangeText={setUrl}
                      placeholder="https://soundcloud.com/..."
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      style={{ flex: 1, marginLeft: 12, backgroundColor: 'transparent', padding: 0, borderWidth: 0 }}
                    />
                  </View>
                  <Pressable
                    onPress={handlePasteFromClipboard}
                    className="flex-row items-center justify-center py-2"
                  >
                    <Text className="text-[#FF5500] font-medium">
                      Paste from Clipboard
                    </Text>
                  </Pressable>
                </View>

                {/* Import Button */}
                <Pressable
                  onPress={handleImport}
                  disabled={isLoading || !url.trim()}
                  className="rounded-xl overflow-hidden mb-6"
                  style={{ opacity: isLoading || !url.trim() ? 0.5 : 1 }}
                >
                  <LinearGradient
                    colors={['#FF5500', '#CC4400']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      paddingVertical: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                    }}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Cloud size={20} color="#fff" />
                        <Text className="text-white font-bold text-base ml-2">
                          Import Track
                        </Text>
                      </>
                    )}
                  </LinearGradient>
                </Pressable>

                {/* Info Section */}
                <View className="bg-[#1A1A1A]/50 rounded-xl p-4">
                  <Text className="text-white/60 text-sm leading-5">
                    Paste a SoundCloud track or playlist URL to import it into VYBE.
                    {'\n\n'}
                    Supported formats:{'\n'}
                    • https://soundcloud.com/artist/track{'\n'}
                    • https://on.soundcloud.com/xxxxx
                  </Text>
                </View>
              </>
            ) : (
              <>
                {/* Imported Track Preview */}
                <View className="bg-[#1A1A1A] rounded-xl overflow-hidden mb-6">
                  {/* Track Artwork */}
                  <View className="relative">
                    <Image
                      source={{ uri: importedTrack.artwork }}
                      style={{ width: '100%', aspectRatio: 1 }}
                      contentFit="cover"
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.8)']}
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 120,
                        justifyContent: 'flex-end',
                        padding: 16,
                      }}
                    >
                      <View className="flex-row items-center mb-2">
                        <Cloud size={14} color="#FF5500" />
                        <Text className="text-[#FF5500] text-xs font-medium ml-1">
                          SoundCloud
                        </Text>
                      </View>
                      <Text className="text-white text-xl font-bold" numberOfLines={2}>
                        {importedTrack.title}
                      </Text>
                      <Text className="text-white/70 text-base mt-1">
                        {importedTrack.artist}
                      </Text>
                    </LinearGradient>

                    {/* Play Button Overlay */}
                    <Pressable
                      onPress={handlePlay}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        marginTop: -32,
                        marginLeft: -32,
                        width: 64,
                        height: 64,
                        borderRadius: 32,
                        backgroundColor: '#FF5500',
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#FF5500',
                        shadowOffset: { width: 0, height: 8 },
                        shadowOpacity: 0.5,
                        shadowRadius: 16,
                      }}
                    >
                      <Play size={28} color="#fff" fill="#fff" style={{ marginLeft: 4 }} />
                    </Pressable>
                  </View>
                </View>

                {/* Tags Section */}
                <View className="mb-6">
                  <View className="flex-row items-center mb-3">
                    <Text className="text-white font-semibold">
                      Add Tags
                    </Text>
                    {suggestedTags.length > 0 && (
                      <View className="flex-row items-center ml-2 bg-[#FF5500]/20 px-2 py-1 rounded-full">
                        <Sparkles size={12} color="#FF5500" />
                        <Text className="text-[#FF5500] text-xs ml-1">AI Suggested</Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-row flex-wrap">
                    {TAGS.map(tag => (
                      <Pressable
                        key={tag.id}
                        onPress={() => toggleTag(tag.id)}
                        className="mr-2 mb-2"
                      >
                        <View
                          className="px-4 py-2 rounded-full flex-row items-center"
                          style={{
                            backgroundColor: selectedTags.includes(tag.id)
                              ? '#FF5500'
                              : isSuggestedTag(tag.id)
                              ? 'rgba(255,85,0,0.2)'
                              : 'rgba(255,255,255,0.1)',
                            borderWidth: isSuggestedTag(tag.id) && !selectedTags.includes(tag.id) ? 1 : 0,
                            borderColor: '#FF5500',
                          }}
                        >
                          {selectedTags.includes(tag.id) && (
                            <Check size={14} color="#fff" style={{ marginRight: 4 }} />
                          )}
                          <Text
                            className="font-medium"
                            style={{
                              color: selectedTags.includes(tag.id)
                                ? '#fff'
                                : isSuggestedTag(tag.id)
                                ? '#FF5500'
                                : 'rgba(255,255,255,0.7)',
                            }}
                          >
                            {tag.name}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>

                {/* More Like This Section */}
                {(relatedTracks.length > 0 || isLoadingRelated) && (
                  <View className="mb-6">
                    <View className="flex-row items-center mb-4">
                      <Radio size={18} color="#FF5500" />
                      <Text className="text-white font-semibold text-base ml-2">
                        More like this
                      </Text>
                    </View>

                    {isLoadingRelated ? (
                      <View className="py-8 items-center">
                        <ActivityIndicator color="#FF5500" />
                        <Text className="text-white/50 text-sm mt-2">
                          Finding similar tracks...
                        </Text>
                      </View>
                    ) : (
                      <View className="space-y-2">
                        {relatedTracks.slice(0, 6).map((track, index) => (
                          <Pressable
                            key={track.id}
                            onPress={() => handlePlayRelated(track)}
                            className="flex-row items-center bg-[#1A1A1A] rounded-lg p-3"
                          >
                            <Image
                              source={{ uri: track.artwork }}
                              style={{ width: 48, height: 48, borderRadius: 6 }}
                              contentFit="cover"
                            />
                            <View className="flex-1 ml-3">
                              <Text className="text-white font-medium" numberOfLines={1}>
                                {track.title}
                              </Text>
                              <View className="flex-row items-center mt-1">
                                <Text className="text-white/60 text-sm" numberOfLines={1}>
                                  {track.artist}
                                </Text>
                                {track.isUnderground && (
                                  <View className="ml-2 bg-[#8B5CF6]/20 px-2 py-0.5 rounded">
                                    <Text className="text-[#8B5CF6] text-xs">Underground</Text>
                                  </View>
                                )}
                              </View>
                            </View>
                            <View className="w-10 h-10 items-center justify-center">
                              <Play size={20} color="#FF5500" fill="#FF5500" />
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    )}

                    {relatedTracks.length > 0 && (
                      <Text className="text-white/40 text-xs text-center mt-3">
                        Based on {selectedTags.map(t => TAGS.find(tag => tag.id === t)?.name).filter(Boolean).join(', ')}
                      </Text>
                    )}
                  </View>
                )}

                {/* Actions */}
                <View className="space-y-3">
                  <Pressable
                    onPress={handleAddToLibrary}
                    disabled={isAdded}
                    className="rounded-xl overflow-hidden"
                    style={{ opacity: isAdded ? 0.7 : 1 }}
                  >
                    <LinearGradient
                      colors={isAdded ? ['#1DB954', '#169c46'] : ['#FF5500', '#CC4400']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{
                        paddingVertical: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                      }}
                    >
                      {isAdded ? (
                        <>
                          <Check size={20} color="#fff" />
                          <Text className="text-white font-bold text-base ml-2">
                            Added to Library
                          </Text>
                        </>
                      ) : (
                        <>
                          <Plus size={20} color="#fff" />
                          <Text className="text-white font-bold text-base ml-2">
                            Add to Library
                          </Text>
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>

                  <Pressable
                    onPress={handleImportAnother}
                    className="py-4 items-center"
                  >
                    <Text className="text-[#FF5500] font-medium">
                      Import Another Track
                    </Text>
                  </Pressable>
                </View>

                {/* Compliance Note */}
                <View className="mt-6 bg-[#1A1A1A]/50 rounded-xl p-4">
                  <View className="flex-row items-center mb-2">
                    <ExternalLink size={14} color="rgba(255,255,255,0.5)" />
                    <Text className="text-white/50 text-xs ml-2">
                      Playing from SoundCloud
                    </Text>
                  </View>
                  <Text className="text-white/40 text-xs leading-4">
                    This track streams directly from SoundCloud. Import to Vault is not available for external content.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}
