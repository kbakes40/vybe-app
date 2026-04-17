import { InteractionManager, Dimensions } from 'react-native';
import { preResolveYoutubeVideoId } from '@/lib/youtubeResolvePreloadCache';

const MAX_WARM_PLAYLISTS = 6;
const RECONCILE_MS = 320;
const VISIBILITY_DROP = 0.12;

type ScoreRow = { ratio: number; name: string; videoIds: string[] };

const scores = new Map<string, ScoreRow>();
const warmedThisSession = new Set<string>();
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

export function windowOverlapRatio(x: number, y: number, w: number, h: number): number {
  const { width: W, height: H } = Dimensions.get('window');
  const ix0 = Math.max(x, 0);
  const iy0 = Math.max(y, 0);
  const ix1 = Math.min(x + w, W);
  const iy1 = Math.min(y + h, H);
  const iw = Math.max(0, ix1 - ix0);
  const ih = Math.max(0, iy1 - iy0);
  const inter = iw * ih;
  const area = Math.max(w * h, 1);
  return inter / area;
}

/**
 * Report how much of this playlist card is visible; top {MAX_WARM_PLAYLISTS} by ratio get resolve warming.
 */
export function reportPlaylistCardVisibility(
  playlistId: string,
  playlistName: string,
  videoIds: string[],
  overlapRatio: number,
): void {
  if (!playlistId) return;
  if (overlapRatio < VISIBILITY_DROP) {
    scores.delete(playlistId);
  } else {
    scores.set(playlistId, { ratio: overlapRatio, name: playlistName, videoIds });
  }

  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    const sorted = [...scores.entries()].sort((a, b) => b[1].ratio - a[1].ratio).slice(0, MAX_WARM_PLAYLISTS);
    for (const [id, row] of sorted) {
      if (warmedThisSession.has(id)) continue;
      warmedThisSession.add(id);
      const ids = row.videoIds.slice(0, 3).filter(Boolean);
      InteractionManager.runAfterInteractions(() => {
        if (__DEV__) {
          console.log(`[PlaylistWarm] Warming playlist: ${row.name}`, ids);
        }
        for (const vid of ids) {
          preResolveYoutubeVideoId(vid);
        }
      });
    }
  }, RECONCILE_MS);
}

/** Call when leaving the home screen (e.g. night "Into the dark" feed) so the next visit can re-prioritize warms. */
export function clearCuratedPlaylistWarmSession(): void {
  if (reconcileTimer) {
    clearTimeout(reconcileTimer);
    reconcileTimer = null;
  }
  scores.clear();
  warmedThisSession.clear();
}
