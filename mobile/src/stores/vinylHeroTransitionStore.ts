import { create } from 'zustand';

export type VinylHeroRect = { x: number; y: number; width: number; height: number };

type Pending = { rect: VinylHeroRect; trackId: string } | null;

/**
 * One-shot hero rect from Home vinyl tap → Now Playing scale/slide entrance.
 */
export const useVinylHeroTransitionStore = create<{
  pending: Pending;
  setPending: (rect: VinylHeroRect, trackId: string) => void;
  /** Clears pending; returns rect only when it matched this track id. */
  consumeIfMatchingTrack: (trackId: string) => VinylHeroRect | null;
}>((set, get) => ({
  pending: null,
  setPending: (rect, trackId) => set({ pending: { rect, trackId } }),
  consumeIfMatchingTrack: (trackId) => {
    const p = get().pending;
    set({ pending: null });
    if (!p || p.trackId !== trackId) return null;
    return p.rect;
  },
}));
