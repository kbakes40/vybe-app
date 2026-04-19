import { RADIO_PARADISE_NOW_PLAYING_URL } from '@/constants/radioParadise';

export type RadioParadiseNowPlaying = {
  title: string;
  artist: string;
  artwork: string;
};

/**
 * Fetches current on-air metadata from Radio Paradise public API.
 * @see https://api.radioparadise.com/api/now_playing
 */
export async function fetchRadioParadiseNowPlaying(): Promise<RadioParadiseNowPlaying | null> {
  try {
    const r = await fetch(RADIO_PARADISE_NOW_PLAYING_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as Record<string, unknown>;
    const title = typeof j.title === 'string' ? j.title.trim() : '';
    const artist = typeof j.artist === 'string' ? j.artist.trim() : '';
    const artwork =
      (typeof j.cover === 'string' && j.cover.trim()) ||
      (typeof j.cover_med === 'string' && j.cover_med.trim()) ||
      (typeof j.cover_small === 'string' && j.cover_small.trim()) ||
      '';
    if (!title && !artist) return null;
    return {
      title: title || 'Radio Paradise',
      artist: artist || 'Live',
      artwork,
    };
  } catch {
    return null;
  }
}
