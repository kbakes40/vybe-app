import type { Track } from '@/types/music';

export type ActivePostTrackRef = Pick<Track, 'id' | 'title' | 'artist' | 'artwork'> & {
  youtubeId?: string;
  youtubeMusicId?: string;
  soundcloudUrl?: string;
  source?: Track['source'];
};

export type ActivePostReactions = {
  flame: number;
  heart: number;
  speaker: number;
};

export type ActivePostItem = {
  kind: 'active_post';
  id: string;
  userId: string;
  userName: string;
  avatarUrl?: string;
  /** When true, show magenta “Live” listening ring */
  isLiveListening: boolean;
  vybeNote: string;
  track: ActivePostTrackRef;
  createdAt: number;
  reactions: ActivePostReactions;
  likedByMe: boolean;
};

export type PlaylistShareItem = {
  kind: 'playlist_share';
  id: string;
  playlistName: string;
  subtitle: string;
  timeLabel: string;
};

export type SocialInteractionItem = {
  kind: 'social_interaction';
  id: string;
  actor: string;
  action: string;
  timeLabel: string;
};

export type SocialFeedItem = ActivePostItem | PlaylistShareItem | SocialInteractionItem;

export type VybeStory = {
  id: string;
  name: string;
  avatarUrl?: string;
  /** When true, pulse the play badge until viewed */
  hasUnviewedShare: boolean;
};
