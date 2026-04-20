import type { Track } from '@/types/music';

/**
 * STEALTH_FADE_V3 — SoundCloud-first window (ms). A catalog match that lands
 * inside this budget lets `playTrack` take the SC path and **skip** YouTube
 * `preResolveYoutubeVideoId` / `resolveYoutubeStreamForVideoId` entirely.
 */
export const STEALTH_FADE_SC_FIRST_BUDGET_MS = 2800;

/** @deprecated Prefer {@link STEALTH_FADE_SC_FIRST_BUDGET_MS} */
export const SC_MATCH_FIRST_BUDGET_MS = STEALTH_FADE_SC_FIRST_BUDGET_MS;

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/**
 * SOUNDCLOUD_FIRST — race the SoundCloud match promise against a budget.
 * If the match resolves first with a playable SC row, callers bypass YouTube.
 */
export async function raceSoundcloudMatchFirst(
  fetchSc: Promise<Track | null>,
  budgetMs: number = STEALTH_FADE_SC_FIRST_BUDGET_MS,
): Promise<Track | null> {
  return Promise.race([fetchSc, delay<Track | null>(budgetMs, null)]);
}
