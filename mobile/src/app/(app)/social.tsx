import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check, Cloud, Plus } from 'lucide-react-native';
import {
  useSocialActivityStore,
} from '@/stores/socialActivityStore';
import { attachActivityRemoteListener } from '@/lib/socialActivityRemote';
import { VybeStoryRing } from '@/components/social/VybeStoryRing';
import { ActivePost } from '@/components/social/ActivePost';
import { PostComposer } from '@/components/social/PostComposer';
import { FeedPostRow } from '@/components/social/FeedPostRow';
import { BuildInfoLine } from '@/components/BuildInfoLine';
import type {
  ActivePostItem,
  PlaylistShareItem,
  SocialFeedItem,
  SocialInteractionItem,
  VybeStory,
} from '@/types/socialActivity';
import { MachinedGradientText } from '@/components/MachinedGradientText';
import { tabScreenContentContainerPaddingBottom } from '@/constants/Layout';
import { useLouisOledChrome } from '@/hooks/useLouisOledChrome';
import { getSocialActivityFeed, getSocialFeed, type SocialPost } from '@/lib/api/social';
import { OLED_BLACK } from '@/constants/machinedTheme';
import { useThemeStore } from '@/stores/themeStore';
import { hexToRgba } from '@/lib/themeColorUtils';

/** Set true to show Active Posts above the compose row again. */
const SHOW_ACTIVE_POSTS_SECTION = false;

const SocialStylesCtx = createContext<ReturnType<typeof makeSocialStyles> | null>(null);

function useSocialStylesFromContext() {
  const v = useContext(SocialStylesCtx);
  if (!v) throw new Error('useSocialStylesFromContext must be used under SocialScreen');
  return v;
}

const BRAND_FEED_ITEMS = [
  {
    id: 'brand-vybe-labs',
    brand: 'VYBE Labs',
    headline: 'Machined Cyan 2.1',
    detail: 'Tighter token refresh windows · calmer vault handoffs.',
    timeLabel: '2h ago',
  },
  {
    id: 'brand-krak',
    brand: 'Krak Coffee',
    headline: 'Winter roast',
    detail: 'Earth-tone cupping notes · partner taps in Vybe Alerts.',
    timeLabel: '5h ago',
  },
  {
    id: 'brand-stak',
    brand: 'STAK',
    headline: 'Stacked plates pop-up',
    detail: 'RSVP live — limited seating this weekend.',
    timeLabel: '1d ago',
  },
] as const;

function SectionHeader({
  title,
  subtitle,
  titleVariant = 'default',
}: {
  title: string;
  subtitle?: string;
  /** `machined` — machined cyan gradient headline (e.g. Active Posts). */
  titleVariant?: 'default' | 'machined';
}) {
  const styles = useSocialStylesFromContext();
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

function BrandFeedRow({
  brand,
  headline,
  detail,
  timeLabel,
}: {
  brand: string;
  headline: string;
  detail: string;
  timeLabel: string;
}) {
  const styles = useSocialStylesFromContext();
  return (
    <View style={styles.brandCard}>
      <Text style={styles.brandName}>{brand}</Text>
      <Text style={styles.brandHeadline}>{headline}</Text>
      <Text style={styles.brandDetail} numberOfLines={2}>
        {detail}
      </Text>
      <Text style={styles.brandTime}>{timeLabel}</Text>
    </View>
  );
}

function PlaylistShareRow({ item, onJoin }: { item: PlaylistShareItem; onJoin: () => void }) {
  const styles = useSocialStylesFromContext();
  const accent = useThemeStore((s) => s.accentColor);
  const scPrimary = item.streamPrimary === 'soundcloud';
  return (
    <View style={styles.playlistCard}>
      <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        <Text style={styles.playlistName}>{item.playlistName}</Text>
        <Text style={styles.playlistSub} numberOfLines={2}>
          {item.subtitle}
        </Text>
        <Text style={styles.playlistTime}>{item.timeLabel}</Text>
      </View>
      {scPrimary ? (
        <Pressable
          onPress={onJoin}
          style={({ pressed }) => [styles.scCloudBtn, pressed && { opacity: 0.82 }]}
          accessibilityRole="button"
          accessibilityLabel="SoundCloud stream"
        >
          <Cloud size={26} color={accent} strokeWidth={2.35} />
        </Pressable>
      ) : (
        <BlurView intensity={32} tint="dark" style={styles.joinBlur}>
          <Pressable onPress={onJoin} style={styles.joinInner}>
            <Text style={styles.joinText}>Join Playlist</Text>
          </Pressable>
        </BlurView>
      )}
    </View>
  );
}

const FEED_SUCCESS_SPRING = { mass: 1, damping: 18, stiffness: 200 } as const;

function FeedPostSuccessPulse({ tick, bottom }: { tick: number; bottom: number }) {
  const styles = useSocialStylesFromContext();
  const accent = useThemeStore((s) => s.accentColor);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!tick) return;
    cancelAnimation(scale);
    cancelAnimation(opacity);
    scale.value = 0.55;
    opacity.value = 0;
    opacity.value = withSequence(
      withTiming(1, { duration: 140 }),
      withTiming(1, { duration: 1200 }),
      withTiming(0, { duration: 300 }),
    );
    scale.value = withSequence(
      withSpring(1, FEED_SUCCESS_SPRING),
      withRepeat(withSequence(withTiming(1.1, { duration: 260 }), withTiming(1, { duration: 260 })), 5, true),
      withTiming(0.75, { duration: 180 }),
    );
  }, [tick, scale, opacity]);

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.feedSuccessBubble, { bottom }, bubbleStyle]}
    >
      <Check size={26} strokeWidth={3} color={accent} />
    </Animated.View>
  );
}

