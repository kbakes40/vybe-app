import React, { useState, forwardRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Play } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
  Easing,
  interpolateColor,
} from 'react-native-reanimated';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { Playlist } from '@/types/music';
import { usePlaybackController } from '@/stores/playbackController';
import { getTracksFromPlaylist } from '@/data/mockData';
import { SourceCornerBadge } from '@/components/SourceCornerBadge';
import type { SourceCornerBadgeSource } from '@/components/SourceCornerBadge';

const CARD_RADIUS = 16;
const BORDER_COLOR = '#FFFFFF15';

/** Move emoji clusters to end of title for consistent Shadow typography. */
export function playlistTitleEmojiEnd(raw: string): string {
  const emojiRegex = /\p{Extended_Pictographic}/gu;
  const found = raw.match(emojiRegex);
  if (!found?.length) return raw.trim();
  const textOnly = raw.replace(emojiRegex, '').replace(/\s+/g, ' ').trim();
  const emojis = [...new Set(found)].join('');
  return textOnly ? `${textOnly} ${emojis}` : emojis;
}

/** Prefer playlist artwork; fall back to first track thumb / legacy fields. */
export function curatedPlaylistCoverArt(playlist: {
  artwork?: string;
  thumbnailUrl?: string;
  eraArtwork?: string;
  tracks?: { thumbnailUrl?: string; artwork?: string }[];
}): string {
  const direct =
    playlist.artwork ||
    playlist.thumbnailUrl ||
    playlist.eraArtwork ||
    '';
  if (direct.trim()) return direct.trim();
  const t0 = playlist.tracks?.[0];
  return (t0?.artwork || t0?.thumbnailUrl || '').trim();
}

