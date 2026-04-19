import { api } from "./api";
import type { SocialInteractionItem } from "@/types/socialActivity";
import type { Track } from "@/types/music";

export interface SocialPost {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  text: string;
  trackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  trackArtwork?: string;
  /** Optional image/video URI from device (echoed by server for this session). */
  mediaUrl?: string;
  fireCount: number;
  createdAt: string;
}

export interface CreateSocialPostInput {
  text: string;
  trackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  trackArtwork?: string;
  mediaUrl?: string;
}

/** GET /api/social/feed — auth-protected. Throws on 401. */
export const getSocialFeed = (): Promise<SocialPost[]> => api.get("/api/social/feed");

/** POST /api/social/post — auth-protected. */
export const createSocialPost = (input: CreateSocialPostInput): Promise<SocialPost> =>
  api.post("/api/social/post", input);

/** GET /api/social/activity — Vybe Activity tail (SoundCloud fires, etc.). Auth-protected. */
export const getSocialActivityFeed = (): Promise<SocialInteractionItem[]> =>
  api.get("/api/social/activity");

/**
 * Record a SoundCloud “fire” (like) to the global Vybe Activity feed.
 * Uses the same session bearer + cookies as other `api` calls.
 */
export async function recordSoundcloudFireActivity(
  track: Track,
): Promise<SocialInteractionItem | null> {
  if (track.source !== "soundcloud") return null;
  try {
    const sc = track as Track & { soundcloudUrl?: string };
    return await api.post<SocialInteractionItem>("/api/social/activity/soundcloud-fire", {
      trackId: track.id,
      trackTitle: track.title,
      trackArtist: track.artist,
      trackArtwork: track.artwork,
      soundcloudUrl: sc.soundcloudUrl ?? "",
    });
  } catch {
    return null;
  }
}
