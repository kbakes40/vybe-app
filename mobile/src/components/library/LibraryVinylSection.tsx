/**
 * Library → Vinyl shelf: curated “LP” picks (circular art) for front-to-back
 * listening; uses {@link tracks} from mock data so taps always resolve.
 */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Disc3, Play } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { tracks } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';
import type { Track } from '@/types/music';
import { SourceCornerBadge } from '@/components/SourceCornerBadge';

/** Warm wax accent — distinct from radio cyan / Bandcamp stack. */
const WAX_GOLD = '#E8B86D';
const WAX_GOLD_DIM = 'rgba(232, 184, 109, 0.35)';

/** Stable order for the horizontal shelf + skip queue. */
const VINYL_PICK_IDS: readonly string[] = [
  'ytm1',
  'ytm3',
  'ytm5',
  'yt2',
  'yt4',
  'sc2',
  'sc4',
  'ytm12',
  'ytm8',
  'yt7',
];

export function LibraryVinylSection() {
  const playTrack = usePlaybackController((s) => s.playTrack);

  const vinylQueue = useMemo(() => {
    const out: Track[] = [];
    for (const id of VINYL_PICK_IDS) {
      const t = tracks.find((x) => x.id === id);
      if (t) out.push(t);
    }
    return out;
  }, []);

  if (vinylQueue.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Disc3 size={16} color={WAX_GOLD} strokeWidth={2.4} />
        <Text style={styles.sectionTitle}>VINYL</Text>
        <Text style={styles.sectionSub}>Front-to-back picks</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {vinylQueue.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            accessibilityLabel={`Play ${t.album} by ${t.artist}`}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              void playTrack(t, vinylQueue);
            }}
            style={({ pressed }) => [styles.tileCol, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.outerRing}>
              <LinearGradient
                colors={['rgba(232,184,109,0.22)', '#0d0d0d']}
                start={{ x: 0.35, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={styles.gradientRing}
              >
                <View style={styles.innerWell}>
                  <Image source={{ uri: t.artwork }} style={styles.discArt} contentFit="cover" />
                  <View style={styles.badgeCorner} pointerEvents="none">
                    <SourceCornerBadge source={t.source} compact />
                  </View>
                  <View style={styles.playHalo} pointerEvents="none">
                    <Play size={22} color={WAX_GOLD} fill="#1a1208" style={{ marginLeft: 3 }} />
                  </View>
                </View>
              </LinearGradient>
            </View>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.albumTitle}>
              {t.album}
            </Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.artist}>
              {t.artist}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const DISC = 112;

const styles = StyleSheet.create({
  wrap: {
    marginTop: 22,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  sectionSub: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 16,
    alignItems: 'flex-start',
  },
  tileCol: {
    width: DISC + 8,
    alignItems: 'center',
  },
  outerRing: {
    borderRadius: (DISC + 14) / 2,
    padding: 3,
    borderWidth: 1,
    borderColor: WAX_GOLD_DIM,
    backgroundColor: '#080808',
  },
  gradientRing: {
    width: DISC + 8,
    height: DISC + 8,
    borderRadius: (DISC + 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerWell: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.55)',
  },
  discArt: {
    width: '100%',
    height: '100%',
  },
  badgeCorner: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  playHalo: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: WAX_GOLD_DIM,
  },
  albumTitle: {
    marginTop: 10,
    color: WAX_GOLD,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    width: DISC + 12,
  },
  artist: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    width: DISC + 12,
  },
});
