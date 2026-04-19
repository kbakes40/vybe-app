import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Animated,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Play } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useGenreSearch } from '@/hooks/useGenreSearch';
import { usePlaybackController } from '@/stores/playbackController';
import { PreResolveOnView, PreResolveSoundcloudOnView } from '@/components/PreResolveOnView';
import type { Track } from '@/types/music';
import { NeonVybeSearchSectionHeader } from '@/components/SearchResults';
import { tabScreenContentContainerPaddingBottom } from '@/constants/Layout';
const MUSIC_CARD = 132;
const VIDEO_W = 200;
const VIDEO_H = Math.round((VIDEO_W * 9) / 16);

function genreNeonColor(name: string): string {
  const k = name.toLowerCase();
  if (k.includes('pop')) return '#22D3EE';
  if (k.includes('hip')) return '#FBBF24';
  if (k.includes('electronic') || k.includes('edm')) return '#E879F9';
  if (k.includes('r&b') || k.includes('rnb')) return '#FB7185';
  if (k.includes('rock')) return '#F87171';
  if (k.includes('jazz')) return '#F59E0B';
  if (k.includes('classical')) return '#A78BFA';
  if (k.includes('lo-fi') || k.includes('lofi')) return '#2DD4BF';
  if (k.includes('ai')) return '#C084FC';
  if (k.includes('throw')) return '#FB923C';
  return '#8B5CF6';
}

function ShadowSkeletonTile({ w, h, r }: { w: number; h: number; r: number }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const bg = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['#0A0A0A', '#111111'],
  });
  return (
    <View style={{ width: w, marginRight: 12 }}>
      <Animated.View style={{ width: w, height: h, borderRadius: r, backgroundColor: bg }} />
      <View style={styles.skeletonBarTrack}>
        <LinearGradient
          colors={['#8B5CF6', '#D946EF', '#FF00FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

function Reveal({ show, children: inner }: { show: boolean; children: React.ReactNode }) {
  const op = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!show) return;
    op.setValue(0);
    ty.setValue(20);
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 360, useNativeDriver: true }),
    ]).start();
  }, [show, op, ty]);

  if (!show) return null;
  return (
    <Animated.View style={{ opacity: op, transform: [{ translateY: ty }] }}>{inner}</Animated.View>
  );
}

type Props = { genre: string; onBack: () => void };

