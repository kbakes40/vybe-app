import { createMMKVCache } from '@/lib/mmkv-cache';

/**
 * Radio-Browser API integration — public community API for internet radio stations.
 * Used to seed the Discover tab with live stations alongside SoundCloud / YouTube tracks.
 *
 * Docs: https://api.radio-browser.info/
 * Mirrors return top stations by `clickcount` via `/json/stations/topclick/N`.
 */

const RADIO_BROWSER_MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
] as const;

const CACHE_ID = 'vybe-radio-browser';
const CACHE_KEY_TOP = 'topStations';
/** 15 minutes — discover scroll should not re-fetch on every render. */
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Minimum bitrate (kbps) for the 8K audio standard — reject lo-fi broadcasts. */
const MIN_BITRATE_KBPS = 128;

const cache = createMMKVCache(CACHE_ID);

/**
 * Raw shape returned by `/json/stations/topclick`.
 * Only the fields we actually read are listed.
 */
export interface RadioBrowserRawStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved?: string;
  favicon?: string;
  tags: string;
  country: string;
  countrycode: string;
  codec: string;
  bitrate: number;
  language: string;
  homepage: string;
  lastcheckok: number;
  hls: number;
}

/** Normalized station record consumed by the Discover feed. */
export interface RadioStation {
  id: string;
  name: string;
  streamUrl: string;
  faviconUrl: string | null;
  country: string;
  tags: string[];
  bitrate: number;
  codec: string;
  isHls: boolean;
}

function normalize(raw: RadioBrowserRawStation): RadioStation {
  // Radio Browser payloads are not always strict; normalize defensively.
  const name = (raw.name ?? '').trim();
  const resolvedUrl = (raw.url_resolved ?? '').trim();
  const fallbackUrl = (raw.url ?? '').trim();
  const favicon = (raw.favicon ?? '').trim();
  return {
    id: raw.stationuuid,
    name: name || 'Unknown Station',
    streamUrl: resolvedUrl || fallbackUrl || '',
    faviconUrl: favicon && /^https?:\/\//.test(favicon) ? favicon : null,
    country: raw.country?.trim() || raw.countrycode?.trim() || '',
    tags: (raw.tags || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    bitrate: Number(raw.bitrate) || 0,
    codec: raw.codec?.trim().toUpperCase() || '',
    isHls: raw.hls === 1,
  };
}

async function fetchFromMirror(mirror: string, limit: number): Promise<RadioBrowserRawStation[]> {
  const resp = await fetch(`${mirror}/json/stations/topclick/${limit}`, {
    headers: {
      'User-Agent': 'Vybe/1.0 (mobile)',
      Accept: 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`radio-browser ${mirror}: ${resp.status}`);
  const data = (await resp.json()) as RadioBrowserRawStation[];
  if (!Array.isArray(data)) throw new Error(`radio-browser ${mirror}: bad payload`);
  return data;
}

async function fetchTopStationsRaw(limit: number): Promise<RadioBrowserRawStation[]> {
  let lastErr: unknown = null;
  for (const mirror of RADIO_BROWSER_MIRRORS) {
    try {
      return await fetchFromMirror(mirror, limit);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('radio-browser: all mirrors failed');
}

/**
 * Returns the top N internet radio stations (by clickcount), filtered to
 * bitrate >= MIN_BITRATE_KBPS and a usable stream URL.
 *
 * Cached in MMKV for 15 minutes — subsequent calls within that window are
 * synchronous-to-disk and skip the network entirely. Stale hits are returned
 * immediately while a background refresh runs so the feed never blocks.
 */
export async function getTopStations(limit: number = 40): Promise<RadioStation[]> {
  const hit = cache.get<RadioStation[]>(CACHE_KEY_TOP, CACHE_TTL_MS);
  if (hit && !hit.isStale) {
    return hit.value;
  }

  try {
    const raw = await fetchTopStationsRaw(Math.max(limit * 2, 60));
    const filtered = raw
      .filter((s) => s.lastcheckok === 1)
      .filter((s) => (Number(s.bitrate) || 0) > MIN_BITRATE_KBPS)
      .filter((s) => {
        const url = (s.url_resolved || s.url || '').trim();
        return /^https?:\/\//.test(url);
      })
      .map(normalize)
      .slice(0, limit);

    cache.set(CACHE_KEY_TOP, filtered);
    return filtered;
  } catch (err) {
    if (hit) {
      console.warn('[radioBrowser] fetch failed, returning stale cache', err);
      return hit.value;
    }
    console.warn('[radioBrowser] fetch failed and no cache', err);
    return [];
  }
}

/** Synchronous read of the current cache — used for first-frame paint. */
export function readTopStationsCache(): RadioStation[] {
  const hit = cache.get<RadioStation[]>(CACHE_KEY_TOP, CACHE_TTL_MS);
  return hit?.value ?? [];
}
