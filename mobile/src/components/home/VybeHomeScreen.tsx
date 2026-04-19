import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  Pressable,
  FlatList,
  StyleSheet,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Bell, User } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { authClient } from '@/lib/auth/auth-client';
import { MOCK_FEED_SECTIONS, MOCK_RESUME_WAVES, type MockFeedRow, type MockResume } from '@/data/homeMock';
import { vybe } from '@/theme/vybeTokens';
import { tabScreenContentContainerPaddingBottom } from '@/constants/Layout';

const W = Dimensions.get('window').width;
const RESUME_H = 118;
const RESUME_W = 100;
const ROW_H = 88;

function displayNameFromSession(user: { name?: string | null; email?: string | null } | undefined): string {
  if (!user) return 'there';
  if (user.name?.trim()) return user.name.trim().split(/\s+/)[0] ?? 'there';
  if (user.email?.trim()) return user.email.split('@')[0] ?? 'there';
  return 'there';
}

function ResumeCard({ item, onPress }: { item: MockResume; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={styles.resumeCard}
    >
      <Image source={{ uri: item.artwork }} style={styles.resumeImg} />
      <View style={styles.resumeBadge}>
        <Text style={styles.resumeBadgeText}>{item.sourceLabel}</Text>
      </View>
      <Text style={styles.resumeTitle} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.resumeSub} numberOfLines={1}>
        {item.subtitle}
      </Text>
    </Pressable>
  );
}

function FeedRow({ row, onPress }: { row: MockFeedRow; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={styles.feedRow}
    >
      <Image source={{ uri: row.artwork }} style={styles.feedThumb} />
      <View style={styles.feedMeta}>
        <View style={styles.feedTitleRow}>
          <Text style={styles.feedTitle} numberOfLines={1}>
            {row.title}
          </Text>
          {row.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{row.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.feedSub} numberOfLines={2}>
          {row.subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

export function VybeHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const firstName = useMemo(() => displayNameFromSession(session?.user as any), [session?.user]);

  const sections = useMemo(
    () =>
      MOCK_FEED_SECTIONS.map((s) => ({
        title: s.title,
        subtitle: s.subtitle,
        data: s.rows,
      })),
    [],
  );

  const ListHeader = useCallback(
    () => (
      <View style={{ paddingBottom: 8 }}>
        <View style={[styles.topRow, { paddingTop: Math.max(insets.top, 12) }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting} numberOfLines={2}>
              Your Vybe, {firstName}
            </Text>
          </View>
          <Pressable
            hitSlop={12}
            onPress={() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
            style={styles.iconBtn}
          >
            <Bell size={22} color={vybe.text.primary} strokeWidth={1.75} />
          </Pressable>
          <Pressable
            hitSlop={12}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(app)/profile' as never);
            }}
            style={[styles.iconBtn, { marginLeft: 6 }]}
          >
            <User size={22} color={vybe.text.primary} strokeWidth={1.75} />
          </Pressable>
        </View>

        <View style={styles.quickBlock}>
          <Text style={styles.sectionLabel}>Quick resume</Text>
          <Text style={styles.sectionHint}>Pick up where you left off — mock waves for now</Text>
          <FlatList
            horizontal
            data={MOCK_RESUME_WAVES}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 20 }}
            renderItem={({ item }) => (
              <ResumeCard item={item} onPress={() => {}} />
            )}
          />
        </View>

        <View style={styles.divider} />
      </View>
    ),
    [firstName, insets.top, router],
  );

  return (
    <View style={[styles.root, { backgroundColor: vybe.bg.base }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeader}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionHeaderTitle}>{section.title}</Text>
            {section.subtitle ? (
              <Text style={styles.sectionHeaderSub}>{section.subtitle}</Text>
            ) : null}
          </View>
        )}
        renderItem={({ item }) => (
          <FeedRow row={item} onPress={() => {}} />
        )}
        SectionSeparatorComponent={() => <View style={{ height: 20 }} />}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: tabScreenContentContainerPaddingBottom(insets.bottom),
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  greeting: {
    color: vybe.text.primary,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: vybe.border.crisp,
    backgroundColor: vybe.glass.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBlock: {
    marginBottom: 8,
  },
  sectionLabel: {
    color: vybe.text.primary,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  sectionHint: {
    color: vybe.text.secondary,
    fontSize: 13,
    fontWeight: '400',
    marginBottom: 14,
    lineHeight: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: vybe.border.subtle,
    marginVertical: 18,
  },
  resumeCard: {
    width: RESUME_W,
    minHeight: RESUME_H,
    marginRight: 12,
  },
  resumeImg: {
    width: RESUME_W,
    height: RESUME_W,
    borderRadius: 8,
    backgroundColor: vybe.bg.card,
  },
  resumeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  resumeBadgeText: {
    color: vybe.text.primary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  resumeTitle: {
    marginTop: 8,
    color: vybe.text.primary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 15,
  },
  resumeSub: {
    marginTop: 2,
    color: vybe.text.muted,
    fontSize: 10,
    fontWeight: '500',
  },
  sectionHeaderWrap: {
    marginBottom: 10,
    maxWidth: W - 40,
  },
  sectionHeaderTitle: {
    color: vybe.text.primary,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionHeaderSub: {
    marginTop: 4,
    color: vybe.text.secondary,
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ROW_H,
    marginBottom: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: vybe.border.subtle,
  },
  feedThumb: {
    width: 72,
    height: 72,
    borderRadius: 6,
    backgroundColor: vybe.bg.card,
  },
  feedMeta: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  feedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedTitle: {
    flex: 1,
    color: vybe.text.primary,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  feedSub: {
    marginTop: 4,
    color: vybe.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: vybe.border.crisp,
    backgroundColor: vybe.glass.fill,
  },
  badgeText: {
    color: vybe.text.secondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
