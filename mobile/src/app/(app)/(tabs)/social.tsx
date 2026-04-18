import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import {
  useSocialActivityStore,
  simulateIncomingActivePostDemo,
} from '@/stores/socialActivityStore';
import { attachActivityRemoteListener } from '@/lib/socialActivityRemote';
import { VybeStoryRing } from '@/components/social/VybeStoryRing';
import { ActivePost } from '@/components/social/ActivePost';
import type { PlaylistShareItem, SocialInteractionItem } from '@/types/socialActivity';

const FEED_PAD_BOTTOM = 160;

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
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

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const stories = useSocialActivityStore((s) => s.stories);
  const activePosts = useSocialActivityStore((s) => s.activePosts);
  const tailItems = useSocialActivityStore((s) => s.tailItems);
  const markStoryViewed = useSocialActivityStore((s) => s.markStoryViewed);
  const togglePostHeart = useSocialActivityStore((s) => s.togglePostHeart);
  const bumpReaction = useSocialActivityStore((s) => s.bumpReaction);

  const prevPostLen = useRef(activePosts.length);

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

  useEffect(() => {
    if (!__DEV__) return undefined;
    const t = setTimeout(() => simulateIncomingActivePostDemo(), 5000);
    return () => clearTimeout(t);
  }, []);

  const playlistItems = tailItems.filter((i): i is PlaylistShareItem => i.kind === 'playlist_share');
  const interactionItems = tailItems.filter(
    (i): i is SocialInteractionItem => i.kind === 'social_interaction',
  );

  return (
    <View style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.screenTitle}>Vybe Activity</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
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

        <SectionHeader title="Active Posts" subtitle="Live from your network" />
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0A0A0A',
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
  scrollContent: {
    paddingBottom: FEED_PAD_BOTTOM,
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
});
