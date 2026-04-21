import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Dimensions,
  StyleSheet,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Play, Pause } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { VybeHeaderMark } from '@/components/Header';
import { authClient } from '@/lib/auth/auth-client';
import { usePlaybackController } from '@/stores/playbackController';
import { useRecentsStore } from '@/stores/recentsStore';
import { tracks as mockTracks } from '@/data/mockData';
import type { Track } from '@/types/music';
import {
  GARAGEBAND_VINYLS,
  PILL_CYAN,
  SEXY_FIRE_GRADIENT,
} from '@/constants/garagebandLibrary';
import { resolveAllGarageBandVinyls } from '@/lib/garagebandAssetMap';
import { tabScreenContentContainerPaddingBottom } from '@/constants/Layout';
import { useLouisOledChrome } from '@/hooks/useLouisOledChrome';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Track>);

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const VINYL_W = Math.min(260, Math.round(SCREEN_W * 0.62));
const VINYL_GAP = 20;
const STRIDE = VINYL_W + VINYL_GAP;
/** Decode / list tiles smaller than full 4K source to keep scroll smooth on Pro Max. */
const GRID_GAP = 12;
const GRID_H_PAD = 20;
const MIX_TILE_W = (SCREEN_W - GRID_H_PAD * 2 - GRID_GAP) / 2;

