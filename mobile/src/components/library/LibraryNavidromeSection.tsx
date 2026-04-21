/**
 * Library → Navidrome section.
 *
 * Renders the user's self-hosted music library (Subsonic/Navidrome over
 * Cloudflare tunnel) on the Library tab:
 *   - "Newest Albums" — horizontal rail of album tiles
 *   - "Random Tracks" — vertical list, LOSSLESS pill on FLAC/WAV/ALAC
 *
 * Renders nothing if credentials aren't set. Errors are swallowed so the rest
 * of the Library tab never crashes when the tunnel is down.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
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
import { usePlaybackController } from '@/stores/playbackController';
import type { Track } from '@/types/music';
import { DOCK_CYAN } from '@/constants/machinedTheme';

const ALBUM_TILE = 132;
const SOURCE_LABEL = 'LIBRARY';

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function LibraryNavidromeSection() {
  const status = useSubsonicStore((s) => s.status);
  const credentialsRevision = useSubsonicStore((s) => s.credentialsRevision);
  const [feed, setFeed] = useState<LibraryFeed>({ albums: [], songs: [], tracks: [] });
  const [loaded, setLoaded] = useState(false);

  const canFetch = hasCredentials() && (status.kind === 'connected' || status.kind === 'unknown');

  useEffect(() => {
    if (!canFetch) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await getLibraryFeed();
        if (!cancelled) {
          setFeed(next);
          setLoaded(true);
        }
      } catch {
        // best-effort — leave empty feed; Library badge surfaces the real status
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canFetch, credentialsRevision]);

  // Hide entirely when unconfigured — the connection badge already signals state.
  if (!hasCredentials()) return null;
  // Hide entirely when the ping says offline — again, the badge explains why.
  if (status.kind === 'offline') return null;
  // Pre-first-load render is fine to show empty scaffolds, but if we've loaded
  // and server returned nothing we hide to avoid a dead "Library" block.
  if (loaded && feed.albums.length === 0 && feed.tracks.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {feed.albums.length > 0 ? <AlbumRail albums={feed.albums} /> : null}
      {feed.tracks.length > 0 ? <TrackList tracks={feed.tracks} songs={feed.songs} /> : null}
    </View>
  );
}

function AlbumRail({ albums }: { albums: SubsonicAlbum[] }) {
  return (
    <View style={{ marginTop: 20 }}>
      <View style={styles.sectionHeader}>
        <Disc size={16} color={DOCK_CYAN} strokeWidth={2.4} />
        <Text style={styles.sectionTitle}>NEWEST</Text>
        <Text style={styles.sectionSub}>From your library</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        style={{ flexGrow: 0 }}
      >
        {albums.map((a) => (
          <AlbumTile key={a.id} album={a} />
        ))}
      </ScrollView>
    </View>
  );
}

function AlbumTile({ album }: { album: SubsonicAlbum }) {
  const coverId = album.coverArt ?? album.id;
  const art = coverId ? coverArtUrl(coverId, 512) : null;
  return (
    <Pressable
      accessibilityLabel={`${album.name} by ${album.artist}`}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        // TODO: open album detail once /rest/getAlbum is wired; for now this is
        // a visual surface only. The track list below is fully tap-to-play.
      }}
      style={({ pressed }) => [{ width: ALBUM_TILE }, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      {art ? (
        <Image
          source={{ uri: art }}
          style={styles.albumArt}
          contentFit="cover"
          transition={120}
        />
      ) : (
        <View style={[styles.albumArt, styles.albumArtFallback]}>
          <Disc size={36} color={DOCK_CYAN} strokeWidth={2} />
        </View>
      )}
      <Text numberOfLines={1} style={styles.albumTitle}>{album.name}</Text>
      <Text numberOfLines={1} style={styles.albumArtist}>{album.artist}</Text>
      <Text style={styles.sourceTag}>{SOURCE_LABEL}</Text>
    </Pressable>
  );
}

function TrackList({ tracks, songs }: { tracks: Track[]; songs: SubsonicSong[] }) {
  // Pair each Track with the source Subsonic song so we know FLAC/lossless.
  const rows = useMemo(
    () =>
      tracks.map((t, i) => ({
        track: t,
        song: songs[i],
      })),
    [tracks, songs],
  );

  return (
    <View style={{ marginTop: 22 }}>
      <View style={styles.sectionHeader}>
        <Disc size={16} color={DOCK_CYAN} strokeWidth={2.4} />
        <Text style={styles.sectionTitle}>FROM YOUR LIBRARY</Text>
        <Text style={styles.sectionSub}>Shuffle</Text>
      </View>
      <View>
        {rows.map(({ track, song }) => (
          <TrackRow key={track.id} track={track} song={song} queue={tracks} />
        ))}
      </View>
    </View>
  );
}

function TrackRow({ track, song, queue }: { track: Track; song: SubsonicSong | undefined; queue: Track[] }) {
  const lossless = song ? isLossless(song) : false;
  return (
    <Pressable
      accessibilityLabel={`Play ${track.title}`}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void usePlaybackController.getState().playTrack(track, queue);
      }}
      style={({ pressed }) => [styles.trackRow, pressed && { opacity: 0.7 }]}
    >
      {track.artwork ? (
        <Image source={{ uri: track.artwork }} style={styles.trackArt} contentFit="cover" transition={120} />
      ) : (
        <View style={[styles.trackArt, styles.albumArtFallback]}>
          <Disc size={18} color={DOCK_CYAN} strokeWidth={2} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.trackTitleRow}>
          <Text numberOfLines={1} style={styles.trackTitle}>{track.title}</Text>
          {lossless ? (
            <View style={styles.losslessPill}>
              <Text style={styles.losslessText}>LOSSLESS</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={1} style={styles.trackMeta}>
          {track.artist}{track.album ? ` · ${track.album}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.sourceTag}>{SOURCE_LABEL}</Text>
        {track.duration > 0 ? (
          <Text style={styles.trackDuration}>{formatDuration(track.duration)}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  sectionSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 6,
    letterSpacing: 0.4,
  },
  albumArt: {
    width: ALBUM_TILE,
    height: ALBUM_TILE,
    borderRadius: 12,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
  },
  albumArtFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.08)',
  },
  albumTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
  },
  albumArtist: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  sourceTag: {
    color: DOCK_CYAN,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.6,
    marginTop: 3,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  trackArt: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#0A0A0A',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
  },
  trackTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  losslessPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DOCK_CYAN,
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  losslessText: {
    color: DOCK_CYAN,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  trackMeta: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  trackDuration: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
});
