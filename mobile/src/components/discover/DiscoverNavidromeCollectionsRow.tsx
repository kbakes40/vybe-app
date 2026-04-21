import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  getAlbumList2,
  getAlbumPlaybackQueue,
  getCoverArtUrl,
  hasCredentials,
  type SubsonicAlbum,
} from '@/lib/subsonic/subsonicClient';
import { useSubsonicStore } from '@/stores/subsonicStore';
import type { Track } from '@/types/music';
import { MachinedGradientText } from '@/components/MachinedGradientText';
import { SourceCornerBadge } from '@/components/SourceCornerBadge';
import { logUiTap } from '@/lib/uiTapLog';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PAD = 20;
const CYAN_ENGINE = '#00E5FF';

const GEO_LABEL = Platform.select({
  ios: { fontFamily: 'SF Pro Text' },
  android: { fontFamily: 'sans-serif' },
});

type PlayFn = (track: Track, queue?: Track[], options?: { expandNowPlaying?: boolean }) => Promise<void>;

type CollectionSlot = 'newest' | 'random' | 'frequent';

type SlotAlbum = {
  slot: CollectionSlot;
  label: string;
  album: SubsonicAlbum;
  artworkUrl: string | null;
};

function pickFirstUnique(
  albums: SubsonicAlbum[],
  exclude: Set<string>,
): SubsonicAlbum | null {
  for (const a of albums) {
    if (a?.id && !exclude.has(a.id)) return a;
  }
  return albums[0] ?? null;
}

async function artworkForAlbum(a: SubsonicAlbum): Promise<string | null> {
  const coverId = a.coverArt ?? a.id;
  if (!coverId) return null;
  return getCoverArtUrl(coverId, 512);
}

/**
 * Three-up album row matching Discover “collections” cards — fed from Navidrome
 * (newest / random / frequent), tap plays the album from track one.
 */
