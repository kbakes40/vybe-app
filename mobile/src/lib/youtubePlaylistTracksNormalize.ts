import { isDeadYoutubeQueueTitle } from '@/lib/queueSanitize';

/**
 * Normalizes GET /api/youtube/playlist-tracks rows.
 * Server sends slim fields (id, artist, artwork, url); older payloads used videoId, channel, thumbnail.
 */
export function normalizeYoutubePlaylistTracksPayload(data: unknown): Array<{
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  duration: number;
}> {
  if (!Array.isArray(data)) return [];
  return data
    .map((raw: Record<string, unknown>) => {
      const videoId = String(raw.videoId ?? raw.id ?? '');
      return {
        videoId,
        title: String(raw.title ?? ''),
        channel: String(raw.channel ?? raw.artist ?? ''),
        thumbnail: String(raw.thumbnail ?? raw.artwork ?? ''),
        duration: typeof raw.duration === 'number' ? raw.duration : 0,
      };
    })
    .filter((t) => t.videoId.length > 0 && !isDeadYoutubeQueueTitle(t.title));
}
