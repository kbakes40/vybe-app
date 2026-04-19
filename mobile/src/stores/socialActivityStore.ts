import { create } from 'zustand';
import type {
  ActivePostItem,
  PlaylistShareItem,
  SocialFeedItem,
  SocialInteractionItem,
  VybeStory,
} from '@/types/socialActivity';
import { tracks } from '@/data/mockData';

function seedPosts(): ActivePostItem[] {
  const t0 = tracks[0];
  const t1 = tracks[1];
  const now = Date.now();
  return [
    {
      kind: 'active_post' as const,
      id: 'post-seed-1',
      userId: 'u1',
      userName: 'Maya K.',
      isLiveListening: true,
      vybeNote: 'This drop hits different on Vybe — late night studio energy.',
      track: {
        id: t0.id,
        title: t0.title,
        artist: t0.artist,
        artwork: t0.artwork,
        youtubeId: t0.youtubeId,
        source: t0.source,
      },
      createdAt: now - 120_000,
      reactions: { flame: 12, heart: 34, speaker: 5 },
      likedByMe: false,
    },
    {
      kind: 'active_post' as const,
      id: 'post-seed-2',
      userId: 'u2',
      userName: 'Jordan Lee',
      isLiveListening: false,
      vybeNote: 'Vybe Note: running this back on repeat.',
      track: {
        id: t1.id,
        title: t1.title,
        artist: t1.artist,
        artwork: t1.artwork,
        youtubeId: t1.youtubeId,
        source: t1.source,
      },
      createdAt: now - 3600_000,
      reactions: { flame: 4, heart: 18, speaker: 2 },
      likedByMe: true,
    },
  ].sort((a, b) => b.createdAt - a.createdAt);
}

function seedTail(): (PlaylistShareItem | SocialInteractionItem)[] {
  return [
    {
      kind: 'playlist_share',
      id: 'pl-1',
      playlistName: 'Acoustic Soul',
      subtitle: 'The Woods added 3 new tracks',
      timeLabel: '1h ago',
      streamPrimary: 'soundcloud',
    },
    {
      kind: 'playlist_share',
      id: 'pl-2',
      playlistName: 'Deep House Focus',
      subtitle: 'Liked by 12 others',
      timeLabel: '2h ago',
      streamPrimary: 'soundcloud',
    },
    {
      kind: 'playlist_share',
      id: 'pl-3',
      playlistName: 'Indie Anthems',
      subtitle: 'Got liked by 21 others',
      timeLabel: '4h ago',
      streamPrimary: 'vault',
    },
    {
      kind: 'social_interaction',
      id: 'int-1',
      actor: 'FriendA',
      action: 'liked your playlist Midnight Run.',
      timeLabel: '12m ago',
    },
    {
      kind: 'social_interaction',
      id: 'int-2',
      actor: 'Alex',
      action: 'followed your Vybe profile.',
      timeLabel: '1h ago',
    },
  ];
}

function seedStories(): VybeStory[] {
  return [
    { id: 'st-1', name: 'CeCe Winans', hasUnviewedShare: true },
    { id: 'st-2', name: 'Kirk Franklin', hasUnviewedShare: true },
    { id: 'st-3', name: 'David II', hasUnviewedShare: false },
  ];
}

type State = {
  stories: VybeStory[];
  activePosts: ActivePostItem[];
  tailItems: (PlaylistShareItem | SocialInteractionItem)[];
  markStoryViewed: (storyId: string) => void;
  prependActivePost: (post: ActivePostItem) => void;
  mergeRemoteFeed: (items: SocialFeedItem[]) => void;
  togglePostHeart: (postId: string) => void;
  bumpReaction: (postId: string, kind: 'flame' | 'speaker') => void;
};

export const useSocialActivityStore = create<State>((set) => ({
  stories: seedStories(),
  activePosts: seedPosts(),
  tailItems: seedTail(),

  markStoryViewed: (storyId) =>
    set((s) => ({
      stories: s.stories.map((st) =>
        st.id === storyId ? { ...st, hasUnviewedShare: false } : st,
      ),
    })),

  prependActivePost: (post) =>
    set((s) => {
      const rest = s.activePosts.filter((p) => p.id !== post.id);
      const merged = [post, ...rest].sort((a, b) => b.createdAt - a.createdAt);
      return { activePosts: merged };
    }),

  mergeRemoteFeed: (items) =>
    set((s) => {
      const remotePosts = items.filter((i): i is ActivePostItem => i.kind === 'active_post');
      const remoteTail = items.filter(
        (i): i is PlaylistShareItem | SocialInteractionItem =>
          i.kind === 'playlist_share' || i.kind === 'social_interaction',
      );
      const byId = new Map<string, ActivePostItem>();
      for (const p of s.activePosts) byId.set(p.id, p);
      for (const p of remotePosts) byId.set(p.id, p);
      const mergedPosts = [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);

      const tailById = new Map<string, PlaylistShareItem | SocialInteractionItem>();
      for (const t of s.tailItems) tailById.set(t.id, t);
      for (const t of remoteTail) tailById.set(t.id, t);

      return {
        activePosts: mergedPosts,
        tailItems: [...tailById.values()],
      };
    }),

  togglePostHeart: (postId) =>
    set((s) => ({
      activePosts: s.activePosts.map((item) => {
        if (item.id !== postId) return item;
        const nextLiked = !item.likedByMe;
        const heart = item.reactions.heart + (nextLiked ? 1 : -1);
        return {
          ...item,
          likedByMe: nextLiked,
          reactions: {
            ...item.reactions,
            heart: Math.max(0, heart),
          },
        };
      }),
    })),

  bumpReaction: (postId, kind) =>
    set((s) => ({
      activePosts: s.activePosts.map((item) => {
        if (item.id !== postId) return item;
        const r = { ...item.reactions };
        r[kind] += 1;
        return { ...item, reactions: r };
      }),
    })),
}));

/** Demo: simulates a new realtime document (dev-only). */
export function simulateIncomingActivePostDemo() {
  if (!__DEV__) return;
  const t = tracks[2];
  useSocialActivityStore.getState().prependActivePost({
    kind: 'active_post' as const,
    id: `post-demo-${Date.now()}`,
    userId: 'demo',
    userName: 'Vybe Radio',
    isLiveListening: true,
    vybeNote: 'Fresh share — tap play to ride the wave.',
    track: {
      id: t.id,
      title: t.title,
      artist: t.artist,
      artwork: t.artwork,
      youtubeId: t.youtubeId,
      source: t.source,
    },
    createdAt: Date.now(),
    reactions: { flame: 0, heart: 0, speaker: 0 },
    likedByMe: false,
  });
}
