import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Disc } from 'lucide-react-native';
import {
  coverArtUrl,
  getLibraryFeed,
  hasCredentials,
  isLossless,
  type LibraryFeed,
  type SubsonicAlbum,
  type SubsonicSong,
} from '@/lib/subsonic/subsonicClient';
import { useSubsonicStore } from '@/stores/subsonicStore';
import type { Track } from '@/types/music';
import { DOCK_CYAN } from '@/constants/machinedTheme';
import { logUiTap } from '@/lib/uiTapLog';
import { MachinedGradientText } from '@/components/MachinedGradientText';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { NavidromeConnectModal } from '@/components/library/NavidromeConnectModal';

const H_PAD = 20;
/** Larger tiles so Discover reads as a proper album-art rail on Pro Max. */
const ALBUM = 136;
const TRACK_ART = 88;

type PlayFn = (track: Track, queue?: Track[], options?: { expandNowPlaying?: boolean }) => Promise<void>;

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function DiscoverNavidromeRail({
  playTrack,
  refreshNonce = 0,
}: {
  playTrack: PlayFn;
  /** Increment (e.g. Discover pull-to-refresh) to refetch newest + shuffle picks. */
  refreshNonce?: number;
}) {
  const status = useSubsonicStore((s) => s.status);
  const credentialsRevision = useSubsonicStore((s) => s.credentialsRevision);
  const testConnection = useSubsonicStore((s) => s.testConnection);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [feed, setFeed] = useState<LibraryFeed>({ albums: [], songs: [], tracks: [] });
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /** After first completed fetch, pull-to-refresh refetches quietly (no full-section spinner). */
  const didAttemptFetchRef = useRef(false);

  useEffect(() => {
    if (status.kind === 'unknown' && hasCredentials()) void testConnection();
  }, [status.kind, testConnection]);

  const canFetch =
    hasCredentials() && status.kind !== 'unconfigured' && status.kind !== 'offline';

  useEffect(() => {
    if (!canFetch) return;
    let cancelled = false;
    const showSpinner = !didAttemptFetchRef.current;
    if (showSpinner) setLoading(true);
    (async () => {
      try {
        const next = await getLibraryFeed(14, 14);
        if (!cancelled) {
          setFeed(next);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      } finally {
        if (!cancelled) {
          didAttemptFetchRef.current = true;
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canFetch, status.kind, refreshNonce, credentialsRevision]);

  const connectModalEl = (
    <NavidromeConnectModal visible={showConnectModal} onDismiss={() => setShowConnectModal(false)} />
  );

  if (!hasCredentials()) {
    return (
      <>
        {connectModalEl}
        <View style={styles.section}>
          <MachinedGradientText
            neonGlow
            style={{
              fontSize: 12,
              fontWeight: '900',
              letterSpacing: 1.1,
              paddingHorizontal: H_PAD,
              marginBottom: 6,
              textTransform: 'uppercase',
            }}
          >
            Navidrome
          </MachinedGradientText>
          <Text style={styles.sectionSub}>Self-hosted Subsonic library</Text>
          <Pressable
            onPress={() => {
              logUiTap('Discover Navidrome', 'open_connect_modal');
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowConnectModal(true);
            }}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }]}
          >
            <Disc size={22} color={DOCK_CYAN} strokeWidth={2.2} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.ctaTitle}>Connect Navidrome</Text>
              <Text style={styles.ctaSub}>Tap to enter your server URL, username, and password — saved on this device.</Text>
            </View>
            <Text style={styles.ctaChevron}>›</Text>
          </Pressable>
        </View>
      </>
    );
  }

  if (status.kind === 'offline') {
    return (
      <>
        {connectModalEl}
        <View style={styles.section}>
        <MachinedGradientText
          neonGlow
          style={{
            fontSize: 12,
            fontWeight: '900',
            letterSpacing: 1.1,
            paddingHorizontal: H_PAD,
            marginBottom: 6,
            textTransform: 'uppercase',
          }}
        >
          Navidrome
        </MachinedGradientText>
        <Text style={styles.sectionSub}>Self-hosted Subsonic library</Text>
      <View style={styles.offline}>
        <Text style={styles.offlineTitle}>Navidrome offline</Text>
        <Text style={styles.offlineSub}>Check your tunnel or credentials, then retry.</Text>
        <Pressable
          onPress={() => {
            logUiTap('Discover Navidrome', 'retry_connection');
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            void testConnection();
          }}
          style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.retryLabel}>Retry</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            logUiTap('Discover Navidrome', 'open_connect_modal_offline');
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowConnectModal(true);
          }}
          style={({ pressed }) => [styles.retryBtn, { marginTop: 8 }, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.retryLabel}>Edit server…</Text>
        </Pressable>
      </View>
        </View>
      </>
    );
  }

  if (loading && !loaded) {
    return (
      <>
        {connectModalEl}
        <View style={styles.section}>
        <MachinedGradientText
          neonGlow
          style={{
            fontSize: 12,
            fontWeight: '900',
            letterSpacing: 1.1,
            paddingHorizontal: H_PAD,
            marginBottom: 6,
            textTransform: 'uppercase',
          }}
        >
          Navidrome
        </MachinedGradientText>
        <Text style={styles.sectionSub}>Self-hosted Subsonic library</Text>
      <View style={styles.loading}>
        <ActivityIndicator color={DOCK_CYAN} />
        <Text style={styles.loadingText}>Loading your library…</Text>
      </View>
        </View>
      </>
    );
  }

  if (loaded && feed.albums.length === 0 && feed.tracks.length === 0) {
    return showConnectModal ? <>{connectModalEl}</> : null;
  }

  const albumSlice = feed.albums.slice(0, 14);
  const trackSlice = feed.tracks
    .map((t, i) => ({ track: t, song: feed.songs[i] as SubsonicSong | undefined }))
    .slice(0, 12);
  const queue = feed.tracks;

  return (
    <>
      {connectModalEl}
      <View style={styles.section}>
        <MachinedGradientText
          neonGlow
          style={{
            fontSize: 12,
            fontWeight: '900',
            letterSpacing: 1.1,
            paddingHorizontal: H_PAD,
            marginBottom: 6,
            textTransform: 'uppercase',
          }}
        >
          Navidrome
        </MachinedGradientText>
        <Text style={styles.sectionSub}>Self-hosted Subsonic library</Text>
        <View style={styles.wrap}>
      {albumSlice.length > 0 ? (
        <>
          <Text style={styles.railCaption}>Newest in your library</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: H_PAD, gap: 10 }}
            style={{ flexGrow: 0, marginBottom: 14 }}
          >
            {albumSlice.map((a) => (
              <AlbumThumb key={a.id} album={a} />
            ))}
          </ScrollView>
        </>
      ) : null}

      {trackSlice.length > 0 ? (
        <>
          <Text style={styles.railCaption}>Shuffle picks</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: H_PAD, gap: 10, paddingBottom: 4 }}
            style={{ flexGrow: 0 }}
          >
            {trackSlice.map(({ track, song }) => (
              <Pressable
                key={track.id}
                onPress={() => {
                  logUiTap('Discover Navidrome', 'play_track');
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  void playTrack(track, queue);
                }}
                style={({ pressed }) => [styles.trackCard, pressed && { opacity: 0.88 }]}
              >
                {track.artwork ? (
                  <ShadowArtworkImage
                    source={{ uri: track.artwork }}
                    style={styles.trackImg}
                    contentFit="cover"
                    transition={120}
                  />
                ) : (
                  <View style={[styles.trackImg, styles.trackImgFallback]}>
                    <Disc size={26} color={DOCK_CYAN} strokeWidth={2} />
                  </View>
                )}
                <Text numberOfLines={2} style={styles.trackTitle}>
                  {track.title}
                </Text>
                <Text numberOfLines={1} style={styles.trackArtist}>
                  {track.artist}
                </Text>
                <View style={styles.trackMetaRow}>
                  {song && isLossless(song) ? (
                    <Text style={styles.lossless}>LOSSLESS</Text>
                  ) : (
                    <Text style={styles.trackDur}>{formatDuration(track.duration)}</Text>
                  )}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
        </View>
      </View>
    </>
  );
}

function AlbumThumb({ album }: { album: SubsonicAlbum }) {
  const coverId = album.coverArt ?? album.id;
  const art = coverId ? coverArtUrl(coverId, 512) : null;
  return (
    <View style={{ width: ALBUM }}>
      {art ? (
        <ShadowArtworkImage source={{ uri: art }} style={styles.albumImg} contentFit="cover" transition={120} />
      ) : (
        <View style={[styles.albumImg, styles.trackImgFallback]}>
          <Disc size={30} color={DOCK_CYAN} strokeWidth={2} />
        </View>
      )}
      <Text numberOfLines={1} style={styles.albumTitle}>
        {album.name}
      </Text>
      <Text numberOfLines={1} style={styles.albumArtist}>
        {album.artist}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 16,
  },
  sectionSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: H_PAD,
    marginBottom: 10,
  },
  wrap: {
    marginBottom: 4,
  },
  railCaption: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: H_PAD,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  cta: {
    marginHorizontal: H_PAD,
    marginBottom: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
  },
  ctaTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  ctaSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    lineHeight: 16,
  },
  ctaChevron: {
    color: DOCK_CYAN,
    fontSize: 22,
    fontWeight: '300',
    marginLeft: 4,
  },
  offline: {
    marginHorizontal: H_PAD,
    marginBottom: 4,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,59,48,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.35)',
  },
  offlineTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  offlineSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  retryLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: H_PAD,
    paddingVertical: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
  },
  albumImg: {
    width: ALBUM,
    height: ALBUM,
    borderRadius: 14,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
  },
  albumTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  albumArtist: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  trackCard: {
    width: 124,
  },
  trackImg: {
    width: TRACK_ART,
    height: TRACK_ART,
    borderRadius: 12,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
  },
  trackImgFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.08)',
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    minHeight: 32,
  },
  trackArtist: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  trackMetaRow: {
    marginTop: 4,
    minHeight: 16,
  },
  lossless: {
    color: DOCK_CYAN,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  trackDur: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
