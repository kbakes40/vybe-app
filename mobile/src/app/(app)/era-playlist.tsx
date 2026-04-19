import { View, Text, Pressable, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ChevronLeft } from 'lucide-react-native';

/**
 * Era Hits deep link from Discover — param `era` is the display label (e.g. "The Hits: '80s").
 */
export default function EraPlaylistScreen() {
  const { era } = useLocalSearchParams<{ era?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const title = typeof era === 'string' ? era : 'Era playlist';

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: insets.top }} className="px-5 pb-6">
          <Pressable
            onPress={() => router.back()}
            className="flex-row items-center self-start py-2 -ml-1"
            hitSlop={12}
          >
            <ChevronLeft size={28} color="#fff" />
            <Text className="text-white text-base ml-1">Back</Text>
          </Pressable>

          <View className="mt-4 items-center">
            <View className="w-48 h-48 rounded-2xl overflow-hidden bg-neutral-900">
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1484755560615-a4c64e778a6c?w=400&h=400&fit=crop' }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            </View>
            <Text className="text-white text-2xl font-bold mt-6 text-center">{title}</Text>
            <Text className="text-white/50 text-sm mt-2 text-center px-4">
              Curated era mixes are coming soon. For now, browse Discover for more playlists.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
