import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { SocialPost } from '@/lib/api/social';
import { VIBRANT_BLUE } from '@/constants/machinedTheme';

const NEON_MAGENTA = '#FF00D4';

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export function FeedPostRow({
  post,
  onFireTap,
}: {
  post: SocialPost;
  /** Client-side bump (no server route yet). */
  onFireTap?: (postId: string) => void;
}) {
  const time = relativeTime(post.createdAt);
  const fireBloom = useSharedValue(0);

  const fireGlowStyle = useAnimatedStyle(() => ({
    shadowColor: NEON_MAGENTA,
    shadowOpacity: 0.2 + fireBloom.value * 0.85,
    shadowRadius: 3 + fireBloom.value * 18,
    shadowOffset: { width: 0, height: 0 },
    ...(Platform.OS === 'android'
      ? { elevation: fireBloom.value > 0.4 ? 10 : 2 }
      : {}),
  }));

  const handleFire = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    fireBloom.value = withSequence(
      withTiming(1, { duration: 140 }),
      withTiming(0, { duration: 520 }),
    );
    onFireTap?.(post.id);
  }, [fireBloom, onFireTap, post.id]);

  return (
    <View style={styles.feedRow}>
      <View style={styles.feedHeader}>
        {post.avatar ? (
          <Image source={{ uri: post.avatar }} style={styles.feedAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.feedAvatar, styles.feedAvatarFallback]}>
            <Text style={styles.feedAvatarLetter}>{post.username.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.feedUsername} numberOfLines={1}>
            @{post.username}
          </Text>
          <Text style={styles.feedTime}>{time}</Text>
        </View>
        <Pressable onPress={handleFire} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fire reaction">
          <Animated.View style={[styles.firePill, fireGlowStyle]}>
            <Text style={styles.feedFire}>{formatCount(post.fireCount)} fire</Text>
          </Animated.View>
        </Pressable>
      </View>

      <Text style={styles.feedText}>{post.text}</Text>

      {post.mediaUrl ? (
        <View style={styles.mediaFrame}>
          <Image source={{ uri: post.mediaUrl }} style={styles.mediaImage} contentFit="cover" />
        </View>
      ) : null}

      {post.trackId ? (
        <View style={styles.feedTrackChip}>
          {post.trackArtwork ? (
            <Image source={{ uri: post.trackArtwork }} style={styles.feedTrackArt} contentFit="cover" />
          ) : (
            <View style={[styles.feedTrackArt, styles.feedTrackArtFallback]} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.feedTrackTitle} numberOfLines={1}>
              {post.trackTitle ?? 'Track'}
            </Text>
            <Text style={styles.feedTrackArtist} numberOfLines={1}>
              {post.trackArtist ?? ''}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  feedRow: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.18)',
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  feedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111',
    marginRight: 10,
  },
  feedAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.18)',
  },
  feedAvatarLetter: {
    color: VIBRANT_BLUE,
    fontSize: 14,
    fontWeight: '900',
  },
  feedUsername: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  feedTime: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  firePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,0,212,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,122,69,0.35)',
  },
  feedFire: {
    color: '#FF7A45',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  feedText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  mediaFrame: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.45)',
    backgroundColor: '#0A0A0A',
    maxHeight: 220,
  },
  mediaImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#111',
  },
  feedTrackChip: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,229,255,0.35)',
  },
  feedTrackArt: {
    width: 32,
    height: 32,
    borderRadius: 5,
    backgroundColor: '#111',
    marginRight: 10,
  },
  feedTrackArtFallback: {
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  feedTrackTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  feedTrackArtist: {
    color: VIBRANT_BLUE,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 1,
    textTransform: 'uppercase',
  },
});