export function GenreDiscoverContent({ genre, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { ytMusic, youtube, soundcloud, loading } = useGenreSearch(genre);
  const playTrack = usePlaybackController((s) => s.playTrack);
  const neon = genreNeonColor(genre);
  const title = genre.toUpperCase();

  const playHeavy = (track: Track, queue: Track[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    void playTrack(track, queue, { expandNowPlaying: true });
  };

  const playPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(playPulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(playPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [playPulse]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: tabScreenContentContainerPaddingBottom(insets.bottom) }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <Pressable onPress={onBack} style={styles.backGhost} hitSlop={16}>
          <ChevronLeft size={28} color="rgba(255,255,255,0.55)" strokeWidth={2.2} />
        </Pressable>
        <Text
          style={[
            styles.heroTitle,
            {
              textShadowColor: neon,
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: Platform.OS === 'ios' ? 18 : 12,
            },
          ]}
        >
          {title}
        </Text>
        <Text style={styles.heroSub}>Discovery engine — three signals at once</Text>
      </View>

      {/* Vybe Music */}
      <View style={styles.section}>
        <NeonVybeSearchSectionHeader variant="music" subtitle="YouTube Music engine" />
        {loading.music && ytMusic.length === 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hRow}>
            {[0, 1, 2, 3].map((i) => (
              <ShadowSkeletonTile key={i} w={MUSIC_CARD} h={MUSIC_CARD} r={10} />
            ))}
          </ScrollView>
        ) : (
          <Reveal key={`${genre}-m`} show={ytMusic.length > 0}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hRow}>
              {ytMusic.map((track) => {
                const vid = track.youtubeMusicId ?? track.youtubeId;
                return (
                  <PreResolveOnView key={track.id} youtubeVideoId={vid} style={{ marginRight: 12 }}>
                    <Pressable onPress={() => playHeavy(track, ytMusic)} style={{ width: MUSIC_CARD }}>
                      <View style={styles.musicCard}>
                        {track.artwork ? (
                          <Image
                            source={{ uri: track.artwork }}
                            style={styles.musicArt}
                            contentFit="cover"
                          />
                        ) : null}
                      </View>
                      <Text style={styles.cardMeta} numberOfLines={2}>
                        {track.title}
                      </Text>
                      <Text style={styles.cardArtist} numberOfLines={1}>
                        {track.artist}
                      </Text>
                    </Pressable>
                  </PreResolveOnView>
                );
              })}
            </ScrollView>
          </Reveal>
        )}
        {!loading.music && ytMusic.length === 0 ? (
          <Text style={styles.empty}>No audio results</Text>
        ) : null}
      </View>

      {/* Vybe Video */}
      <View style={styles.section}>
        <NeonVybeSearchSectionHeader variant="video" subtitle="YouTube playback" />
        {loading.video && youtube.length === 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hRow}>
            {[0, 1, 2].map((i) => (
              <ShadowSkeletonTile key={i} w={VIDEO_W} h={VIDEO_H} r={10} />
            ))}
          </ScrollView>
        ) : (
          <Reveal key={`${genre}-v`} show={youtube.length > 0}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hRow}>
              {youtube.map((track) => (
                <PreResolveOnView
                  key={track.id}
                  youtubeVideoId={track.youtubeId ?? track.youtubeMusicId}
                  style={{ marginRight: 12 }}
                >
                  <Pressable onPress={() => playHeavy(track, youtube)} style={{ width: VIDEO_W }}>
                    <View style={styles.videoCard}>
                      {track.artwork ? (
                        <Image
                          source={{ uri: track.artwork }}
                          style={styles.videoArt}
                          contentFit="cover"
                        />
                      ) : null}
                      <View style={styles.videoDim}>
                        <Animated.View style={{ transform: [{ scale: playPulse }] }}>
                          <View style={styles.playCircle}>
                            <Play size={22} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 3 }} />
                          </View>
                        </Animated.View>
                      </View>
                    </View>
                    <Text style={styles.cardMeta} numberOfLines={2}>
                      {track.title}
                    </Text>
                  </Pressable>
                </PreResolveOnView>
              ))}
            </ScrollView>
          </Reveal>
        )}
        {!loading.video && youtube.length === 0 ? (
          <Text style={styles.empty}>No video results</Text>
        ) : null}
      </View>

      {/* Vybe Waves */}
      <View style={styles.section}>
        <NeonVybeSearchSectionHeader variant="waves" subtitle="SoundCloud discovery" />
        {loading.waves && soundcloud.length === 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hRow}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={{ marginRight: 14, alignItems: 'center' }}>
                <ShadowSkeletonTile w={88} h={88} r={44} />
              </View>
            ))}
          </ScrollView>
        ) : (
          <Reveal key={`${genre}-w`} show={soundcloud.length > 0}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hRow}>
              {soundcloud.map((track, idx) => (
                <PreResolveSoundcloudOnView
                  key={track.id}
                  soundcloudUrl={track.soundcloudUrl}
                  style={{ marginRight: 16, alignItems: 'center', width: 96 }}
                >
                  <Pressable
                    onPress={() => playHeavy(track, soundcloud)}
                    style={{ alignItems: 'center', width: 96 }}
                  >
                    <View style={idx < 3 ? styles.waveLiveRing : styles.waveRing}>
                      <View style={styles.waveInner}>
                        {track.artwork ? (
                          <Image
                            source={{ uri: track.artwork }}
                            style={styles.waveArt}
                            contentFit="cover"
                          />
                        ) : (
                          <View style={[styles.waveArt, styles.waveFallback]} />
                        )}
                      </View>
                    </View>
                    <Text style={styles.waveTitle} numberOfLines={2}>
                      {track.title}
                    </Text>
                  </Pressable>
                </PreResolveSoundcloudOnView>
              ))}
            </ScrollView>
          </Reveal>
        )}
        {!loading.waves && soundcloud.length === 0 ? (
          <Text style={styles.empty}>No community picks</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
    alignItems: 'center',
  },
  backGhost: {
    position: 'absolute',
    left: 4,
    top: 0,
    zIndex: 2,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1.5,
    textAlign: 'center',
    marginTop: 8,
  },
  heroSub: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.38)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: 28,
  },
  hRow: {
    flexGrow: 0,
    paddingLeft: 20,
    paddingRight: 8,
  },
  skeletonBarTrack: {
    marginTop: 10,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  musicCard: {
    width: MUSIC_CARD,
    height: MUSIC_CARD,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.26)',
    borderLeftColor: 'rgba(255,255,255,0.18)',
    borderRightColor: 'rgba(0,0,0,0.55)',
    borderBottomColor: 'rgba(0,0,0,0.65)',
  },
  musicArt: {
    width: '100%',
    height: '100%',
  },
  videoCard: {
    width: VIDEO_W,
    height: VIDEO_H,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.22)',
    borderLeftColor: 'rgba(255,255,255,0.14)',
    borderRightColor: 'rgba(0,0,0,0.5)',
    borderBottomColor: 'rgba(0,0,0,0.6)',
  },
  videoArt: {
    width: '100%',
    height: '100%',
  },
  videoDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMeta: {
    marginTop: 8,
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
    maxWidth: VIDEO_W,
  },
  cardArtist: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
    maxWidth: MUSIC_CARD,
  },
  waveRing: {
    padding: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  waveLiveRing: {
    padding: 2,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#FF00FF',
    shadowColor: '#FF00FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
  },
  waveInner: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  waveArt: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  waveFallback: {
    backgroundColor: '#1A1A1A',
  },
  waveTitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 96,
  },
  empty: {
    paddingHorizontal: 24,
    color: 'rgba(255,255,255,0.28)',
    fontSize: 13,
    fontWeight: '600',
  },
});
