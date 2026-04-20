import React, { useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { VybeTextInput } from '@/components/VybeTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft,
  Search,
  X,
  Music,
  Play,
  Download,
} from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import {
  useFreePDStore,
  selectFreePDTracks,
  selectFreePDGenres,
  selectFreePDMoods,
  selectFreePDIsLoading,
  selectFreePDError,
  selectFreePDSearchQuery,
  selectFreePDSearchResults,
  selectFreePDIsSearching,
  selectFreePDSelectedGenre,
  selectFreePDSelectedMood,
} from '@/stores/freePDStore';
import { usePlaybackController } from '@/stores/playbackController';
import { FreePDTrack, FreePDCategory } from '@/types/freepd';
import { Track } from '@/types/music';
import { cn } from '@/lib/cn';
import { FreePDSourceBadge } from '@/components/FreePDSourceBadge';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TrackListItemProps {
  track: Track;
  queue: Track[];
  onDownload?: (track: Track) => void;
}

/**
 * List item component for FreePD tracks in the catalog
 */
function TrackListItem({ track, queue, onDownload }: TrackListItemProps) {
  const scale = useSharedValue(1);
  const playTrack = usePlaybackController(s => s.playTrack);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playbackState = usePlaybackController(s => s.playbackState);

  const isCurrentTrack = currentTrack?.id === track.id;
  const isPlaying = playbackState === 'playing' && isCurrentTrack;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(track, queue);
  };

  const handleDownload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onDownload?.(track);
  };

  // Format duration
  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
      className="flex-row items-center bg-[#1A1A1A] rounded-xl p-3 mb-3 mx-5"
    >
      {/* Artwork */}
      <View className="relative">
        <Image
          source={{ uri: track.artwork }}
          style={{ width: 56, height: 56, borderRadius: 8 }}
          contentFit="cover"
        />
        {/* Play overlay */}
        <View className="absolute inset-0 items-center justify-center">
          <View
            className={cn(
              'w-8 h-8 rounded-full items-center justify-center',
              isPlaying ? 'bg-[#4CAF50]' : 'bg-black/60'
            )}
          >
            <Play
              size={14}
              color="#fff"
              fill="#fff"
              style={{ marginLeft: 1 }}
            />
          </View>
        </View>
      </View>

      {/* Track info */}
      <View className="flex-1 ml-3">
        <Text
          className={cn(
            'font-semibold text-sm',
            isCurrentTrack ? 'text-[#4CAF50]' : 'text-white'
          )}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <View className="flex-row items-center mt-0.5">
          <Text className="text-white/60 text-xs" numberOfLines={1}>
            {track.artist}
          </Text>
          {track.duration ? (
            <Text className="text-white/40 text-xs ml-2">
              {formatDuration(track.duration)}
            </Text>
          ) : null}
        </View>
        {/* Tags */}
        <View className="flex-row items-center mt-1">
          <FreePDSourceBadge size="small" />
          {(track as FreePDTrack).freePdCategory ? (
            <View className="ml-1.5 bg-white/10 px-1.5 py-0.5 rounded">
              <Text className="text-white/60 text-[10px] capitalize">
                {(track as FreePDTrack).freePdCategory}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Now playing indicator */}
      {isPlaying ? (
        <View className="flex-row gap-[2px] mr-3">
          <View className="w-[2px] h-3 bg-[#4CAF50] rounded-full" />
          <View className="w-[2px] h-2 bg-[#4CAF50] rounded-full" />
          <View className="w-[2px] h-4 bg-[#4CAF50] rounded-full" />
        </View>
      ) : null}

      {/* Download button */}
      {onDownload ? (
        <Pressable
          onPress={handleDownload}
          className="w-10 h-10 items-center justify-center"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Download size={20} color="#4CAF50" />
        </Pressable>
      ) : null}
    </AnimatedPressable>
  );
}

/**
 * Filter chip component for genres and moods
 */
interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  count?: number;
}

