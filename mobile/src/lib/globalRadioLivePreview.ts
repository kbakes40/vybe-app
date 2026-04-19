import type { GlobalRadioStationId } from '@/lib/GlobalRadioClient';
import { GLOBAL_RADIO_STATIONS } from '@/lib/GlobalRadioClient';
import { itunesLookupArtwork } from '@/lib/itunesArtwork';

export type GlobalRadioLivePreview = {
  title: string;
  artist: string;
  artwork: string;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchLautFmCurrentSong(
  slug: string,
): Promise<{ title: string; artist: string } | null> {
  try {
    const r = await fetch(`https://api.laut.fm/station/${encodeURIComponent(slug)}/current_song`);
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: string; artist?: { name?: string } };
    const title = typeof j.title === 'string' ? j.title.trim() : '';
    const artist = typeof j.artist?.name === 'string' ? j.artist.name.trim() : '';
    if (!title && !artist) return null;
    return { title: title || 'On air', artist: artist || slug };
  } catch {
    return null;
  }
}

async function fetchSomaFmHeadSong(
  songsId: string,
): Promise<{ title: string; artist: string } | null> {
  try {
    const r = await fetch(`https://api.somafm.com/songs/${encodeURIComponent(songsId)}.json`);
    if (!r.ok) return null;
    const j = (await r.json()) as { songs?: Array<{ title?: string; artist?: string }> };
    const s = j.songs?.[0];
    if (!s) return null;
    const title = typeof s.title === 'string' ? s.title.trim() : '';
    const artist = typeof s.artist === 'string' ? s.artist.trim() : '';
    if (!title && !artist) return null;
    return { title: title || 'On air', artist: artist || songsId };
  } catch {
    return null;
  }
}

type PollRow =
  | { id: GlobalRadioStationId; kind: 'lautfm'; slug: string }
  | { id: GlobalRadioStationId; kind: 'somafm'; songsId: string };

/** Stations (except Paradise + hip-hop relay) with a pollable now-playing feed. */
const POLL_ROWS: PollRow[] = [
  { id: 'lofi', kind: 'lautfm', slug: 'lofi' },
  { id: 'country', kind: 'lautfm', slug: 'country' },
  { id: 'house', kind: 'somafm', songsId: 'groovesalad' },
  { id: 'jazz', kind: 'somafm', songsId: 'sonicuniverse' },
  { id: 'ambient', kind: 'somafm', songsId: 'dronezone' },
  { id: 'indie', kind: 'somafm', songsId: 'indiepop' },
];

/**
 * Fetches on-air title/artist and resolves album art via iTunes search.
 * Throttled internally to reduce burst traffic.
 */
export async function fetchGlobalRadioLivePreviewMap(): Promise<
  Partial<Record<GlobalRadioStationId, GlobalRadioLivePreview>>
> {
  const out: Partial<Record<GlobalRadioStationId, GlobalRadioLivePreview>> = {};
  for (const row of POLL_ROWS) {
    const fallback = GLOBAL_RADIO_STATIONS[row.id].brandArtworkUrl;
    const meta =
      row.kind === 'lautfm'
        ? await fetchLautFmCurrentSong(row.slug)
        : await fetchSomaFmHeadSong(row.songsId);
    const def = GLOBAL_RADIO_STATIONS[row.id];
    const title = meta?.title ?? def.staticNowPlaying?.title ?? 'Live';
    const artist = meta?.artist ?? def.staticNowPlaying?.artist ?? def.diChannelTag;
    let artwork = fallback;
    if (meta) {
      const q = `${meta.artist} ${meta.title}`.trim();
      const found = await itunesLookupArtwork(q);
      if (found) artwork = found;
    }
    out[row.id] = { title, artist, artwork };
    await sleep(220);
  }
  return out;
}
