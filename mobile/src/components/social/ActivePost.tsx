import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import type { ActivePostItem } from '@/types/socialActivity';
import type { Track } from '@/types/music';
import { MagentaLikeBurst } from '@/components/social/MagentaLikeBurst';
import { FireReactionButton, CyanSpeakerReactionButton } from '@/components/social/SocialReactionEngines';
import { getTrackById } from '@/data/mockData';
import { usePlaybackController } from '@/stores/playbackController';

const OLED = '#000000';
const BORDER = 'rgba(255,255,255,0.082)'; // ~#FFFFFF15

function resolveTrack(ref: ActivePostItem['track']): Track {
  const found = getTrackById(ref.id);
  if (found) return found;
  return {
    id: ref.id,
    title: ref.title,
    artist: ref.artist,
    artistId: 'social',
    album: '',
    albumId: '',
    artwork: ref.artwork ?? '',
    duration: 200,
    isLiked: false,
    source: ref.source ?? 'youtube',
    youtubeId: ref.youtubeId,
    youtubeMusicId: ref.youtubeMusicId,
    soundcloudUrl: ref.soundcloudUrl,
  };
}

type Props = {
  post: ActivePostItem;
  onToggleHeart: (postId: string) => void;
  onBumpReaction: (postId: string, kind: 'flame' | 'speaker') => void;
};

export function ActivePost({ post, onToggleHeart, onBumpReaction }: Props) {
  const playTrack = usePlaybackController((s) => s.playTrack);

  const playNow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const t = resolveTrack(post.track);
    void playTrack(t, [t], { expandNowPlaying: true });
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatarCol}>
          {post.isLiveListening ? (
            <View style={styles.liveRing}>
              <View style={styles.liveInner}>
                {post.avatarUrl ? (
                  <Image source={{ uri: post.avatarUrl }} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <View style={[styles.avatarImg, styles.avatarFallback]}>
                    <Text style={styles.avatarLetter}>{post.userName.charAt(0)}</Text>
                  </View>
                )}
              </View>
            </View>
          ) : post.avatarUrl ? (
            <Image source={{ uri: post.avatarUrl }} style={styles.avatarImgFlat} contentFit="cover" />
          ) : (
            <View style={[styles.avatarImgFlat, styles.avatarFallback]}>
              <Text style={styles.avatarLetter}>{post.userName.charAt(0)}</Text>
            </View>
          )}
          {post.isLiveListening ? (
            <View style={styles.livePill}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.headerText}>
          <Text style={styles.userName}>{post.userName}</Text>
          <Text style={styles.subLabel}>{post.isLiveListening ? 'Listening now' : 'Shared a Vybe'}</Text>
        </View>
      </View>

      {post.vybeNote ? (
        <Text style={styles.note} numberOfLines={4}>
          {post.vybeNote.slice(0, 140)}
        </Text>
      ) : null}

      <Pressable onPress={playNow} style={styles.miniPlayer}>
        <Image
          source={{ uri: post.track.artwork ?? '' }}
          style={styles.artwork}
          contentFit="cover"
        />
        <View style={styles.trackMeta}>
          <Text style={styles.trackTitle} numberOfLines={1}>
            {post.track.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {post.track.artist}
          </Text>
        </View>
        <View style={styles.playFab}>
          <Text style={styles.playTri}>▶</Text>
        </View>
      </Pressable>

      <View style={styles.reactRow}>
        <FireReactionButton
          count={post.reactions.flame}
          onPress={() => onBumpReaction(post.id, 'flame')}
        />
        <View style={styles.reactCenter}>
          <MagentaLikeBurst liked={post.likedByMe} onToggle={() => onToggleHeart(post.id)} />
          <Text style={[styles.reactCount, styles.reactCountAfterIcon]}>{post.reactions.heart}</Text>
        </View>
        <CyanSpeakerReactionButton
          count={post.reactions.speaker}
          onPress={() => onBumpReaction(post.id, 'speaker')}
        />
      </View>
    </View>
  );
}

const LIVE_MAGENTA = '#FF00FF';

const styles = StyleSheet.create({
  card: {
    backgroundColor: OLED,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarCol: {
    marginRight: 12,
    alignItems: 'center',
  },
  liveRing: {
    padding: 2,
    borderRadius: 999,
    backgroundColor: LIVE_MAGENTA,
    shadowColor: LIVE_MAGENTA,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 10,
    ...Platform.select({ android: { elevation: 10 }, default: {} }),
  },
  liveInner: {
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarImgFlat: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 18,
    fontWeight: '800',
  },
  livePill: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,0,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,0,255,0.45)',
  },
  liveText: {
    color: LIVE_MAGENTA,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subLabel: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
  },
  note: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    marginBottom: 12,
  },
  miniPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
  },
  trackMeta: {
    flex: 1,
    marginLeft: 10,
    minWidth: 0,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  trackArtist: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  playFab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playTri: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
    marginLeft: 2,
  },
  reactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  reactCenter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reactCount: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '700',
    minWidth: 20,
  },
  reactCountAfterIcon: {
    marginLeft: 6,
  },
});
