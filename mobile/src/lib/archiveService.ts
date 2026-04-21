import { createMMKVCache } from '@/lib/mmkv-cache';
import {
  ARCHIVE_BRAND_LOGO_URL,
  ARCHIVE_DI_TAG,
  ARCHIVE_DOWNLOAD_URL,
  ARCHIVE_FLAC_FORMATS,
  ARCHIVE_METADATA_URL,
  ARCHIVE_SEARCH_URL,
} from '@/constants/archive';
import type { Track } from '@/types/music';

/**
 * Internet Archive — "Live Vault" source.
 *
 * We query the IA Advanced Search API scoped to `mediatype:etree` (the Live
 * Music Archive — legally tradeable soundboard / audience recordings from
 * taper-friendly bands) and then, per item, pull the metadata manifest and
 * keep only `.flac` files. Anything lossy is rejected at the service layer —
 * Vybe's 8K audio floor is non-negotiable.
 *
 * Docs:
 *   Search:   https://archive.org/advancedsearch.php
 *   Metadata: https://archive.org/services/docs/api/metadata.html
 */

const CACHE_ID = 'vybe-archive';
const CACHE_KEY_SEARCH = 'search';
const CACHE_KEY_ITEM = 'item';
/** Search results rarely churn — 30 min is plenty for feed paint. */
const SEARCH_TTL_MS = 30 * 60 * 1000;
/** Per-item manifests are immutable for any given upload — cache aggressively. */
const ITEM_TTL_MS = 24 * 60 * 60 * 1000;

const cache = createMMKVCache(CACHE_ID);

// ─── Wire types (IA API) ──────────────────────────────────────────────────────

/** Fields we ask for on every `advancedsearch` call. */
interface ArchiveSearchDoc {
  identifier: string;
  title?: string;
  creator?: string | string[];
  date?: string;
  venue?: string;
  coverage?: string;
  year?: string;
  /** Raw `date` is sometimes an ISO-ish string; we normalize downstream. */
  publicdate?: string;
}

interface ArchiveSearchResponse {
  response?: {
    numFound?: number;
    start?: number;
    docs?: ArchiveSearchDoc[];
  };
}

/** Per-file row from `https://archive.org/metadata/<id>` → `files[]`. */
interface ArchiveRawFile {
  name: string;
  format?: string;
  /** `length` may be `"523.82"` seconds OR `"8:43.82"` — both in the wild. */
  length?: string;
  title?: string;
  track?: string | number;
  size?: string;
  bitrate?: string;
}

interface ArchiveMetadataResponse {
  metadata?: {
    identifier?: string;
    title?: string;
    creator?: string | string[];
    date?: string;
    venue?: string;
    coverage?: string;
    year?: string;
  };
  files?: ArchiveRawFile[];
}

// ─── Normalized types (consumed by the app) ───────────────────────────────────

/** Concert-level record surfaced to feeds / library rows. */
export interface ArchiveConcert {
  identifier: string;
  title: string;
  creator: string;
  /** `YYYY-MM-DD` or `YYYY` if that's all IA has. */
  date: string;
  year: number | null;
  venue: string;
  coverage: string;
  /** Stable square thumbnail — IA auto-generates one per item. */
  artwork: string;
}

/** Single streamable FLAC file within a concert. */
export interface ArchiveFlacFile {
  filename: string;
  title: string;
  trackNumber: number | null;
  durationSeconds: number;
  streamUrl: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstString(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return (v[0] ?? '').trim();
  return (v ?? '').trim();
}

/** Convert IA `length` ("523.82" or "8:43.82") to seconds. Returns 0 on miss. */
function parseDurationSeconds(raw: string | undefined): number {
  if (!raw) return 0;
  const s = raw.trim();
  if (!s) return 0;
  if (s.includes(':')) {
    const parts = s.split(':').map((p) => Number(p));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    // mm:ss[.ms] or hh:mm:ss[.ms]
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** IA titles are sometimes `"01 - Truckin'"` — strip the leading track number. */
function cleanTrackTitle(raw: string | undefined, fallback: string): string {
  const s = (raw ?? '').trim();
  if (!s) return fallback;
  // "01 Song", "01 - Song", "01. Song"
  return s.replace(/^\d{1,3}\s*[-.]?\s*/, '').trim() || fallback;
}

function extractYear(date: string | undefined, fallback: string | undefined): number | null {
  const s = (date || fallback || '').trim();
  const match = s.match(/\b(\d{4})\b/);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1900 && n <= 2100 ? n : null;
}

function itemArtwork(identifier: string): string {
  return `https://archive.org/services/img/${encodeURIComponent(identifier)}`;
}

function buildStreamUrl(identifier: string, filename: string): string {
  // Archive.org is picky about plus-signs etc. inside path segments.
  return `${ARCHIVE_DOWNLOAD_URL}/${encodeURIComponent(identifier)}/${encodeURIComponent(filename)}`;
}

function normalizeConcert(doc: ArchiveSearchDoc): ArchiveConcert {
  const creator = firstString(doc.creator) || 'Unknown Artist';
  const date = (doc.date || '').trim();
  const venue = (doc.venue || '').trim();
  const coverage = (doc.coverage || '').trim();
  return {
    identifier: doc.identifier,
    title: (doc.title || '').trim() || doc.identifier,
    creator,
    date: date || (doc.year || '').trim(),
    year: extractYear(date, doc.year),
    venue,
    coverage,
    artwork: itemArtwork(doc.identifier),
  };
}

// ─── Network ──────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Vybe/1.0 (mobile)',
      Accept: 'application/json',
    },
  });
  if (!resp.ok) throw new Error(`archive ${url}: ${resp.status}`);
  return (await resp.json()) as T;
}