function VinylCarouselItem({
  index,
  scrollX,
  item,
  isActive,
  onPlay,
}: {
  index: number;
  scrollX: SharedValue<number>;
  item: Track;
  isActive: boolean;
  onPlay: () => void;
}) {
  const anim = useAnimatedStyle(() => {
    const centerItem = index * STRIDE + VINYL_W / 2;
    const centerViewport = scrollX.value + SCREEN_W / 2;
    const dist = centerItem - centerViewport;
    const scale = interpolate(dist, [-300, 0, 300], [0.82, 1.12, 0.82], Extrapolation.CLAMP);
    const opacity = interpolate(dist, [-420, 0, 420], [0.55, 1, 0.55], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ scale }],
    };
  }, [index]);

  return (
    <Animated.View style={[{ width: STRIDE, alignItems: 'center' }, anim]}>
      <Pressable onPress={onPlay} accessibilityRole="button" accessibilityLabel={`Play ${item.title}`}>
        <View
          style={{
            width: VINYL_W,
            height: VINYL_W,
            borderRadius: VINYL_W / 2,
            overflow: 'hidden',
            borderWidth: 3,
            borderColor: isActive ? PILL_CYAN : 'rgba(255,255,255,0.14)',
            backgroundColor: '#0c0c0c',
          }}
        >
          {item.artwork ? (
            <Image
              source={{ uri: item.artwork }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={item.id}
              priority={isActive ? 'high' : 'low'}
              allowDownscaling
            />
          ) : (
            <View style={{ flex: 1, backgroundColor: '#1a1a1a' }} />
          )}
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFillObject,
              { alignItems: 'center', justifyContent: 'center' },
            ]}
          >
            <LinearGradient
              colors={[...SEXY_FIRE_GRADIENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.35)',
              }}
            >
              <Play size={30} color="#fff" fill="#fff" style={{ marginLeft: 4 }} />
            </LinearGradient>
          </View>
        </View>
        <Text className="text-white font-bold text-center mt-4 px-2" numberOfLines={1} style={{ width: VINYL_W }}>
          {item.title}
        </Text>
        <Text className="text-white/50 text-sm text-center mt-1" numberOfLines={1} style={{ width: VINYL_W }}>
          {item.artist}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { kickTranslateStyle, tabListTopPadding } = useLouisOledChrome(insets.top);
  const router = useRouter();
  const playTrack = usePlaybackController((s) => s.playTrack);
  const play = usePlaybackController((s) => s.play);
  const pause = usePlaybackController((s) => s.pause);
  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const playbackState = usePlaybackController((s) => s.playbackState);
  const progress = usePlaybackController((s) => s.progress);
  const duration = usePlaybackController((s) => s.duration);
  const addToRecents = useRecentsStore((s) => s.addToRecents);
  const recentTracks = useRecentsStore((s) => s.recentTracks);

  const [gbTracks, setGbTracks] = useState<Track[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (GARAGEBAND_VINYLS.length === 0) return;
    void resolveAllGarageBandVinyls(GARAGEBAND_VINYLS).then((rows) => {
      if (!cancelled && rows.length) setGbTracks(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const vinylTracks = useMemo(() => {
    if (gbTracks.length > 0) return gbTracks;
    return mockTracks.slice(0, 8);
  }, [gbTracks]);

  const bgArtUri = currentTrack?.artwork || vinylTracks[0]?.artwork || '';

  const scrollX = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
      const i = viewableItems[0]?.index;
      if (typeof i === 'number') setActiveIndex(i);
    },
    [],
  );

  const { data: session } = authClient.useSession();
  const firstName = useMemo(() => {
    const u = session?.user as { name?: string | null; email?: string | null } | undefined;
    if (!u) return 'there';
    if (u.name?.trim()) return u.name.trim().split(/\s+/)[0] ?? 'there';
    if (u.email?.trim()) return u.email.split('@')[0] ?? 'there';
    return 'there';
  }, [session?.user]);

  const recentlyMixed = useMemo(() => {
    const merged = [...recentTracks, ...vinylTracks];
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const t of merged) {
      if (!t?.id || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
      if (out.length >= 10) break;
    }
    return out;
  }, [recentTracks, vinylTracks]);

  const handlePlayVinyl = useCallback(
    (track: Track) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      addToRecents(track);
      void playTrack(track, vinylTracks, { expandNowPlaying: false });
    },
    [addToRecents, playTrack, vinylTracks],
  );

  const progressPct = duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
  const isPlaying = playbackState === 'playing';
  const playingThisDeck =
    currentTrack && vinylTracks.some((t) => t.id === currentTrack.id) && isPlaying;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Full-bleed blurred 4K (or remote) art — lazy decode cap for GPU/memory */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {bgArtUri ? (
          <Image
            source={{ uri: bgArtUri }}
            style={{ width: SCREEN_W, height: SCREEN_H }}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
            allowDownscaling
            blurRadius={55}
          />
        ) : null}
        <LinearGradient
          colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.88)', '#000']}
          style={StyleSheet.absoluteFill}
        />
        <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
      </View>

      <Animated.View style={[{ flex: 1 }, kickTranslateStyle]}>
        {/* Dynamic Island hardware alignment: -8pt vs raw safe top */}
        <View style={{ paddingTop: Math.max(0, insets.top - 8), paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <VybeHeaderMark size={32} />
            <Text style={{ flex: 1, marginLeft: 12, color: '#fff', fontSize: 22, fontWeight: '800' }}>
              GarageBand deck
            </Text>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                router.push('/(app)/(tabs)/vault' as never);
              }}
              hitSlop={10}
            >
              <Text style={{ color: PILL_CYAN, fontWeight: '700', fontSize: 14 }}>Library</Text>
            </Pressable>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginBottom: tabListTopPadding - insets.top - 28 }}>
            Hey {firstName} — spin a vinyl or jump back into a mix.
          </Text>
        </View>

        {/* Pill cyan progress (global session) */}
        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: 'rgba(255,255,255,0.12)',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: '100%',
                width: `${progressPct * 100}%`,
                borderRadius: 2,
                backgroundColor: PILL_CYAN,
              }}
            />
          </View>
        </View>

        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', paddingHorizontal: 20, marginBottom: 12 }}>
          Your vinyls
        </Text>
        <AnimatedFlatList
          data={vinylTracks}
          horizontal
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          snapToInterval={STRIDE}
          decelerationRate="fast"
          contentContainerStyle={{
            paddingHorizontal: (SCREEN_W - VINYL_W) / 2,
            paddingBottom: 8,
          }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          windowSize={3}
          maxToRenderPerBatch={3}
          initialNumToRender={3}
          removeClippedSubviews
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 55 }}
          renderItem={({ item, index }) => (
            <VinylCarouselItem
              index={index}
              scrollX={scrollX}
              item={item}
              isActive={activeIndex === index}
              onPlay={() => handlePlayVinyl(item)}
            />
          )}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            marginVertical: 16,
          }}
        >
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (playingThisDeck) void pause();
              else if (currentTrack) void play();
              else if (vinylTracks[0]) handlePlayVinyl(vinylTracks[0]);
            }}
          >
            <LinearGradient
              colors={[...SEXY_FIRE_GRADIENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.4)',
              }}
            >
              {playingThisDeck ? (
                <Pause size={34} color="#fff" fill="#fff" />
              ) : (
                <Play size={34} color="#fff" fill="#fff" style={{ marginLeft: 4 }} />
              )}
            </LinearGradient>
          </Pressable>
        </View>

        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', paddingHorizontal: 20, marginTop: 8, marginBottom: 12 }}>
          Recently mixed
        </Text>
        <FlatList
          data={recentlyMixed}
          keyExtractor={(item) => item.id}
          numColumns={2}
          scrollEnabled={recentlyMixed.length > 4}
          columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
          contentContainerStyle={{
            paddingBottom: tabScreenContentContainerPaddingBottom(insets.bottom) + 24,
            paddingHorizontal: GRID_H_PAD,
          }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handlePlayVinyl(item)}
              style={{
                width: MIX_TILE_W,
                borderRadius: 14,
                overflow: 'hidden',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: 'rgba(255,255,255,0.12)',
                backgroundColor: 'rgba(12,12,12,0.55)',
              }}
            >
              <Image
                source={{ uri: item.artwork }}
                style={{ width: MIX_TILE_W, height: MIX_TILE_W }}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={`grid-${item.id}`}
                priority="low"
                allowDownscaling
              />
              <View style={{ padding: 10 }}>
                <Text style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                  {item.artist}
                </Text>
              </View>
            </Pressable>
          )}
        />
      </Animated.View>
    </View>
  );
}
