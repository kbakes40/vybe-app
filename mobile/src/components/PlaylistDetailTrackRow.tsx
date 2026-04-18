import React, { memo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Track } from '@/types/music';
import { DownloadButton } from '@/components/DownloadButton';
import { PreResolveOnView } from '@/components/PreResolveOnView';
import { SeekScrubBar } from '@/components/SeekScrubBar';

const NAVY_RULE = '#0A192F';
const ACTIVE_CYAN = '#00FFFF';

export type PlaylistDetailTrackRowProps = {
  track: Track;
  isActive: boolean;
  isBatchTarget: boolean;
  batchProgress: number;
  onPress: (t: Track) => void;
};

/**
 * Playlist row — deep-navy hairline separators, neon cyan when active,
 * shared SeekScrubBar (track-change → 0) when this row is playing.
 */
export const PlaylistDetailTrackRow = memo(function PlaylistDetailTrackRow({
  track,
  isActive,
  isBatchTarget,
  batchProgress,
  onPress,
}: PlaylistDetailTrackRowProps) {
  const { width: windowW } = useWindowDimensions();
  const pct = Math.round(batchProgress * 100);
  const scrubW = Math.max(120, windowW - 36);

  const onRowPress = useCallback(() => {
    onPress(track);
  }, [onPress, track]);

  return (
    <PreResolveOnView youtubeVideoId={track.youtubeMusicId ?? track.youtubeId}>
      <View style={styles.rowShell}>
        <Pressable
          onPress={onRowPress}
          style={[
            styles.pressable,
            isBatchTarget && styles.pressableBatch,
            isActive && styles.pressableActive,
          ]}
        >
          <Image
            source={{ uri: track.artwork }}
            style={styles.art}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={track.id}
            transition={120}
          />
          <View style={styles.textCol}>
            <Text
              style={[styles.title, isActive && styles.titleActive]}
              numberOfLines={1}
            >
              {track.title}
            </Text>
            <Text style={[styles.artist, isActive && styles.artistActive]} numberOfLines={1}>
              {track.artist}
            </Text>
            {isBatchTarget ? (
              <View style={styles.batchTrack}>
                <View style={[styles.batchFill, { width: `${Math.max(2, pct)}%` }]} />
              </View>
            ) : null}
          </View>
          <View style={styles.actionCol}>
            {isBatchTarget ? (
              <View style={styles.batchBadge}>
                <Text style={styles.batchBadgeText}>{pct}%</Text>
              </View>
            ) : (
              <DownloadButton track={track} size={26} idleColor="rgba(255,255,255,0.88)" />
            )}
          </View>
        </Pressable>
        {isActive ? (
          <View style={styles.scrubPad}>
            <SeekScrubBar width={scrubW} showTimes={false} />
          </View>
        ) : null}
      </View>
    </PreResolveOnView>
  );
});

const styles = StyleSheet.create({
  rowShell: {
    borderBottomWidth: 1,
    borderBottomColor: NAVY_RULE,
    backgroundColor: 'transparent',
  },
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    backgroundColor: 'transparent',
  },
  pressableBatch: {
    backgroundColor: 'rgba(139,92,246,0.1)',
  },
  pressableActive: {
    backgroundColor: 'rgba(0,255,255,0.06)',
  },
  art: {
    width: 52,
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(11, 23, 38, 0.9)',
  },
  textCol: {
    flex: 1,
    marginLeft: 14,
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 15,
  },
  titleActive: {
    color: ACTIVE_CYAN,
    fontWeight: '700',
  },
  artist: {
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '400',
    fontSize: 13,
    marginTop: 3,
  },
  artistActive: {
    color: 'rgba(0,255,255,0.75)',
  },
  batchTrack: {
    marginTop: 8,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(139,92,246,0.2)',
    overflow: 'hidden',
  },
  batchFill: {
    height: 3,
    backgroundColor: '#8B5CF6',
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
  scrubPad: {
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
});
