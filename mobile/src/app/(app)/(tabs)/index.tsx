import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Dimensions,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
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
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { VybeHeaderMark } from '@/components/Header';
import { authClient } from '@/lib/auth/auth-client';
import { usePlaybackController } from '@/stores/playbackController';
import { useRecentsStore } from '@/stores/recentsStore';
import type { Track } from '@/types/music';
import { GARAGEBAND_VINYLS, PILL_CYAN } from '@/constants/garagebandLibrary';
import { GARAGEBAND_SHOWCASE_DECK } from '@/constants/garagebandShowcaseDeck';
import { resolveAllGarageBandVinyls } from '@/lib/garagebandAssetMap';
import { BANDCAMP_JAZZ_ALBUM_SEEDS } from '@/constants/bandcampDiscoverSeeds';
import { bandcampTagAlbumToTrack, fetchBandcampAlbumsFromUrls } from '@/lib/bandcampService';
import { tabScreenContentContainerPaddingBottom } from '@/constants/Layout';
import { useLouisOledChrome } from '@/hooks/useLouisOledChrome';
import { useVinylHeroTransitionStore, type VinylHeroRect } from '@/stores/vinylHeroTransitionStore';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<Track>);

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const VINYL_W = Math.min(260, Math.round(SCREEN_W * 0.62));
const VINYL_GAP = 20;
const STRIDE = VINYL_W + VINYL_GAP;
/** Title + artist + margins; extra for 1.12 scale on the carousel card. */
const VINYL_TITLE_STACK_PT = 118;
const VINYL_CAROUSEL_SCALE_PAD = Math.ceil(VINYL_W * 0.16);
const VINYL_CAROUSEL_HEIGHT = VINYL_W + VINYL_TITLE_STACK_PT + VINYL_CAROUSEL_SCALE_PAD;
/** Decode / list tiles smaller than full 4K source to keep scroll smooth on Pro Max. */
const GRID_GAP = 12;
const GRID_H_PAD = 20;
const MIX_TILE_W = (SCREEN_W - GRID_H_PAD * 2 - GRID_GAP) / 2;

const DECK_TITLE_GLOW = {
  color: PILL_CYAN,
  textShadowColor: 'rgba(0, 229, 255, 0.5)',
  textShadowOffset: { width: 0, height: 0 },
  textShadowRadius: 4,
} as const;