function FilterChip({ label, isSelected, onPress, count }: FilterChipProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="mr-2 mb-2"
    >
      <View
        className={cn(
          'px-4 py-2 rounded-full flex-row items-center',
          isSelected ? 'bg-[#4CAF50]' : 'bg-white/10'
        )}
      >
        <Text
          className={cn(
            'font-medium text-sm capitalize',
            isSelected ? 'text-white' : 'text-white/70'
          )}
        >
          {label}
        </Text>
        {count !== undefined && count > 0 ? (
          <Text
            className={cn(
              'text-xs ml-1',
              isSelected ? 'text-white/80' : 'text-white/40'
            )}
          >
            ({count})
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function FreePDCatalogScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Store selectors
  const tracks = useFreePDStore(selectFreePDTracks);
  const genres = useFreePDStore(selectFreePDGenres);
  const moods = useFreePDStore(selectFreePDMoods);
  const isLoading = useFreePDStore(selectFreePDIsLoading);
  const error = useFreePDStore(selectFreePDError);
  const searchQuery = useFreePDStore(selectFreePDSearchQuery);
  const searchResults = useFreePDStore(selectFreePDSearchResults);
  const isSearching = useFreePDStore(selectFreePDIsSearching);
  const selectedGenre = useFreePDStore(selectFreePDSelectedGenre);
  const selectedMood = useFreePDStore(selectFreePDSelectedMood);

  // Store actions
  const loadCatalog = useFreePDStore(s => s.loadCatalog);
  const refreshCatalog = useFreePDStore(s => s.refreshCatalog);
  const searchTracks = useFreePDStore(s => s.searchTracks);
  const clearSearch = useFreePDStore(s => s.clearSearch);
  const setSelectedGenre = useFreePDStore(s => s.setSelectedGenre);
  const setSelectedMood = useFreePDStore(s => s.setSelectedMood);
  const getTracksByGenre = useFreePDStore(s => s.getTracksByGenre);
  const getTracksByMood = useFreePDStore(s => s.getTracksByMood);

  const bottomPadding = insets.bottom + 20;

  // Load catalog on mount
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Filtered tracks based on search, genre, and mood
  const filteredTracks = useMemo(() => {
    // If searching, use search results
    if (searchQuery.trim()) {
      return searchResults;
    }

    let result = tracks;

    // Apply genre filter
    if (selectedGenre) {
      result = getTracksByGenre(selectedGenre);
    }

    // Apply mood filter on top
    if (selectedMood) {
      const lowerMood = selectedMood.toLowerCase();
      result = result.filter(
        (track) =>
          track.moodTags?.some((m) => m.toLowerCase() === lowerMood) ||
          track.tags?.some((t) => t.toLowerCase() === lowerMood)
      );
    }

    return result;
  }, [tracks, searchQuery, searchResults, selectedGenre, selectedMood, getTracksByGenre]);

  // Handle search input
  const handleSearchChange = useCallback((text: string) => {
    searchTracks(text);
  }, [searchTracks]);

  // Handle clear search
  const handleClearSearch = useCallback(() => {
    clearSearch();
  }, [clearSearch]);

  // Handle genre selection
  const handleGenrePress = useCallback((genre: FreePDCategory) => {
    if (selectedGenre === genre) {
      setSelectedGenre(null);
    } else {
      setSelectedGenre(genre);
    }
  }, [selectedGenre, setSelectedGenre]);

  // Handle mood selection
  const handleMoodPress = useCallback((mood: string) => {
    if (selectedMood === mood) {
      setSelectedMood(null);
    } else {
      setSelectedMood(mood);
    }
  }, [selectedMood, setSelectedMood]);

  // Handle download (placeholder)
  const handleDownload = useCallback((track: Track) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // TODO: Implement actual download logic
    console.log('Download track:', track.id);
  }, []);

  // Handle pull to refresh
  const handleRefresh = useCallback(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  // Render track item
  const renderTrackItem = useCallback(({ item }: { item: Track }) => (
    <TrackListItem
      track={item}
      queue={filteredTracks}
      onDownload={handleDownload}
    />
  ), [filteredTracks, handleDownload]);

  // List header component
  const ListHeader = useMemo(() => (
    <View>
      {/* Search input */}
      <View className="mx-5 mb-4">
        <View className="flex-row items-center bg-white/10 rounded-xl px-4 py-3">
          <Search size={18} color="rgba(255,255,255,0.5)" />
          <VybeTextInput
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search tracks, artists, tags..."
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, marginLeft: 12, backgroundColor: 'transparent', padding: 0, borderWidth: 0 }}
          />
          {searchQuery.trim() ? (
            <Pressable onPress={handleClearSearch} hitSlop={8}>
              <X size={18} color="rgba(255,255,255,0.5)" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Genre filter chips */}
      {genres.length > 0 ? (
        <View className="mb-3">
          <Text className="text-white/60 text-xs font-medium px-5 mb-2 uppercase tracking-wider">
            Genres
          </Text>
          <View className="flex-row flex-wrap px-5">
            {genres.map((genre) => (
              <FilterChip
                key={genre.name}
                label={genre.name}
                isSelected={selectedGenre === genre.name}
                onPress={() => handleGenrePress(genre.name as FreePDCategory)}
                count={genre.count}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Mood filter chips */}
      {moods.length > 0 ? (
        <View className="mb-4">
          <Text className="text-white/60 text-xs font-medium px-5 mb-2 uppercase tracking-wider">
            Moods
          </Text>
          <View className="flex-row flex-wrap px-5">
            {moods.map((mood) => (
              <FilterChip
                key={mood}
                label={mood}
                isSelected={selectedMood === mood}
                onPress={() => handleMoodPress(mood)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* Track count */}
      <View className="flex-row items-center justify-between px-5 mb-3">
        <Text className="text-white/60 text-sm">
          {filteredTracks.length} {filteredTracks.length === 1 ? 'track' : 'tracks'}
        </Text>
        {(selectedGenre || selectedMood) ? (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedGenre(null);
              setSelectedMood(null);
            }}
          >
            <Text className="text-[#4CAF50] text-sm font-medium">Clear filters</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  ), [
    searchQuery,
    handleSearchChange,
    handleClearSearch,
    genres,
    selectedGenre,
    handleGenrePress,
    moods,
    selectedMood,
    handleMoodPress,
    filteredTracks.length,
    setSelectedGenre,
    setSelectedMood,
  ]);

  // Empty state component
  const EmptyComponent = useMemo(() => {
    if (isLoading && tracks.length === 0) {
      return (
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text className="text-white/60 text-sm mt-4">Loading catalog...</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View className="flex-1 items-center justify-center py-20 px-8">
          <Music size={48} color="rgba(255,255,255,0.3)" />
          <Text className="text-white/60 text-sm text-center mt-4">
            {error}
          </Text>
          <Pressable
            onPress={handleRefresh}
            className="mt-4 bg-[#4CAF50] px-6 py-3 rounded-full"
          >
            <Text className="text-white font-medium">Try Again</Text>
          </Pressable>
        </View>
      );
    }

    if (searchQuery.trim() && filteredTracks.length === 0) {
      return (
        <View className="flex-1 items-center justify-center py-20 px-8">
          <Search size={48} color="rgba(255,255,255,0.3)" />
          <Text className="text-white text-lg font-semibold mt-4">
            No results found
          </Text>
          <Text className="text-white/60 text-sm text-center mt-2">
            Try searching for something else or clear your filters
          </Text>
          <Pressable
            onPress={handleClearSearch}
            className="mt-4 bg-white/10 px-6 py-3 rounded-full"
          >
            <Text className="text-white font-medium">Clear Search</Text>
          </Pressable>
        </View>
      );
    }

    if (filteredTracks.length === 0) {
      return (
        <View className="flex-1 items-center justify-center py-20 px-8">
          <Music size={48} color="rgba(255,255,255,0.3)" />
          <Text className="text-white text-lg font-semibold mt-4">
            No tracks found
          </Text>
          <Text className="text-white/60 text-sm text-center mt-2">
            No tracks match your current filters
          </Text>
          {(selectedGenre || selectedMood) ? (
            <Pressable
              onPress={() => {
                setSelectedGenre(null);
                setSelectedMood(null);
              }}
              className="mt-4 bg-white/10 px-6 py-3 rounded-full"
            >
              <Text className="text-white font-medium">Clear Filters</Text>
            </Pressable>
          ) : null}
        </View>
      );
    }

    return null;
  }, [
    isLoading,
    tracks.length,
    error,
    searchQuery,
    filteredTracks.length,
    handleRefresh,
    handleClearSearch,
    selectedGenre,
    selectedMood,
    setSelectedGenre,
    setSelectedMood,
  ]);

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <LinearGradient
        colors={['#1a201a', '#0F0F0F', '#0A0A0A']}
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
              <Music size={20} color="#4CAF50" />
              <Text className="text-white text-lg font-bold ml-2">
                Royalty Free
              </Text>
            </View>
          </View>
          <View className="w-10" />
        </View>

        {/* Track list */}
        <FlatList
          data={filteredTracks}
          renderItem={renderTrackItem}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={EmptyComponent}
          contentContainerStyle={{ paddingBottom: bottomPadding }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading && tracks.length > 0}
              onRefresh={handleRefresh}
              tintColor="#4CAF50"
              colors={['#4CAF50']}
            />
          }
        />

        {/* Search loading indicator */}
        {isSearching ? (
          <View className="absolute top-0 left-0 right-0 bottom-0 items-center justify-center pointer-events-none">
            <View className="bg-black/80 px-6 py-4 rounded-xl">
              <ActivityIndicator size="small" color="#4CAF50" />
              <Text className="text-white/80 text-sm mt-2">Searching...</Text>
            </View>
          </View>
        ) : null}
      </LinearGradient>
    </View>
  );
}