export type ShadowCuratedPlaylistCardProps = {
  title: string;
  artwork: string;
  /** OLED-style cover: white 900 title on #000 when set (skips bitmap). */
  oledTitle?: string;
  /** Hits / legacy era digit — grayscale editorial wash + magenta border. */
  editorialEra?: string | null;
  trackCount?: number;
  /** Shown when `trackCount` omitted (e.g. era subtitle). */
  subtitle?: string;
  badgeSource?: SourceCornerBadgeSource;
  onPress: () => void;
  /** Optional — e.g. play first track without blocking `onPress` (tap the glowing play). */
  onPlayPress?: () => void;
  /** Square cover width; height matches for aspect 1:1 */
  width: number;
  marginRight?: number;
  marginBottom?: number;
  containerRef?: React.Ref<View>;
  onContainerLayout?: (e: LayoutChangeEvent) => void;
  /** When this playlist is the source of the current track, border slowly pulses (Shadow chrome). */
  isActivePlaylist?: boolean;
  /** Static border (e.g. Machined Blue 1px) — skips editorial magenta / default hairline. */
  fixedBorderColor?: string;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const ShadowCuratedPlaylistCard = forwardRef<View, ShadowCuratedPlaylistCardProps>(
  function ShadowCuratedPlaylistCard(
    {
      title,
      artwork,
      oledTitle,
      editorialEra,
      trackCount,
      subtitle,
      badgeSource = 'youtube_music',
      onPress,
      onPlayPress,
      width,
      marginRight = 12,
      marginBottom = 0,
      containerRef,
      onContainerLayout,
      isActivePlaylist = false,
      fixedBorderColor,
    },
    ref,
  ) {
    const [pressing, setPressing] = useState(false);
    const pressed = useSharedValue(0);
    const pulse = useSharedValue(1);
    const activePlaylistSV = useSharedValue(0);
    const editorialBorderSV = useSharedValue(0);
    const borderPulse = useSharedValue(0);

    useEffect(() => {
      activePlaylistSV.value = isActivePlaylist ? 1 : 0;
    }, [isActivePlaylist, activePlaylistSV]);

    useAnimatedReaction(
      () => pressed.value,
      (v, prev) => {
        if (v === 1 && prev !== 1) {
          pulse.value = withRepeat(
            withSequence(
              withTiming(1.12, { duration: 320, easing: Easing.out(Easing.quad) }),
              withTiming(1, { duration: 320, easing: Easing.in(Easing.quad) }),
            ),
            -1,
            false,
          );
        } else if (v === 0 && prev === 1) {
          cancelAnimation(pulse);
          pulse.value = withTiming(1, { duration: 140 });
        }
      },
    );

    const overlayStyle = useAnimatedStyle(() => ({
      opacity: withTiming(pressed.value, { duration: 120 }),
    }));

    const playPulseStyle = useAnimatedStyle(() => ({
      transform: [{ scale: pulse.value }],
    }));

    const fixedBorder = fixedBorderColor?.trim() ?? '';

    const shellStyle = useAnimatedStyle(() => {
      if (activePlaylistSV.value === 1) {
        return {
          borderColor: interpolateColor(borderPulse.value, [0, 1], ['#FFFFFF10', '#FF00FF40']),
        };
      }
      if (fixedBorder.length > 0) {
        return { borderColor: fixedBorder };
      }
      if (editorialBorderSV.value === 1) {
        return { borderColor: '#FF00FF40' };
      }
      return { borderColor: BORDER_COLOR };
    }, [fixedBorder]);

    const displayTitle = playlistTitleEmojiEnd(title);
    const showOled = !!(oledTitle?.trim());
    const era = editorialEra?.trim() || '';
    const showEditorial = era.length > 0;
    const subRaw =
      trackCount !== undefined ? `${trackCount} songs` : subtitle ?? '';
    const subDisplay = subRaw.toUpperCase();

    const h = width;

    useEffect(() => {
      editorialBorderSV.value = showEditorial ? 1 : 0;
    }, [showEditorial, editorialBorderSV]);

    useEffect(() => {
      if (isActivePlaylist) {
        borderPulse.value = withRepeat(
          withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
          -1,
          true,
        );
      } else {
        cancelAnimation(borderPulse);
        borderPulse.value = 0;
      }
    }, [isActivePlaylist, borderPulse]);

    const mergeContainerRef = (node: View | null) => {
      if (typeof ref === 'function') ref(node);
      else if (ref && typeof ref === 'object' && 'current' in ref) {
        (ref as React.MutableRefObject<View | null>).current = node;
      }
      if (containerRef) {
        if (typeof containerRef === 'function') (containerRef as (n: View | null) => void)(node);
        else (containerRef as React.MutableRefObject<View | null>).current = node;
      }
    };

    return (
      <View
        ref={mergeContainerRef}
        collapsable={false}
        onLayout={onContainerLayout}
        style={{ width, marginRight, marginBottom }}
      >
        <AnimatedPressable
          onPress={onPress}
          onPressIn={() => {
            pressed.value = 1;
            setPressing(true);
          }}
          onPressOut={() => {
            pressed.value = 0;
            setPressing(false);
          }}
        >
          <Animated.View
            style={[
              {
                width,
                height: h,
                borderRadius: CARD_RADIUS,
                overflow: 'hidden',
                backgroundColor: '#0A0A0A',
                borderWidth: 1,
              },
              shellStyle,
            ]}
          >
            {showOled ? (
              <View
                style={{
                  width,
                  height: h,
                  backgroundColor: '#000000',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 10,
                }}
              >
                <Text
                  style={{
                    color: '#FFFFFF',
                    fontWeight: '900',
                    fontSize: Math.min(22, width * 0.11),
                    textAlign: 'center',
                    letterSpacing: -0.8,
                  }}
                  numberOfLines={4}
                >
                  {oledTitle!.trim()}
                </Text>
                {showEditorial ? (
                  <Text
                    style={{
                      position: 'absolute',
                      color: '#FFFFFF',
                      fontWeight: '900',
                      fontSize: width * 0.22,
                      letterSpacing: -3,
                    }}
                    pointerEvents="none"
                  >
                    {era}
                  </Text>
                ) : null}
              </View>
            ) : artwork ? (
              <>
                <View style={{ width, height: h, opacity: showEditorial ? 0.72 : 1 }}>
                  <ShadowArtworkImage
                    source={{ uri: artwork }}
                    style={{ width, height: h }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                </View>
                {showEditorial ? (
                  <>
                    <View
                      pointerEvents="none"
                      style={[
                        StyleSheet.absoluteFillObject,
                        { backgroundColor: 'rgba(150, 150, 158, 0.38)' },
                      ]}
                    />
                    <View
                      pointerEvents="none"
                      style={[
                        StyleSheet.absoluteFillObject,
                        { backgroundColor: 'rgba(6, 6, 8, 0.4)' },
                      ]}
                    />
                    <View
                      pointerEvents="none"
                      style={[
                        StyleSheet.absoluteFillObject,
                        { alignItems: 'center', justifyContent: 'center' },
                      ]}
                    >
                      <Text
                        style={{
                          color: '#FFFFFF',
                          fontWeight: '900',
                          fontSize: width * (era.length > 1 ? 0.22 : 0.28),
                          letterSpacing: -2,
                        }}
                      >
                        {era}
                      </Text>
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
            <LinearGradient
              colors={['transparent', '#000000CC']}
              locations={[0.45, 1]}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                height: h * 0.52,
              }}
              pointerEvents="none"
            />
            <View style={{ position: 'absolute', top: 8, right: 8 }} pointerEvents="none">
              <SourceCornerBadge source={badgeSource} />
            </View>
            <Animated.View
              pointerEvents="box-none"
              style={[
                StyleSheet.absoluteFillObject,
                { alignItems: 'center', justifyContent: 'center' },
                overlayStyle,
              ]}
            >
              <Pressable
                pointerEvents={onPlayPress && pressing ? 'auto' : 'none'}
                disabled={!onPlayPress || !pressing}
                onPress={() => {
                  onPlayPress?.();
                }}
                hitSlop={12}
              >
                <Animated.View
                  style={[
                    {
                      width: 52,
                      height: 52,
                      borderRadius: 26,
                      backgroundColor: 'rgba(255,255,255,0.38)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#D946EF',
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.65,
                      shadowRadius: 8,
                      elevation: 6,
                    },
                    playPulseStyle,
                  ]}
                >
                  <Play size={24} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
                </Animated.View>
              </Pressable>
            </Animated.View>
          </Animated.View>
        </AnimatedPressable>
        <Text
          style={{
            color: '#fff',
            fontSize: 16,
            fontWeight: '800',
            marginTop: 10,
            letterSpacing: -0.2,
          }}
          numberOfLines={2}
        >
          {displayTitle}
        </Text>
        {subDisplay ? (
          <Text
            style={{
              color: '#888888',
              fontSize: 12,
              fontWeight: '600',
              marginTop: 4,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
            numberOfLines={2}
          >
            {subDisplay}
          </Text>
        ) : null}
      </View>
    );
  },
);

interface PlaylistCardProps {
  playlist: Playlist;
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
}

const MOCK_DIM: Record<'small' | 'medium' | 'large', number> = {
  small: 120,
  medium: 160,
  large: 200,
};

/** Mock-data playlist tile — same Shadow curated chrome. */
export function PlaylistCard({ playlist, onPress, size = 'medium' }: PlaylistCardProps) {
  const w = MOCK_DIM[size];
  const playTrack = usePlaybackController(s => s.playTrack);
  const tracks = getTracksFromPlaylist(playlist.id);
  const art = playlist.artwork?.trim() || '';

  return (
    <ShadowCuratedPlaylistCard
      title={playlist.title}
      artwork={art}
      trackCount={playlist.trackCount}
      badgeSource="vybe"
      width={w}
      marginRight={12}
      onPress={onPress}
      onPlayPress={() => {
        if (tracks.length > 0) playTrack(tracks[0], tracks);
      }}
    />
  );
}
