import React, { memo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { DownloadButton } from '@/components/DownloadButton';
import { PreResolveOnView } from '@/components/PreResolveOnView';
import { preResolveYoutubeVideoId } from '@/lib/youtubeResolvePreloadCache';
import { preResolveSoundcloudStreamUrl } from '@/lib/soundcloudStreamPreloadCache';
import type { Track } from '@/types/music';

const ROW_H = 72;
const ART = 52;

function warmDiscoverTrack(track: Track) {
  const ytid = track.youtubeMusicId ?? track.youtubeId;
  if (ytid) preResolveYoutubeVideoId(ytid);
  if (track.soundcloudUrl) preResolveSoundcloudStreamUrl(track.soundcloudUrl);
}

/** Minimal source puck: cyan = Vybe Music, orange = Vybe Waves — glow only, no logo artwork. */
function SourceGlowPuck({ source }: { source: Track['source'] }) {
  const waves = source === 'soundcloud';
  const color = waves ? '#FF7700' : '#00E5CC';
  return (
    <View
      style={[
        styles.puck,
        Platform.select({
          ios: {
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.9,
            shadowRadius: 5,
          },
          android: { elevation: 6 },
          default: {},
        }),
        { backgroundColor: color },
      ]}
    />
  );
}

export type PlaylistDiscoverMoreRowProps = {
  track: Track;
  isBatchTarget: boolean;
  batchProgress: number;
  onPress: (t: Track) => void;
};

export const PlaylistDiscoverMoreRow = memo(function PlaylistDiscoverMoreRow({
  track,
  isBatchTarget,
  batchProgress,
  onPress,
}: PlaylistDiscoverMoreRowProps) {
  const pct = Math.round(batchProgress * 100);

  const onPressIn = useCallback(() => {
    warmDiscoverTrack(track);
  }, [track]);

  return (
    <PreResolveOnView youtubeVideoId={track.youtubeMusicId ?? track.youtubeId}>
      <Pressable
        onPressIn={onPressIn}
        onPress={() => onPress(track)}
        style={[
          styles.pressable,
          isBatchTarget && { backgroundColor: 'rgba(139,92,246,0.12)' },
        ]}
      >
        <View style={styles.artWrap}>
          <ShadowArtworkImage
            source={{ uri: track.artwork }}
            style={{ width: ART, height: ART }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={track.id}
            transition={100}
          />
        </View>
        <View style={styles.textCol}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {track.title}
            </Text>
            <SourceGlowPuck source={track.source} />
          </View>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
          {isBatchTarget ? (
            <View style={styles.batchTrack}>
              <View style={{ height: 3, width: `${Math.max(2, pct)}%`, backgroundColor: '#8B5CF6' }} />
            </View>
          ) : null}
        </View>
        <View style={styles.actionCol}>
          {isBatchTarget ? (
            <View style={styles.batchBadge}>
              <Text style={styles.batchBadgeText}>{pct}%</Text>
            </View>
          ) : (
            <DownloadButton track={track} size={26} chrome="ghost" />
          )}
        </View>
      </Pressable>
    </PreResolveOnView>
  );
});

const styles = StyleSheet.create({
  pressable: {
    minHeight: ROW_H,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFFFFF10',
    backgroundColor: 'rgba(10,10,10,0.5)',
  },
  artWrap: {
    width: ART,
    height: ART,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFFFFF10',
    overflow: 'hidden',
  },
  textCol: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
    flex: 1,
    paddingRight: 8,
  },
  puck: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 2,
  },
  artist: {
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '400',
    fontSize: 13,
    marginTop: 4,
  },
  batchTrack: {
    marginTop: 8,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(139,92,246,0.2)',
    overflow: 'hidden',
  },
  actionCol: {
    padding: 4,
    minWidth: 44,
    alignItems: 'center',
  },
  batchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.2)',
  },
  batchBadgeText: {
    color: '#8B5CF6',
    fontSize: 11,
    fontWeight: '700',
  },
});