export function DiscoverNavidromeCollectionsRow({
  playTrack,
  refreshNonce = 0,
}: {
  playTrack: PlayFn;
  refreshNonce?: number;
}) {
  const status = useSubsonicStore((s) => s.status);
  const credentialsRevision = useSubsonicStore((s) => s.credentialsRevision);
  const testConnection = useSubsonicStore((s) => s.testConnection);
  const [slots, setSlots] = useState<SlotAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const didAttemptRef = useRef(false);

  useEffect(() => {
    if (status.kind === 'unknown' && hasCredentials()) void testConnection();
  }, [status.kind, testConnection]);

  const canFetch =
    hasCredentials() && status.kind !== 'unconfigured' && status.kind !== 'offline';

  useEffect(() => {
    if (!canFetch) {
      setSlots([]);
      setLoaded(false);
      return;
    }
    let cancelled = false;
    const showSpinner = !didAttemptRef.current;
    if (showSpinner) setLoading(true);

    (async () => {
      try {
        const [newestRes, randomRes, frequentRes, starredRes] = await Promise.all([
          getAlbumList2('newest', 12),
          getAlbumList2('random', 12),
          getAlbumList2('frequent', 12),
          getAlbumList2('starred', 12),
        ]);
        if (cancelled) return;

        const used = new Set<string>();
        const rows: SlotAlbum[] = [];

        const pushSlot = async (slot: CollectionSlot, label: string, albums: SubsonicAlbum[]) => {
          const al = pickFirstUnique(albums, used);
          if (!al) return;
          used.add(al.id);
          const artworkUrl = await artworkForAlbum(al);
          if (cancelled) return;
          rows.push({ slot, label, album: al, artworkUrl });
        };

        if (newestRes.ok && newestRes.albums.length) {
          await pushSlot('newest', 'Newest', newestRes.albums);
        }
        if (randomRes.ok && randomRes.albums.length) {
          await pushSlot('random', 'Random', randomRes.albums);
        }
        if (frequentRes.ok && frequentRes.albums.length) {
          await pushSlot('frequent', 'Frequent', frequentRes.albums);
        } else if (starredRes.ok && starredRes.albums.length) {
          await pushSlot('frequent', 'Starred', starredRes.albums);
        }

        if (!cancelled) {
          setSlots(rows);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setSlots([]);
          setLoaded(true);
        }
      } finally {
        if (!cancelled) {
          didAttemptRef.current = true;
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canFetch, status.kind, refreshNonce, credentialsRevision]);

  if (!hasCredentials() || status.kind === 'offline' || status.kind === 'unconfigured') {
    return null;
  }

  if (loading && !loaded) {
    return (
      <View style={styles.marginBottom}>
        <MachinedGradientText
          neonGlow
          style={{
            fontSize: 12,
            fontWeight: '900',
            letterSpacing: 1.1,
            paddingHorizontal: H_PAD,
            marginBottom: 8,
            textTransform: 'uppercase',
          }}
        >
          Vault collections
        </MachinedGradientText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: H_PAD, paddingVertical: 12 }}>
          <ActivityIndicator color={CYAN_ENGINE} />
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' }}>Loading albums…</Text>
        </View>
      </View>
    );
  }

  if (!slots.length) return null;

  const gap = 10;
  const cardW = (SCREEN_W - H_PAD * 2 - gap * 2) / 3;
  const iconH = Math.min(112, Math.round(cardW * 1.05));
  const artBox = Math.min(cardW * 0.72, iconH * 0.72);

  const playAlbum = async (albumId: string) => {
    logUiTap('Vault collections', 'play_navidrome_album');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const queue = await getAlbumPlaybackQueue(albumId);
    if (queue.length === 0) return;
    await playTrack(queue[0], queue);
  };

  return (
    <View style={styles.marginBottom}>
      <MachinedGradientText
        neonGlow
        style={{
          fontSize: 12,
          fontWeight: '900',
          letterSpacing: 1.1,
          paddingHorizontal: H_PAD,
          marginBottom: 8,
          textTransform: 'uppercase',
        }}
      >
        Vault collections
      </MachinedGradientText>
      <Text style={styles.subtitle}>Albums from your Navidrome library</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: H_PAD }}
        style={{ flexGrow: 0 }}
      >
        {slots.map(({ slot, label, album, artworkUrl }) => (
          <Pressable
            key={`${slot}-${album.id}`}
            onPress={() => {
              void playAlbum(album.id);
            }}
            style={{
              width: cardW,
              marginRight: gap,
              borderRadius: 14,
              overflow: 'hidden',
              backgroundColor: '#000000',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.2)',
              paddingBottom: 12,
            }}
          >
            <View
              style={{
                width: cardW,
                height: iconH,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#000000',
              }}
            >
              <View style={{ position: 'absolute', top: 8, right: 8, zIndex: 2 }} pointerEvents="none">
                <SourceCornerBadge source="navidrome" />
              </View>
              {artworkUrl ? (
                <Image
                  source={{ uri: artworkUrl }}
                  style={{ width: artBox, height: artBox, borderRadius: 12 }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    width: artBox,
                    height: artBox,
                    borderRadius: 12,
                    backgroundColor: 'rgba(0,229,255,0.12)',
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: 'rgba(0,229,255,0.35)',
                  }}
                />
              )}
            </View>
            <Text
              style={{
                marginTop: 8,
                paddingHorizontal: 8,
                color: CYAN_ENGINE,
                fontSize: 10,
                fontWeight: '800',
                textAlign: 'center',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                ...GEO_LABEL,
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
            <Text
              style={{
                marginTop: 6,
                paddingHorizontal: 8,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 12,
                fontWeight: '700',
                textAlign: 'center',
                letterSpacing: 0.15,
                ...GEO_LABEL,
              }}
              numberOfLines={2}
            >
              {album.name}
            </Text>
            <Text
              style={{
                marginTop: 4,
                paddingHorizontal: 8,
                color: 'rgba(255,255,255,0.9)',
                fontSize: 12,
                fontWeight: '600',
                textAlign: 'center',
                ...GEO_LABEL,
              }}
              numberOfLines={1}
            >
              {album.artist}
            </Text>
            <Text
              style={{
                marginTop: 4,
                paddingHorizontal: 8,
                color: 'rgba(255,255,255,0.85)',
                fontSize: 11,
                fontWeight: '700',
                textAlign: 'center',
                ...GEO_LABEL,
              }}
              numberOfLines={1}
            >
              {album.songCount != null && album.songCount > 0 ? `${album.songCount} tracks` : 'Album'}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  marginBottom: {
    marginBottom: 14,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: H_PAD,
    marginBottom: 10,
  },
});