function VinylCarouselItem({
  index,
  scrollX,
  item,
  isActive,
  onPlayFromCarousel,
}: {
  index: number;
  scrollX: SharedValue<number>;
  item: Track;
  isActive: boolean;
  onPlayFromCarousel: (t: Track, rect: VinylHeroRect) => void;
}) {
  const discRef = useRef<View>(null);
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

  const handlePress = () => {
    const fallbackRect: VinylHeroRect = { x: 0, y: 0, width: VINYL_W, height: VINYL_W };
    const deliver = (rect: VinylHeroRect) => {
      onPlayFromCarousel(item, rect);
    };
    /** Two rAFs: layout + ref attachment (esp. inside Reanimated horizontal list). */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const node = discRef.current;
        if (!node) {
          deliver(fallbackRect);
          return;
        }
        try {
          node.measureInWindow((x, y, width, height) => {
            if (width > 1 && height > 1) {
              deliver({ x, y, width, height });
            } else {
              deliver(fallbackRect);
            }
          });
        } catch {
          deliver(fallbackRect);
        }
      });
    });
  };

  return (
    <Animated.View
      style={[{ width: STRIDE, alignItems: 'center', paddingBottom: 10 }, anim]}
    >
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Play ${item.title}`}
      >
        <View
          ref={discRef}
          collapsable={false}
          style={{
            width: VINYL_W,
            height: VINYL_W,
            borderRadius: VINYL_W / 2,
            overflow: 'hidden',
            borderWidth: 1,
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
        </View>
        <Text
          className="text-white font-bold text-center mt-4 px-2"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ width: VINYL_W }}
        >
          {item.title}
        </Text>
        <Text
          className="text-white/50 text-sm text-center mt-1"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{ width: VINYL_W }}
        >
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
  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const playbackState = usePlaybackController((s) => s.playbackState);
  const progress = usePlaybackController((s) => s.progress);
  const duration = usePlaybackController((s) => s.duration);
  const recentTracks = useRecentsStore((s) => s.recentTracks);

  const [gbTracks, setGbTracks] = useState<Track[]>([]);
  const [bandcampDeck, setBandcampDeck] = useState<Track[]>([]);
  const [deckLoading, setDeckLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const gbPromise =
          GARAGEBAND_VINYLS.length === 0
            ? Promise.resolve([] as Track[])
            : resolveAllGarageBandVinyls(GARAGEBAND_VINYLS);
        /** Direct jazz URLs — tag-hub fallback only used the first ~16 global seeds, so jazz never surfaced. */
        const bcPromise = fetchBandcampAlbumsFromUrls(BANDCAMP_JAZZ_ALBUM_SEEDS, { max: 20 })
          .then((rows) => rows.map((r) => bandcampTagAlbumToTrack(r)))
          .catch(() => [] as Track[]);

        const [gb, bc] = await Promise.all([gbPromise, bcPromise]);
        if (!cancelled) {
          setGbTracks(gb);
          setBandcampDeck(bc);
        }
      } finally {
        if (!cancelled) setDeckLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const vinylTracks = useMemo(() => {
    const seen = new Set<string>();
    const merged: Track[] = [];
    const pushUnique = (list: Track[]) => {
      for (const t of list) {
        if (!t?.id || seen.has(t.id)) continue;
        seen.add(t.id);
        merged.push(t);
      }
    };
    pushUnique(gbTracks);
    pushUnique(bandcampDeck);
    pushUnique(GARAGEBAND_SHOWCASE_DECK);
    return merged;
  }, [gbTracks, bandcampDeck]);

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

  /** Match recents cap so newly played tracks actually appear on Home. */
  const RECENTLY_MIXED_HOME_CAP = 50;

  const recentlyMixed = useMemo(() => {
    const merged = [...recentTracks, ...vinylTracks];
    const seen = new Set<string>();
    const out: Track[] = [];
    for (const t of merged) {
      if (!t?.id || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
      if (out.length >= RECENTLY_MIXED_HOME_CAP) break;
    }
    return out;
  }, [recentTracks, vinylTracks]);

  const handlePlayFromCarousel = useCallback(
    (track: Track, rect: VinylHeroRect) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      useVinylHeroTransitionStore.getState().setPending(rect, track.id);
      const queue = [track, ...vinylTracks.filter((t) => t.id !== track.id)];
      void playTrack(track, queue, { expandNowPlaying: true });
    },
    [playTrack, vinylTracks],
  );

  const handlePlayVinyl = useCallback(
    (track: Track) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const seen = new Set<string>();
      const queue: Track[] = [];
      const add = (t: Track) => {
        if (!t?.id || seen.has(t.id)) return;
        seen.add(t.id);
        queue.push(t);
      };
      add(track);
      for (const t of recentlyMixed) add(t);
      void playTrack(track, queue, { expandNowPlaying: true });
    },
    [playTrack, recentlyMixed],
  );

  const recentlyMixedRows = useMemo(() => {
    const rows: Track[][] = [];
    for (let i = 0; i < recentlyMixed.length; i += 2) {
      rows.push(recentlyMixed.slice(i, i + 2));
    }
    return rows;
  }, [recentlyMixed]);

  const progressPct = duration > 0 ? Math.min(1, Math.max(0, progress / duration)) : 0;
  const hideHomeGreeting =
    playbackState === 'playing' ||
    playbackState === 'buffering' ||
    playbackState === 'loading';

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
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: tabListTopPadding,
            paddingBottom: tabScreenContentContainerPaddingBottom(insets.bottom) + 28,
          }}
        >
          {/* Same top baseline as other tab roots — clears status bar + in-app Island pill */}
          <View style={{ paddingHorizontal: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <VybeHeaderMark size={32} />
              <Text style={{ flex: 1, marginLeft: 12, fontSize: 22, fontWeight: '800', ...DECK_TITLE_GLOW }}>
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
            {!hideHomeGreeting ? (
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginBottom: 14 }}>
                Hey {firstName} — spin a vinyl or jump back into a mix.
              </Text>
            ) : null}
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

          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', paddingHorizontal: 20, marginBottom: 10 }}>
            Your deck
          </Text>
          <View style={{ overflow: 'visible', marginBottom: 6 }}>
            {deckLoading ? (
              <View
                style={{
                  minHeight: VINYL_CAROUSEL_HEIGHT * 0.45,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ActivityIndicator color={PILL_CYAN} size="large" />
                <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 12 }}>
                  Loading jazz picks…
                </Text>
              </View>
            ) : vinylTracks.length === 0 ? (
              <View
                style={{
                  minHeight: VINYL_CAROUSEL_HEIGHT * 0.55,
                  paddingHorizontal: 28,
                  paddingVertical: 24,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 20 }}>
                  No deck items yet. Export mixes to{' '}
                  <Text style={{ color: PILL_CYAN, fontWeight: '700' }}>assets/music/garageband/</Text> and register
                  them in <Text style={{ color: PILL_CYAN, fontWeight: '700' }}>garagebandLibrary.ts</Text>, or play
                  music from Library — it will show up in Recently mixed.
                </Text>
              </View>
            ) : (
              <AnimatedFlatList
                data={vinylTracks}
                horizontal
                keyExtractor={(item) => item.id}
                showsHorizontalScrollIndicator={false}
                snapToInterval={STRIDE}
                decelerationRate="normal"
                nestedScrollEnabled
                style={{ height: VINYL_CAROUSEL_HEIGHT }}
                contentContainerStyle={{
                  paddingHorizontal: (SCREEN_W - VINYL_W) / 2,
                  paddingTop: 10,
                  paddingBottom: 18,
                }}
                onScroll={onScroll}
                scrollEventThrottle={16}
                windowSize={11}
                maxToRenderPerBatch={8}
                initialNumToRender={8}
                removeClippedSubviews={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={{ itemVisiblePercentThreshold: 55 }}
                renderItem={({ item, index }) => (
                  <VinylCarouselItem
                    index={index}
                    scrollX={scrollX}
                    item={item}
                    isActive={activeIndex === index}
                    onPlayFromCarousel={handlePlayFromCarousel}
                  />
                )}
              />
            )}
          </View>

          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', paddingHorizontal: 20, marginTop: 8, marginBottom: 12 }}>
            Recently mixed
          </Text>
          {recentlyMixedRows.map((pair, rowIdx) => (
            <View
              key={`mix-row-${rowIdx}`}
              style={{
                flexDirection: 'row',
                gap: GRID_GAP,
                paddingHorizontal: GRID_H_PAD,
                marginBottom: GRID_GAP,
              }}
            >
              {pair.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => handlePlayVinyl(item)}
                  hitSlop={4}
                  unstable_pressDelay={0}
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
                    pointerEvents="none"
                    source={{ uri: item.artwork }}
                    style={{ width: MIX_TILE_W, height: MIX_TILE_W }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={`grid-${item.id}`}
                    priority="low"
                    allowDownscaling
                  />
                  <View style={{ padding: 10 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1} ellipsizeMode="tail">
                      {item.title}
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }} numberOfLines={1} ellipsizeMode="tail">
                      {item.artist}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
