import { api } from "./api";

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
