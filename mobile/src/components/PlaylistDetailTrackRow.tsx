import React, { memo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Track } from '@/types/music';
import { DownloadButton } from '@/components/DownloadButton';
import { PreResolveOnView } from '@/components/PreResolveOnView';

export type PlaylistDetailTrackRowProps = {
  track: Track;
  isActive: boolean;
  isBatchTarget: boolean;
  batchProgress: number;
  onPress: (t: Track) => void;
};

/**
 * Memoized row for playlist track lists — avoids re-rendering the whole list when artwork caches.
 * Uses expo-image (disk + memory cache) with recyclingKey for list performance.
 */
export const PlaylistDetailTrackRow = memo(function PlaylistDetailTrackRow({
  track,
  isActive,
  isBatchTarget,
  batchProgress,
  onPress,
}: PlaylistDetailTrackRowProps) {
  const pct = Math.round(batchProgress * 100);
  return (
    <PreResolveOnView youtubeVideoId={track.youtubeMusicId ?? track.youtubeId}>
      <Pressable
        onPress={() => onPress(track)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 14,
          paddingHorizontal: 6,
          borderRadius: 10,
          borderWidth: 0.5,
          borderColor: 'rgba(212, 175, 55, 0.12)',
          backgroundColor: isBatchTarget
            ? 'rgba(139,92,246,0.12)'
            : isActive
              ? 'rgba(255,255,255,0.07)'
              : 'transparent',
          marginBottom: 6,
        }}
      >
        <Image
          source={{ uri: track.artwork }}
          style={{ width: 52, height: 52, borderRadius: 8 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={track.id}
          transition={120}
        />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={{ color: '#999999', fontWeight: '400', fontSize: 13, marginTop: 3 }} numberOfLines={1}>
            {track.artist}
          </Text>
          {isBatchTarget ? (
            <View style={{ marginTop: 8, height: 3, borderRadius: 2, backgroundColor: 'rgba(139,92,246,0.2)', overflow: 'hidden' }}>
              <View style={{ height: 3, width: `${Math.max(2, pct)}%`, backgroundColor: '#8B5CF6' }} />
            </View>
          ) : null}
        </View>
        <View style={{ padding: 4, minWidth: 44, alignItems: 'center' }}>
          {isBatchTarget ? (
            <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: 'rgba(139,92,246,0.2)' }}>
              <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
            </View>
          ) : (
            <DownloadButton track={track} size={26} idleColor="rgba(255,255,255,0.88)" />
          )}
        </View>
      </Pressable>
    </PreResolveOnView>
  );
});
