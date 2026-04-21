import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  bandcampTagAlbumToTrack,
  fetchTrendingByTag,
  type BandcampTagAlbum,
} from '@/lib/bandcampService';
import { usePlaybackController } from '@/stores/playbackController';
import { MachinedGradientText } from '@/components/MachinedGradientText';
import { SourceCornerBadge } from '@/components/SourceCornerBadge';
import { DOCK_CYAN } from '@/constants/machinedTheme';
import { logUiTap } from '@/lib/uiTapLog';
import { useBandcampCollectionStore } from '@/stores/bandcampCollectionStore';

const H_PAD = 20;
/** Louis hardware gutter alignment — match playlist-detail / spec (−8pt). */
const HARDWARE_LIST_INSET = -8;
const TILE = 128;

type Props = {
  /** Discover vibe / genre chip slug → Bandcamp tag (e.g. electronic, jazz). */
  tag?: string;
  /** Optional second tag — merged into the same rail for more albums/previews. */
  mergeTag?: string;
  refreshNonce?: number;
};

export function DiscoverBandcampRail({ tag = 'electronic', mergeTag, refreshNonce = 0 }: Props) {
  const playTrack = usePlaybackController((s) => s.playTrack);
  const collectionItems = useBandcampCollectionStore((s) => s.items);
  const [rows, setRows] = useState<BandcampTagAlbum[]>([]);
  const [loading, setLoading] = useState(true);

  const collectionFlacByUrl = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const it of collectionItems) {
      const u = it.albumUrl.replace(/\/$/, '').toLowerCase();
      if (!u) continue;
      m.set(u, !!it.hasFlacDownload);
    }
    return m;
  }, [collectionItems]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchTrendingByTag(tag, {
        mergeTag: mergeTag?.trim() || undefined,
        maxAlbumUrls: 34,
      });
      setRows(next);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tag, mergeTag]);

  useEffect(() => {
    void load();
  }, [load, refreshNonce]);

  if (loading && rows.length === 0) {
    return (
      <View style={styles.section}>
        <MachinedGradientText neonGlow style={styles.sectionTitle}>
          Bandcamp
        </MachinedGradientText>
        <Text style={styles.sub}>
          {mergeTag?.trim() ? 'Two tag charts · preview streams' : 'Tag charts · preview streams'}
        </Text>
        <View style={[styles.hardwareBleed, { marginHorizontal: HARDWARE_LIST_INSET }]}>
          <ActivityIndicator color={DOCK_CYAN} style={{ marginVertical: 16 }} />
        </View>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.section}>
        <MachinedGradientText neonGlow style={styles.sectionTitle}>
          Bandcamp
        </MachinedGradientText>
        <Text style={styles.sub}>Could not load previews — pull to refresh</Text>
      </View>
    );
  }

  const queue = rows.map((r) => {
    const key = r.albumUrl.replace(/\/$/, '').toLowerCase();
    const vaultReady = collectionFlacByUrl.get(key) === true;
    return bandcampTagAlbumToTrack(r, vaultReady);
  });

  return (
    <View style={styles.section}>
      <MachinedGradientText neonGlow style={styles.sectionTitle}>
        Bandcamp
      </MachinedGradientText>
      <Text style={styles.sub}>
        {mergeTag?.trim() ? 'Two tag charts · preview streams' : 'Tag charts · preview streams'}
      </Text>
      <View style={[styles.hardwareBleed, { marginHorizontal: HARDWARE_LIST_INSET }]}>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 8, gap: 10, paddingBottom: 4 }}
          style={{ flexGrow: 0 }}
        >
          {rows.map((r) => {
            const key = r.albumUrl.replace(/\/$/, '').toLowerCase();
            const vaultReady = collectionFlacByUrl.get(key) === true;
            const track = bandcampTagAlbumToTrack(r, vaultReady);
            const self = queue.find((q) => q.id === track.id) ?? track;
            return (
              <Pressable
                key={r.id}
                onPress={() => {
                  logUiTap('Discover Bandcamp', 'play_preview');
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  void playTrack(self, queue);
                }}
                style={({ pressed }) => [{ width: TILE, opacity: pressed ? 0.88 : 1 }]}
              >
                <View style={styles.tileFrame}>
                  <View style={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }} pointerEvents="none">
                    <SourceCornerBadge source="bandcamp" />
                  </View>
                  {r.artUrl ? (
                    <Image source={{ uri: r.artUrl }} style={styles.art} contentFit="cover" />
                  ) : (
                    <View style={[styles.art, styles.artFallback]} />
                  )}
                </View>
                <Text numberOfLines={2} style={styles.tileTitle}>
                  {r.albumTitle}
                </Text>
                <Text numberOfLines={1} style={styles.tileArtist}>
                  {r.artistName}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    paddingHorizontal: H_PAD,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  sub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: H_PAD,
    marginBottom: 10,
  },
  hardwareBleed: {
    alignSelf: 'stretch',
  },
  tileFrame: {
    width: TILE,
    height: TILE,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  art: {
    width: TILE,
    height: TILE,
  },
  artFallback: {
    backgroundColor: 'rgba(99,102,241,0.2)',
  },
  tileTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    width: TILE,
  },
  tileArtist: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    width: TILE,
  },
});
