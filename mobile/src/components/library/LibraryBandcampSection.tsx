/**
 * Library → Bandcamp fan collection (requires {@link getActiveBandcampIdentity}).
 */
import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { bandcampCollectionItemToTrack, resolveBandcampPreviewUrl } from '@/lib/bandcampService';
import { getActiveBandcampIdentity } from '@/lib/bandcampLocalConfig';
import { useBandcampCollectionStore } from '@/stores/bandcampCollectionStore';
import { usePlaybackController } from '@/stores/playbackController';
import { DOCK_CYAN } from '@/constants/machinedTheme';
import { SourceCornerBadge } from '@/components/SourceCornerBadge';

const HARDWARE_LIST_INSET = -8;
const ROW_H = 56;

export function LibraryBandcampSection() {
  const playTrack = usePlaybackController((s) => s.playTrack);
  const items = useBandcampCollectionStore((s) => s.items);
  const isSyncing = useBandcampCollectionStore((s) => s.isSyncing);
  const syncFromBandcamp = useBandcampCollectionStore((s) => s.syncFromBandcamp);

  useEffect(() => {
    if (!getActiveBandcampIdentity()) return;
    void syncFromBandcamp();
  }, [syncFromBandcamp]);

  if (!getActiveBandcampIdentity()) return null;

  if (isSyncing && items.length === 0) {
    return (
      <View style={[styles.bleed, { marginHorizontal: HARDWARE_LIST_INSET }]}>
        <ActivityIndicator color={DOCK_CYAN} />
        <Text style={styles.syncLabel}>Syncing Bandcamp collection…</Text>
      </View>
    );
  }

  if (items.length === 0) return null;

  return (
    <View style={{ marginTop: 18 }}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BANDCAMP</Text>
        <Text style={styles.headerSub}>Your collection</Text>
      </View>
      <View style={[styles.bleed, { marginHorizontal: HARDWARE_LIST_INSET }]}>
        {items.slice(0, 40).map((it) => (
          <Pressable
            key={it.id}
            onPress={async () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const base = bandcampCollectionItemToTrack(it);
              const preview = await resolveBandcampPreviewUrl(it.albumUrl);
              const track = preview ? { ...base, audioUrl: preview, duration: 120 } : base;
              void playTrack(track, [track]);
            }}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
          >
            <View style={styles.thumbWrap}>
              {it.artwork ? (
                <Image source={{ uri: it.artwork }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbFallback]} />
              )}
              <View style={{ position: 'absolute', top: 4, right: 4 }} pointerEvents="none">
                <SourceCornerBadge source="bandcamp" compact />
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={styles.title}>
                {it.title}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                {it.artist}
              </Text>
            </View>
            {it.hasFlacDownload ? (
              <View style={styles.vaultBadge}>
                <Text style={styles.vaultBadgeText}>VAULT_READY</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bleed: {
    alignSelf: 'stretch',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: ROW_H,
  },
  thumbWrap: {
    position: 'relative',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  thumbFallback: {
    backgroundColor: 'rgba(99,102,241,0.25)',
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  vaultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,229,255,0.55)',
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  vaultBadgeText: {
    color: DOCK_CYAN,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  syncLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    marginLeft: 8,
  },
});
