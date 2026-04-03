import React, { useState, useRef, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Keyboard } from 'react-native';
import { VybeTextInput } from '@/components/VybeTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search as SearchIcon, X, Music } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { CategoryCard } from '@/components/CategoryCard';
import { TrackCard } from '@/components/TrackCard';
import { ArtistCard } from '@/components/ArtistCard';
import { FreePDTrackCard } from '@/components/FreePDTrackCard';
import { VybeKeyboard } from '@/components/VybeKeyboard';
import { categories, tracks, artists } from '@/data/mockData';
import { useFreePDStore } from '@/stores/freePDStore';
import { useDownloadStore } from '@/stores/downloadStore';
import { Track } from '@/types/music';

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCustomKeyboard, setShowCustomKeyboard] = useState(false);
  const [showRoyaltyFreeOnly, setShowRoyaltyFreeOnly] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // FreePD store
  const freePDTracks = useFreePDStore(s => s.tracks);
  const startDownload = useDownloadStore(s => s.startDownload);

  const filteredTracks = searchQuery
    ? tracks.filter(
        t =>
          t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.artist.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  // Filter FreePD tracks
  const filteredFreePDTracks = useMemo(() => {
    if (!searchQuery) return [];
    const query = searchQuery.toLowerCase();
    return (freePDTracks as Track[]).filter(
      t =>
        t.title.toLowerCase().includes(query) ||
        t.artist.toLowerCase().includes(query) ||
        t.genreTags?.some(tag => tag.toLowerCase().includes(query)) ||
        t.moodTags?.some(tag => tag.toLowerCase().includes(query))
    );
  }, [searchQuery, freePDTracks]);

  const filteredArtists = searchQuery
    ? artists.filter(a =>
        a.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const hasResults = filteredTracks.length > 0 || filteredArtists.length > 0 || filteredFreePDTracks.length > 0;

  const handleFocus = () => {
    Keyboard.dismiss();
    setShowCustomKeyboard(true);
  };

  const handleKeyPress = (key: string) => {
    setSearchQuery(prev => prev + key);
  };

  const handleDelete = () => {
    setSearchQuery(prev => prev.slice(0, -1));
  };

  const handleSpace = () => {
    setSearchQuery(prev => prev + ' ');
  };

  const handleSearch = () => {
    setShowCustomKeyboard(false);
  };

  const handleClear = () => {
    setSearchQuery('');
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      {/* Search Header */}
      <Pressable onPress={() => setShowCustomKeyboard(false)}>
        <View className="px-5 py-4" style={{ paddingTop: insets.top + 16 }}>
          <Text className="text-white text-2xl font-bold mb-4">Search</Text>
          <Pressable onPress={handleFocus}>
            <View className="flex-row items-center bg-[#1A1A1A] rounded-lg px-4 py-3">
              <SearchIcon size={20} color="rgba(255,255,255,0.6)" />
              <TextInput
                ref={inputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={handleFocus}
                placeholder="Artists, songs, or playlists"
                placeholderTextColor="rgba(255,255,255,0.4)"
                keyboardAppearance="dark"
                className="flex-1 text-white ml-3 text-base"
                autoCapitalize="none"
                autoCorrect={false}
                showSoftInputOnFocus={false}
              />
              {searchQuery ? (
                <Pressable onPress={handleClear}>
                  <X size={20} color="rgba(255,255,255,0.6)" />
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </View>
      </Pressable>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: showCustomKeyboard ? 320 : 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={() => setShowCustomKeyboard(false)}
      >
        {searchQuery ? (
          // Search Results
          <View>
            {hasResults ? (
              <>
                {/* Artists Results */}
                {filteredArtists.length > 0 ? (
                  <View className="mb-6">
                    <Text className="text-white text-lg font-bold px-5 mb-3">
                      Artists
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 20 }}
                      style={{ flexGrow: 0 }}
                    >
                      {filteredArtists.map(artist => (
                        <ArtistCard
                          key={artist.id}
                          artist={artist}
                          onPress={() => router.push(`/(app)/artist/${artist.id}` as never)}
                          size="small"
                        />
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {/* Tracks Results */}
                {filteredTracks.length > 0 ? (
                  <View>
                    <Text className="text-white text-lg font-bold px-5 mb-3">
                      Songs
                    </Text>
                    {filteredTracks.slice(0, 10).map(track => (
                      <TrackCard
                        key={track.id}
                        track={track}
                        queue={filteredTracks}
                      />
                    ))}
                  </View>
                ) : null}

                {/* FreePD (Royalty Free) Results */}
                {filteredFreePDTracks.length > 0 ? (
                  <View className="mt-6">
                    <View className="flex-row items-center px-5 mb-3">
                      <Music size={18} color="#4CAF50" />
                      <Text className="text-white text-lg font-bold ml-2">
                        Royalty Free
                      </Text>
                      <View className="ml-2 bg-[#4CAF50]/20 px-2 py-0.5 rounded">
                        <Text className="text-[#4CAF50] text-xs font-medium">
                          {filteredFreePDTracks.length}
                        </Text>
                      </View>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ paddingHorizontal: 20 }}
                      style={{ flexGrow: 0 }}
                    >
                      {filteredFreePDTracks.slice(0, 10).map(track => (
                        <FreePDTrackCard
                          key={track.id}
                          track={track}
                          queue={filteredFreePDTracks}
                          onDownload={() => startDownload(track)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                ) : null}
              </>
            ) : (
              <View className="items-center justify-center py-20">
                <Text className="text-white/60 text-lg">
                  No results found for "{searchQuery}"
                </Text>
              </View>
            )}
          </View>
        ) : (
          // Browse Categories
          <View className="px-4">
            {/* Royalty Free Quick Access */}
            <Pressable
              onPress={() => router.push('/(app)/freepd-catalog' as never)}
              className="mx-1 mb-4"
            >
              <View className="bg-[#4CAF50]/20 rounded-xl p-4 flex-row items-center">
                <View className="w-12 h-12 bg-[#4CAF50] rounded-lg items-center justify-center">
                  <Music size={24} color="#fff" />
                </View>
                <View className="ml-4 flex-1">
                  <Text className="text-white font-bold text-base">Royalty Free</Text>
                  <Text className="text-white/60 text-sm">Clean audio you can download</Text>
                </View>
              </View>
            </Pressable>

            <Text className="text-white text-lg font-bold px-1 mb-3">
              Browse All
            </Text>
            <View className="flex-row flex-wrap">
              {categories.map(category => (
                <View key={category.id} className="w-1/2">
                  <CategoryCard
                    category={category}
                    onPress={() => {
                      setSearchQuery(category.name);
                    }}
                  />
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Custom VYBE Keyboard */}
      {showCustomKeyboard ? (
        <View
          style={{
            position: 'absolute',
            bottom: 85 + insets.bottom,
            left: 0,
            right: 0,
            backgroundColor: '#0A0A0A',
          }}
        >
          <VybeKeyboard
            onKeyPress={handleKeyPress}
            onDelete={handleDelete}
            onSearch={handleSearch}
            onSpace={handleSpace}
          />
        </View>
      ) : null}
    </View>
  );
}
