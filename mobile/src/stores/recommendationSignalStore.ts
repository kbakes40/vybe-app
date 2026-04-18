import { create } from 'zustand';

/** Bumped when the user hearts a track so feeds can silently refresh suggestions. */
type RecommendationSignalState = {
  likeRefreshPulse: number;
  bumpLikeRefresh: () => void;
};

export const useRecommendationSignalStore = create<RecommendationSignalState>((set) => ({
  likeRefreshPulse: 0,
  bumpLikeRefresh: () => set((s) => ({ likeRefreshPulse: s.likeRefreshPulse + 1 })),
}));