/**
 * Raw search call — preserved as its own function so callers can vary `q`
 * beyond the default etree filter (e.g. genre / band / year narrowing).
 */
async function searchArchiveRaw(
  q: string,
  rows: number,
  page: number,
): Promise<ArchiveSearchDoc[]> {
  const params = new URLSearchParams();
  params.set('q', q);
  params.set('rows', String(Math.max(1, Math.min(rows, 200))));
  params.set('page', String(Math.max(1, page)));
  params.set('output', 'json');
  params.set('sort[]', 'downloads desc');
  ['identifier', 'title', 'creator', 'date', 'venue', 'coverage', 'year', 'publicdate'].forEach(
    (f) => params.append('fl[]', f),
  );
  const url = `${ARCHIVE_SEARCH_URL}?${params.toString()}`;
  const data = await fetchJson<ArchiveSearchResponse>(url);
  return data.response?.docs ?? [];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ArchiveSearchOptions {
  /** Free-text refinement layered on top of `mediatype:etree`. */
  query?: string;
  rows?: number;
  page?: number;
  /** Set `false` to bypass MMKV and force a network hit. */
  useCache?: boolean;
}

/**
 * Paginated list of live concerts (`mediatype:etree`), highest-downloads
 * first. Caller may narrow with `query` (appended as an AND clause).
 *
 * Cached per `(query, rows, page)` tuple in MMKV for 30 min.
 */
export async function searchArchiveConcerts(
  options: ArchiveSearchOptions = {},
): Promise<ArchiveConcert[]> {
  const { query, rows = 40, page = 1, useCache = true } = options;

  const q = query?.trim()
    ? `mediatype:etree AND (${query.trim()})`
    : 'mediatype:etree';
  const cacheKey = `${CACHE_KEY_SEARCH}:${q}:${rows}:${page}`;

  if (useCache) {
    const hit = cache.get<ArchiveConcert[]>(cacheKey, SEARCH_TTL_MS);
    if (hit && !hit.isStale) return hit.value;
  }

  try {
    const docs = await searchArchiveRaw(q, rows, page);
    const normalized = docs
      .filter((d) => !!d.identifier)
      .map(normalizeConcert);
    cache.set(cacheKey, normalized);
    return normalized;
  } catch (err) {
    const hit = cache.get<ArchiveConcert[]>(cacheKey, SEARCH_TTL_MS);
    if (hit) {
      console.warn('[archive] search failed, returning stale cache', err);
      return hit.value;
    }
    console.warn('[archive] search failed and no cache', err);
    return [];
  }
}

/**
 * Per-item manifest: the concert plus **FLAC-only** files in track order.
 *
 * Lossy formats (mp3, ogg, shn, …) are dropped on the floor — this service
 * is the "Live Vault" and anything below lossless would dilute the badge.
 */
export async function getArchiveConcert(
  identifier: string,
  useCache: boolean = true,
): Promise<{ concert: ArchiveConcert; files: ArchiveFlacFile[] } | null> {
  if (!identifier) return null;
  const cacheKey = `${CACHE_KEY_ITEM}:${identifier}`;

  if (useCache) {
    const hit = cache.get<{ concert: ArchiveConcert; files: ArchiveFlacFile[] }>(
      cacheKey,
      ITEM_TTL_MS,
    );
    if (hit && !hit.isStale) return hit.value;
  }

  try {
    const data = await fetchJson<ArchiveMetadataResponse>(
      `${ARCHIVE_METADATA_URL}/${encodeURIComponent(identifier)}`,
    );
    const meta = data.metadata ?? {};
    const concert: ArchiveConcert = {
      identifier: meta.identifier || identifier,
      title: (meta.title || identifier).trim(),
      creator: firstString(meta.creator) || 'Unknown Artist',
      date: (meta.date || meta.year || '').trim(),
      year: extractYear(meta.date, meta.year),
      venue: (meta.venue || '').trim(),
      coverage: (meta.coverage || '').trim(),
      artwork: itemArtwork(meta.identifier || identifier),
    };

    const files: ArchiveFlacFile[] = (data.files ?? [])
      .filter((f) => !!f.name && ARCHIVE_FLAC_FORMATS.has(f.format ?? ''))
      .map((f) => ({
        filename: f.name,
        title: cleanTrackTitle(f.title, f.name.replace(/\.flac$/i, '')),
        trackNumber:
          typeof f.track === 'number'
            ? f.track
            : Number.isFinite(Number(f.track))
              ? Number(f.track)
              : null,
        durationSeconds: parseDurationSeconds(f.length),
        streamUrl: buildStreamUrl(concert.identifier, f.name),
      }))
      .sort((a, b) => {
        // Prefer explicit track numbers; otherwise fall back to filename order.
        if (a.trackNumber !== null && b.trackNumber !== null) {
          return a.trackNumber - b.trackNumber;
        }
        if (a.trackNumber !== null) return -1;
        if (b.trackNumber !== null) return 1;
        return a.filename.localeCompare(b.filename);
      });

    const payload = { concert, files };
    cache.set(cacheKey, payload);
    return payload;
  } catch (err) {
    console.warn(`[archive] metadata fetch failed for ${identifier}`, err);
    const hit = cache.get<{ concert: ArchiveConcert; files: ArchiveFlacFile[] }>(
      cacheKey,
      ITEM_TTL_MS,
    );
    return hit?.value ?? null;
  }
}

/**
 * Compose a display-friendly album line from IA metadata.
 * Examples:
 *   `1977-05-08 · Barton Hall, Cornell Univ.`
 *   `1995 · Red Rocks Amphitheatre`
 *   `Barton Hall, Cornell Univ.` (no date)
 */
export function formatArchiveAlbum(concert: ArchiveConcert): string {
  const place = concert.venue || concert.coverage;
  const date = concert.date;
  if (date && place) return `${date} · ${place}`;
  if (date) return date;
  if (place) return place;
  return concert.title;
}

/**
 * Build a {@link Track} for the Vybe playback queue from an IA concert +
 * FLAC file. Artwork defaults to the concert's auto-thumbnail; the Pill
 * swaps in the Archive brand logo via `source === 'archive'` regardless.
 */
export function archiveFileToTrack(
  concert: ArchiveConcert,
  file: ArchiveFlacFile,
): Track {
  const albumLine = formatArchiveAlbum(concert);
  return {
    id: `archive:${concert.identifier}:${file.filename}`,
    title: file.title,
    artist: concert.creator,
    artistId: `archive-artist:${concert.creator}`,
    album: albumLine,
    albumId: `archive:${concert.identifier}`,
    artwork: concert.artwork || ARCHIVE_BRAND_LOGO_URL,
    duration: file.durationSeconds,
    isLiked: false,
    audioUrl: file.streamUrl,
    source: 'archive',
    tags: ['live', 'etree', 'lossless', 'flac'],
    fileFormat: 'flac',
    qualityOptions: ['Lossless'],
    isStreamable: true,
    isDownloadable: true,
    licenseName: 'Trade-Friendly (Taper Policy)',
    attributionRequired: true,
    attributionText: `${concert.creator} — ${albumLine} (archive.org/details/${concert.identifier})`,
    releaseYear: concert.year ?? undefined,
    archiveIdentifier: concert.identifier,
    archiveDate: concert.date,
    archiveVenue: concert.venue || concert.coverage,
    archiveCreator: concert.creator,
    archiveFilename: file.filename,
    archiveDiTag: ARCHIVE_DI_TAG,
  };
}

/**
 * Convenience: fetch a concert and return its full FLAC track list ready
 * to drop into `usePlaybackController.playTrack(track, queue)`.
 */
export async function buildArchiveConcertQueue(identifier: string): Promise<Track[]> {
  const item = await getArchiveConcert(identifier);
  if (!item) return [];
  return item.files.map((f) => archiveFileToTrack(item.concert, f));
}

/** Synchronous read of the last search page — for first-frame paint. */
export function readArchiveSearchCache(
  query: string | undefined = undefined,
  rows: number = 40,
  page: number = 1,
): ArchiveConcert[] {
  const q = query?.trim() ? `mediatype:etree AND (${query.trim()})` : 'mediatype:etree';
  const cacheKey = `${CACHE_KEY_SEARCH}:${q}:${rows}:${page}`;
  const hit = cache.get<ArchiveConcert[]>(cacheKey, SEARCH_TTL_MS);
  return hit?.value ?? [];
}