function SocialInteractionRow({ item }: { item: SocialInteractionItem }) {
  const styles = useSocialStylesFromContext();
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

type SocialFeedHeaderProps = {
  stories: VybeStory[];
  activePosts: ActivePostItem[];
  markStoryViewed: (id: string) => void;
  togglePostHeart: (id: string) => void;
  bumpReaction: (id: string, kind: 'flame' | 'speaker') => void;
  handleOpenComposer: () => void;
  feedPostCount?: number;
};

function SocialFeedHeader({
  stories,
  activePosts,
  markStoryViewed,
  togglePostHeart,
  bumpReaction,
  handleOpenComposer,
  feedPostCount,
}: SocialFeedHeaderProps) {
  const styles = useSocialStylesFromContext();
  return (
    <View style={{ backgroundColor: OLED_BLACK }}>
      <SectionHeader title="Brand Feed" subtitle="Partner grid · Krak Coffee · STAK" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: OLED_BLACK }}
        contentContainerStyle={styles.brandRow}
      >
        {BRAND_FEED_ITEMS.map((b) => (
          <BrandFeedRow
            key={b.id}
            brand={b.brand}
            headline={b.headline}
            detail={b.detail}
            timeLabel={b.timeLabel}
          />
        ))}
      </ScrollView>

      <View style={styles.divider} />

      <SectionHeader title="Vybe Alerts" subtitle="New & Noteworthy" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: OLED_BLACK }}
        contentContainerStyle={styles.storiesRow}
      >
        {stories.map((story) => (
          <VybeStoryRing key={story.id} story={story} onPress={() => markStoryViewed(story.id)} />
        ))}
      </ScrollView>

      <View style={styles.divider} />

      {SHOW_ACTIVE_POSTS_SECTION ? (
        <>
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
        </>
      ) : null}

      <Pressable
        onPress={handleOpenComposer}
        style={({ pressed }) => [
          styles.mindPrompt,
          SHOW_ACTIVE_POSTS_SECTION && styles.mindPromptAfterActive,
          pressed && { opacity: 0.88 },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Start a post"
      >
        <Text style={styles.mindPromptText}>What&apos;s on your mind?</Text>
        <Text style={styles.mindPromptSub}>Tap to write — attach vault tracks & visuals</Text>
      </Pressable>
      <Pressable
        onPress={handleOpenComposer}
        style={({ pressed }) => [styles.newPostCta, styles.newPostCtaTight, pressed && { opacity: 0.9 }]}
      >
        <Text style={styles.newPostCtaText}>＋ NEW POST</Text>
      </Pressable>

      <SectionHeader
        title="Feed"
        subtitle={typeof feedPostCount === 'number' ? `${feedPostCount} posts` : 'Live from your network'}
        titleVariant="machined"
      />
    </View>
  );
}

type SocialFeedFooterProps = {
  playlistItems: PlaylistShareItem[];
  interactionItems: SocialInteractionItem[];
};

