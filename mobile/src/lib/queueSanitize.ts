import type { Track } from '@/types/music';

/** YouTube / YT Music placeholder titles — never enqueue or play. */
export function isDeadYoutubeQueueTitle(title: string | undefined): boolean {
  const t = (title ?? '').trim().toLowerCase();
  if (!t) return false;
  if (t.includes('private video')) return true;
  if (t.includes('deleted video')) return true;
  return false;
}

export function isQueueHandoffTrack(t: Pick<Track, 'externalHandoffUrl'>): boolean {
  return !!(t.externalHandoffUrl && t.externalHandoffUrl.trim().length > 0);
}

export function filterDeadYoutubeQueueTracks<T extends Pick<Track, 'title' | 'externalHandoffUrl'>>(
  queue: T[],
): T[] {
  return queue.filter((t) => !isDeadYoutubeQueueTitle(t.title) && !isQueueHandoffTrack(t));
}
