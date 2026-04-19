import React, { memo, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { Track } from '@/types/music';
import { DownloadButton } from '@/components/DownloadButton';
import { PreResolveOnView } from '@/components/PreResolveOnView';
import { preResolveYoutubeVideoId } from '@/lib/youtubeResolvePreloadCache';
import { preResolveSoundcloudStreamUrl } from '@/lib/soundcloudStreamPreloadCache';

const ROW_H = 72;
const ART = 52;

export type PlaylistDetailTrackRowProps = {
  track: Track;
  isActive: boolean;
  isBatchTarget: boolean;
  batchProgress: number;
  onPress: (t: Track) => void;
};

function warmTrackPlayback(track: Track) {
  if (track.externalHandoffUrl?.trim()) return;
  const ytid = track.youtubeMusicId ?? track.youtubeId;
  if (ytid) preResolveYoutubeVideoId(ytid);
  if (track.soundcloudUrl) preResolveSoundcloudStreamUrl(track.soundcloudUrl);
}

/**
 * Memoized row — 72px editorial layout, pre-warm on touch-down for instant playback.
 */
export const PlaylistDetailTrackRow = memo(function PlaylistDetailTrackRow({
  track,
  isActive,
  isBatchTarget,
  batchProgress,
  onPress,
}: PlaylistDetailTrackRowProps) {
  const pct = Math.round(batchProgress * 100);

  const onPressIn = useCallback(() => {
    warmTrackPlayback(track);
  }, [track]);

  const handoff = !!track.externalHandoffUrl?.trim();

  const inner = (
      <Pressable
        unstable_pressDelay={0}
        onPressIn={onPressIn}
        onPress={() => {
          if (handoff && track.externalHandoffUrl) {
            void Linking.openURL(track.externalHandoffUrl.trim());
            return;
          }
          onPress(track);
        }}
        style={{
          minHeight: ROW_H,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 10,
          paddingHorizontal: 8,
          borderRadius: 8,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: 'rgba(255,255,255,0.06)',
          backgroundColor: isBatchTarget
            ? 'rgba(139,92,246,0.12)'
            : isActive
              ? 'rgba(255,255,255,0.06)'
              : 'transparent',
          marginBottom: 4,
        }}
      >
        <View
          style={{
            width: ART,
            height: ART,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: '#FFFFFF10',
            overflow: 'hidden',
          }}
        >
          <ShadowArtworkImage
            source={{ uri: track.artwork }}
            style={{ width: ART, height: ART }}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={track.id}
            transition={100}
          />
        </View>
        <View style={{ flex: 1, marginLeft: 14, justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
            {track.title}
          </Text>
          <Text
            style={{ color: 'rgba(255,255,255,0.45)', fontWeight: '400', fontSize: 13, marginTop: 4 }}
            numberOfLines={1}
          >
            {track.artist}
          </Text>
          {isBatchTarget ? (
            <View
              style={{
                marginTop: 8,
                height: 3,
                borderRadius: 2,
                backgroundColor: 'rgba(139,92,246,0.2)',
                overflow: 'hidden',
              }}
            >
              <View style={{ height: 3, width: `${Math.max(2, pct)}%`, backgroundColor: '#8B5CF6' }} />
            </View>
          ) : null}
        </View>
        <View style={{ padding: 4, minWidth: 44, alignItems: 'center' }}>
          {isBatchTarget ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 12,
                backgroundColor: 'rgba(139,92,246,0.2)',
              }}
            >
              <Text style={{ color: '#8B5CF6', fontSize: 11, fontWeight: '700' }}>{pct}%</Text>
            </View>
          ) : handoff ? null : (
            <DownloadButton track={track} size={26} idleColor="rgba(255,255,255,0.88)" />
          )}
        </View>
      </Pressable>
  );

  if (handoff) return inner;
  return (
    <PreResolveOnView youtubeVideoId={track.youtubeMusicId ?? track.youtubeId}>
      {inner}
    </PreResolveOnView>
  );
});
