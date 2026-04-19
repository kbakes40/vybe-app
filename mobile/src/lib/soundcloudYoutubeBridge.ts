import { api } from '@/lib/api/api';
import type { Track } from '@/types/music';

export type SoundcloudSearchRow = {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
};

export function soundcloudRowToTrack(row: SoundcloudSearchRow): Track {
  return {
    id: `sc-${row.trackId}`,
    title: row.title,
    artist: row.artist,
    artwork: row.artwork,
    duration: row.duration,
    isLiked: false,
    source: 'soundcloud',
    soundcloudId: row.trackId,
    soundcloudUrl: row.soundcloudUrl,
    audioUrl: '',
    artistId: '',
    album: '',
    albumId: '',
  };
}

/**
 * Best-effort SoundCloud track for the same recording (title + artist).
 * INSTANT_STEALTH: raced with a short budget in `playbackController` so YouTube
 * resolve is not blocked for the full RTT; also used after hard vault failures.
 */
export async function fetchSoundcloudMatchForYoutubeTrack(track: Track): Promise<Track | null> {
  const q = `${track.artist} ${track.title}`
    .replace(/\s*\(official.*?\)/gi, '')
    .replace(/\s*\[official.*?\]/gi, '')
    .trim();
  if (q.length < 3) return null;
  try {
    const data = await api.get<SoundcloudSearchRow[] | SoundcloudSearchRow | null>(
      `/api/search/sc-match?q=${encodeURIComponent(q)}`,
    );
    const row = Array.isArray(data) ? data[0] ?? null : data;
    if (!row?.soundcloudUrl) return null;
    return soundcloudRowToTrack(row);
  } catch {
    return null;
  }
}

/** True when the vault / CDN layer failed hard enough to try SoundCloud swap. */
export function isYoutubeHardStreamFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('404') ||
    m.includes('502') ||
    m.includes('503') ||
    m.includes('500') ||
    m.includes('-1008') ||
    m.includes('resource unavailable') ||
    m.includes('bad gateway') ||
    m.includes('not found') ||
    m.includes('http_502') ||
    m.includes('http_404')
  );
}
