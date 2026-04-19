import type { Track } from '@/types/music';

/** SoundCloud-first: max wait for `/api/search/sc-match` before starting YouTube resolve. */
export const SC_MATCH_FIRST_BUDGET_MS = 600;

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * INSTANT_STEALTH — race SoundCloud catalog match vs a short budget.
 * If a match returns within the window, caller should switch to SC playback
 * and skip YouTube handshake; otherwise proceed with YouTube immediately.
 */
export async function raceSoundcloudMatchFirst(
  fetchSc: Promise<Track | null>,
  budgetMs: number,
): Promise<Track | null> {
  return Promise.race([fetchSc, delay<Track | null>(budgetMs, null)]);
}
