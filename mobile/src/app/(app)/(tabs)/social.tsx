import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import {
  useSocialActivityStore,
} from '@/stores/socialActivityStore';
import { attachActivityRemoteListener } from '@/lib/socialActivityRemote';
import { VybeStoryRing } from '@/components/social/VybeStoryRing';
import { ActivePost } from '@/components/social/ActivePost';
import { PostComposer } from '@/components/social/PostComposer';
import type { PlaylistShareItem, SocialInteractionItem } from '@/types/socialActivity';
import { MachinedGradientText } from '@/components/MachinedGradientText';
import { tabScreenContentContainerPaddingBottom } from '@/constants/Layout';
import { getSocialFeed, type SocialPost } from '@/lib/api/social';
import { VIBRANT_BLUE } from '@/constants/machinedTheme';

function SectionHeader({
  title,
  subtitle,
  titleVariant = 'default',
}: {
  title: string;
  subtitle?: string;
  /** `machined` — cyan/blue gradient headline (e.g. Active Posts). */
  titleVariant?: 'default' | 'machined';
}) {
  return (
    <View style={styles.sectionHeader}>
      {titleVariant === 'machined' ? (
        <MachinedGradientText neonGlow style={styles.sectionTitleMachined} numberOfLines={2}>
          {title}
        </MachinedGradientText>
      ) : (
        <Text style={styles.sectionTitle}>{title}</Text>
      )}
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

function PlaylistShareRow({ item, onJoin }: { item: PlaylistShareItem; onJoin: () => void }) {
  return (
    <View style={styles.playlistCard}>
      <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        <Text style={styles.playlistName}>{item.playlistName}</Text>
        <Text style={styles.playlistSub} numberOfLines={2}>
          {item.subtitle}
        </Text>
        <Text style={styles.playlistTime}>{item.timeLabel}</Text>
      </View>
      <BlurView intensity={32} tint="dark" style={styles.joinBlur}>
        <Pressable
          onPress={onJoin}
          style={styles.joinInner}
        >
          <Text style={styles.joinText}>Join Playlist</Text>
        </Pressable>
      </BlurView>
    </View>
  );
}

function SocialInteractionRow({ item }: { item: SocialInteractionItem }) {
  return (
    <View style={styles.interactionRow}>
      <Text style={styles.interactionMain}>
        <Text style={styles.interactionActor}>{item.actor}</Text>
        {' '}
        {item.action}
      </Text>
      <Text style={styles.interactionTime}>{item.timeLabel}</Text>
    </View>
  );
}

function FeedPostRow({ post }: { post: SocialPost }) {
  const time = relativeTime(post.createdAt);
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
        <Text style={styles.feedFire}>{formatCount(post.fireCount)} fire</Text>
      </View>

      <Text style={styles.feedText}>{post.text}</Text>

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

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const stories = useSocialActivityStore((s) => s.stories);
  const activePosts = useSocialActivityStore((s) => s.activePosts);
  const tailItems = useSocialActivityStore((s) => s.tailItems);
  const markStoryViewed = useSocialActivityStore((s) => s.markStoryViewed);
  const togglePostHeart = useSocialActivityStore((s) => s.togglePostHeart);
  const bumpReaction = useSocialActivityStore((s) => s.bumpReaction);

  const prevPostLen = useRef(activePosts.length);
  const [composerOpen, setComposerOpen] = useState(false);
  const queryClient = useQueryClient();

  // Auth-protected feed query — `api` helper auto-attaches the SecureStore
  // bearer token. A 401 will surface as a thrown error here.
  const feedQuery = useQuery({
    queryKey: ['social', 'feed'],
    queryFn: getSocialFeed,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (activePosts.length > prevPostLen.current) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    prevPostLen.current = activePosts.length;
  }, [activePosts.length]);

  useEffect(() => {
    return attachActivityRemoteListener();
  }, []);

  const playlistItems = tailItems.filter((i): i is PlaylistShareItem => i.kind === 'playlist_share');
  const interactionItems = tailItems.filter(
    (i): i is SocialInteractionItem => i.kind === 'social_interaction',
  );

  const handleOpenComposer = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setComposerOpen(true);
  }, []);

  const handlePosted = useCallback(
    (post: SocialPost) => {
      // Optimistically prepend; server will re-include on next fetch.
      queryClient.setQueryData<SocialPost[]>(['social', 'feed'], (old) =>
        old ? [post, ...old] : [post],
      );
      void queryClient.invalidateQueries({ queryKey: ['social', 'feed'] });
    },
    [queryClient],
  );

  const isUnauthorized =
    feedQuery.isError &&
    feedQuery.error instanceof Error &&
    /401|UNAUTHORIZED/i.test(feedQuery.error.message);

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.screenTitle}>Vybe Activity</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: tabScreenContentContainerPaddingBottom(insets.bottom) }}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
      >
        <SectionHeader title="Vybe Alerts" subtitle="New & Noteworthy" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storiesRow}
        >
          {stories.map((story) => (
            <VybeStoryRing
              key={story.id}
              story={story}
              onPress={() => markStoryViewed(story.id)}
            />
          ))}
        </ScrollView>

        <View style={styles.divider} />

        <SectionHeader
          title="Feed"
          subtitle={feedQuery.data ? `${feedQuery.data.length} posts` : 'Live from your network'}
          titleVariant="machined"
        />
        {feedQuery.isLoading ? (
          <View style={styles.feedLoading}>
            <ActivityIndicator color={VIBRANT_BLUE} />
          </View>
        ) : isUnauthorized ? (
          <View style={styles.feedEmpty}>
            <Text style={styles.feedEmptyTitle}>Sign in to see the Feed</Text>
            <Text style={styles.feedEmptySub}>Your session expired or isn&apos;t set up yet.</Text>
          </View>
        ) : feedQuery.isError ? (
          <View style={styles.feedEmpty}>
            <Text style={styles.feedEmptyTitle}>Couldn&apos;t load feed</Text>
            <Text style={styles.feedEmptySub} numberOfLines={2}>
              {feedQuery.error instanceof Error ? feedQuery.error.message : 'Network error'}
            </Text>
            <Pressable style={styles.feedRetry} onPress={() => feedQuery.refetch()}>
              <Text style={styles.feedRetryText}>RETRY</Text>
            </Pressable>
          </View>
        ) : (
          (feedQuery.data ?? []).map((post) => <FeedPostRow key={post.id} post={post} />)
        )}

        <View style={styles.divider} />

        <SectionHeader title="Active Posts" subtitle="Live from your network" titleVariant="machined" />
        {activePosts.map((post) => (
          <ActivePost
            key={post.id}
            post={post}
            onToggleHeart={togglePostHeart}
            onBumpReaction={bumpReaction}
          />
        ))}

        <View style={styles.divider} />

        <SectionHeader title="Shared Playlists" subtitle="Activity feed" />
        {playlistItems.map((item) => (
          <PlaylistShareRow
            key={item.id}
            item={item}
            onJoin={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          />
        ))}

        <View style={styles.divider} />

        <SectionHeader title="Social Interactions" />
        {interactionItems.map((item) => (
          <SocialInteractionRow key={item.id} item={item} />
        ))}
      </ScrollView>

      {/* Floating Action Button — opens PostComposer */}
      <Pressable
        accessibilityLabel="New post"
        accessibilityRole="button"
        onPress={handleOpenComposer}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 110 },
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
      >
        <Plus size={26} color={VIBRANT_BLUE} strokeWidth={2.6} />
      </Pressable>

      <PostComposer
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPosted={handlePosted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  topBar: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  screenTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionTitleMachined: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 2,
    fontWeight: '600',
  },
  storiesRow: {
    paddingLeft: 20,
    paddingRight: 8,
    paddingBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
  },
  playlistCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  playlistName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.25,
  },
  playlistSub: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '600',
  },
  playlistTime: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '600',
  },
  joinBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: 40,
  },
  joinInner: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  joinText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  interactionRow: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  interactionMain: {
    color: '#FFFFFF',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  interactionActor: {
    fontWeight: '800',
    color: '#FFFFFF',
  },
  interactionTime: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
  },
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
  feedFire: {
    color: '#FF7A45',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  feedText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
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
  feedLoading: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  feedEmpty: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'flex-start',
  },
  feedEmptyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  feedEmptySub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 17,
  },
  feedRetry: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: VIBRANT_BLUE,
    backgroundColor: 'rgba(0,229,255,0.08)',
  },
  feedRetryText: {
    color: VIBRANT_BLUE,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  fab: {
    position: 'absolute',
    right: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: VIBRANT_BLUE,
    shadowColor: VIBRANT_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 18,
    elevation: 12,
  },
});