function SocialFeedFooter({ playlistItems, interactionItems }: SocialFeedFooterProps) {
  const styles = useSocialStylesFromContext();
  return (
    <View style={{ backgroundColor: OLED_BLACK }}>
      <View style={styles.divider} />

      <SectionHeader
        title="Shared Playlists"
        subtitle="Shadow cyan cloud = instant SoundCloud · Join = vault playlist"
      />
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
    </View>
  );
}

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const { louis, kickTranslateStyle, tabListTopPadding } = useLouisOledChrome(insets.top);
  const accent = useThemeStore((s) => s.accentColor);
  const styles = useMemo(() => makeSocialStyles(accent), [accent]);
  const stories = useSocialActivityStore((s) => s.stories);
  const activePosts = useSocialActivityStore((s) => s.activePosts);
  const tailItems = useSocialActivityStore((s) => s.tailItems);
  const markStoryViewed = useSocialActivityStore((s) => s.markStoryViewed);
  const togglePostHeart = useSocialActivityStore((s) => s.togglePostHeart);
  const bumpReaction = useSocialActivityStore((s) => s.bumpReaction);

  const prevPostLen = useRef(activePosts.length);
  const [composerOpen, setComposerOpen] = useState(false);
  const [feedSuccessTick, setFeedSuccessTick] = useState(0);
  const queryClient = useQueryClient();

  // Auth-protected feed query — `api` helper auto-attaches the SecureStore
  // bearer token. A 401 will surface as a thrown error here.
  const feedQuery = useQuery({
    queryKey: ['social', 'feed'],
    queryFn: getSocialFeed,
    staleTime: 30_000,
  });

  const activityQuery = useQuery({
    queryKey: ['social', 'activity'],
    queryFn: getSocialActivityFeed,
    staleTime: 30_000,
    retry: false,
  });

  useEffect(() => {
    const rows = activityQuery.data;
    if (!rows?.length) return;
    useSocialActivityStore.getState().mergeRemoteFeed(rows as SocialFeedItem[]);
  }, [activityQuery.data]);

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
    // Wrap in a typeof guard so a stale build that returns a non-function
    // teardown can't crash the screen with "_b.call is not a function".
    const teardown = attachActivityRemoteListener();
    return () => {
      if (typeof teardown === 'function') teardown();
    };
  }, []);

  const playlistItems = useMemo(
    () => tailItems.filter((i): i is PlaylistShareItem => i.kind === 'playlist_share'),
    [tailItems],
  );
  const interactionItems = useMemo(
    () => tailItems.filter((i): i is SocialInteractionItem => i.kind === 'social_interaction'),
    [tailItems],
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
      setFeedSuccessTick(Date.now());
    },
    [queryClient],
  );

  const handleFeedFireTap = useCallback(
    (postId: string) => {
      queryClient.setQueryData<SocialPost[]>(['social', 'feed'], (old) =>
        old?.map((p) => (p.id === postId ? { ...p, fireCount: p.fireCount + 1 } : p)) ?? old,
      );
    },
    [queryClient],
  );

  const isUnauthorized =
    feedQuery.isError &&
    feedQuery.error instanceof Error &&
    /401|UNAUTHORIZED/i.test(feedQuery.error.message);

  /** Clear tab bar + mini player + home indicator (same math as feed scroll padding). */
  const fabBottom = tabScreenContentContainerPaddingBottom(insets.bottom) + 12;

  const feedPosts = feedQuery.data ?? [];

  return (
    <SocialStylesCtx.Provider value={styles}>
    <Animated.View style={[styles.screen, louis && kickTranslateStyle]}>
      <View style={[styles.topBar, { paddingTop: tabListTopPadding }]}>
        <View style={styles.topBarRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.screenTitle}>Vybe Activity</Text>
            <Text style={styles.screenHint}>
              Sparkle tab in the dock · POST or + opens a bottom sheet over the feed to compose.
            </Text>
          </View>
          <Pressable
            onPress={handleOpenComposer}
            style={({ pressed }) => [styles.topPostBtn, pressed && { opacity: 0.88 }]}
            accessibilityRole="button"
            accessibilityLabel="New post"
            hitSlop={6}
          >
            <Text style={styles.topPostBtnText}>POST</Text>
          </Pressable>
        </View>
      </View>

      {/*
        ScrollView (not FlashList) for this screen: FlashList defers ListHeaderComponent until the
        list has loaded/measured, which can block or omit compose actions in the header on first paint.
      */}
      <ScrollView
        style={{ flex: 1, backgroundColor: OLED_BLACK }}
        contentContainerStyle={{
          paddingBottom: tabScreenContentContainerPaddingBottom(insets.bottom),
          backgroundColor: OLED_BLACK,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        refreshControl={
          <RefreshControl
            refreshing={feedQuery.isRefetching || activityQuery.isRefetching}
            onRefresh={() => {
              void feedQuery.refetch();
              void activityQuery.refetch();
            }}
            tintColor={accent}
            colors={[accent]}
            progressBackgroundColor="#111111"
          />
        }
      >
        <SocialFeedHeader
          stories={stories}
          activePosts={activePosts}
          markStoryViewed={markStoryViewed}
          togglePostHeart={togglePostHeart}
          bumpReaction={bumpReaction}
          handleOpenComposer={handleOpenComposer}
          feedPostCount={feedQuery.data?.length}
        />
        {feedQuery.isLoading ? (
          <View style={styles.feedLoading}>
            <ActivityIndicator color={accent} />
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
          feedPosts.map((post) => <FeedPostRow key={post.id} post={post} onFireTap={handleFeedFireTap} />)
        )}
        <SocialFeedFooter playlistItems={playlistItems} interactionItems={interactionItems} />
        <BuildInfoLine />
      </ScrollView>

      {/* Floating Action Button — opens PostComposer */}
      <Pressable
        accessibilityLabel="New post"
        accessibilityRole="button"
        onPress={handleOpenComposer}
        style={({ pressed }) => [
          styles.fab,
          {
            bottom: fabBottom,
            zIndex: 5000,
            elevation: 5000,
          },
          pressed && { transform: [{ scale: 0.96 }] },
        ]}
      >
        <Plus size={26} color={accent} strokeWidth={2.6} />
      </Pressable>

      <PostComposer
        visible={composerOpen}
        onClose={() => setComposerOpen(false)}
        onPosted={handlePosted}
      />

      {/* Above feed scroll + FAB so the checkmark is actually visible after post */}
      <FeedPostSuccessPulse tick={feedSuccessTick} bottom={fabBottom + 72} />
    </Animated.View>
    </SocialStylesCtx.Provider>
  );
}

function makeSocialStyles(accent: string) {
  const rb = (a: number) => hexToRgba(accent, a);
  return StyleSheet.create({
  screen: {
    flex: 1,
    // Solid black: transparent relied on a parent fill that is not guaranteed (reads as white on iOS).
    // Root Dynamic Island overlay still stacks above tab content via z-index.
    backgroundColor: OLED_BLACK,
  },
  feedSuccessBubble: {
    position: 'absolute',
    alignSelf: 'center',
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: rb(0.1),
    borderWidth: 1,
    borderColor: accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30000,
    elevation: 30000,
    shadowColor: accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
  },
  topBar: {
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  screenTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.85,
    fontFamily: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      default: 'serif',
    }),
  },
  brandRow: {
    paddingLeft: 20,
    paddingRight: 8,
    paddingBottom: 4,
    gap: 12,
  },
  brandCard: {
    width: 260,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: rb(0.22),
    shadowColor: accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  brandName: {
    color: accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  brandHeadline: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  brandDetail: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  brandTime: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontWeight: '600',
  },
  scCloudBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: rb(0.08),
    borderWidth: 1,
    borderColor: rb(0.55),
    shadowColor: accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  screenHint: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  topPostBtn: {
    marginTop: 2,
    marginLeft: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: rb(0.12),
    borderWidth: 1,
    borderColor: accent,
    shadowColor: accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  topPostBtnText: {
    color: accent,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.2,
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
    borderColor: accent,
    backgroundColor: rb(0.08),
  },
  feedRetryText: {
    color: accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: rb(0.85),
    shadowColor: accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  mindPromptAfterActive: {
    marginTop: 4,
  },
  mindPrompt: {
    marginHorizontal: 20,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: rb(0.22),
    shadowColor: accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  mindPromptText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  mindPromptSub: {
    marginTop: 6,
    color: 'rgba(103,232,249,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },
  newPostCtaTight: {
    marginTop: 0,
    marginBottom: 10,
  },
  newPostCta: {
    marginHorizontal: 20,
    marginBottom: 14,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: rb(0.1),
    borderWidth: 1,
    borderColor: accent,
    shadowColor: accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  newPostCtaText: {
    color: accent,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  });
}

