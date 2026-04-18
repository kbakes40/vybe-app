import { useSocialActivityStore } from '@/stores/socialActivityStore';
import type { SocialFeedItem } from '@/types/socialActivity';
import type { Track } from '@/types/music';

/**
 * Map a Firestore / Supabase `activity` document into our feed model.
 * Adjust field names to match your backend schema.
 */
export function mapRemoteActivityDoc(raw: Record<string, unknown>): SocialFeedItem | null {
  const kind = raw.kind as string | undefined;
  if (kind === 'active_post' && typeof raw.id === 'string') {
    return {
      kind: 'active_post',
      id: String(raw.id),
      userId: String(raw.userId ?? ''),
      userName: String(raw.userName ?? 'Vybe user'),
      avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : undefined,
      isLiveListening: Boolean(raw.isLiveListening),
      vybeNote: String(raw.vybeNote ?? '').slice(0, 140),
      track: {
        id: String((raw.track as Record<string, unknown>)?.id ?? ''),
        title: String((raw.track as Record<string, unknown>)?.title ?? ''),
        artist: String((raw.track as Record<string, unknown>)?.artist ?? ''),
        artwork: String((raw.track as Record<string, unknown>)?.artwork ?? ''),
        youtubeId: (raw.track as Record<string, unknown>)?.youtubeId as string | undefined,
        youtubeMusicId: (raw.track as Record<string, unknown>)?.youtubeMusicId as string | undefined,
        soundcloudUrl: (raw.track as Record<string, unknown>)?.soundcloudUrl as string | undefined,
        source: (raw.track as Record<string, unknown>)?.source as Track['source'] | undefined,
      },
      createdAt: Number(raw.createdAt ?? Date.now()),
      reactions: {
        flame: Number((raw.reactions as Record<string, unknown>)?.flame ?? 0),
        heart: Number((raw.reactions as Record<string, unknown>)?.heart ?? 0),
        speaker: Number((raw.reactions as Record<string, unknown>)?.speaker ?? 0),
      },
      likedByMe: Boolean(raw.likedByMe),
    };
  }
  return null;
}

/**
 * Attach a realtime listener to your `activity` collection.
 *
 * **Firestore:** install `firebase`, initialize the app, then use:
 * `onSnapshot(query(collection(db, 'activity'), orderBy('createdAt','desc'), limit(50)), snap => { ... })`
 * and call `useSocialActivityStore.getState().mergeRemoteFeed(rows.map(mapRemoteActivityDoc).filter(Boolean))`.
 *
 * **Supabase:** `supabase.channel('activity').on('postgres_changes', { event: '*', schema: 'public', table: 'activity' }, ...)`
 * and merge similarly.
 *
 * This stub returns a no-op teardown until you add SDK calls above (keeps the app buildable without extra deps).
 */
export function attachActivityRemoteListener(_onError?: (e: unknown) => void): () => void {
  const enabled = process.env.EXPO_PUBLIC_SOCIAL_ACTIVITY_REMOTE === '1';
  if (!enabled) return () => {};

  if (__DEV__) {
    console.info(
      '[SocialActivity] Remote listener stub: set EXPO_PUBLIC_SOCIAL_ACTIVITY_REMOTE=1 and wire Firebase/Supabase in socialActivityRemote.ts',
    );
  }
  return () => {};
}

/** Push parsed rows into the local feed (call from your snapshot handler). */
export function mergeActivityRows(rows: SocialFeedItem[]) {
  useSocialActivityStore.getState().mergeRemoteFeed(rows);
}
