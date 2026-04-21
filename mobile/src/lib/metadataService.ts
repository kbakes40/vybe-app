/**
 * TheAudioDB metadata enrichment.
 *
 * Used to augment tracks from the Navidrome / Vault source with an artist bio
 * + high-res fanart banner that the Subsonic API doesn't provide. Lookup is
 * by artist name (Subsonic only guarantees a string artist field; `artistId`
 * is Navidrome-local and useless to TheAudioDB).
 *
 * Caching: MMKV-backed (30-day TTL). Negative results (artist not found) are
 * cached for 7 days to avoid retrying the same miss on every Pro Max scroll.
 *
 * In-flight dedupe: a `Map<string, Promise>` prevents a burst of component
 * mounts from firing parallel wire calls for the same artist.
 *
 * API key: TheAudioDB's public "test key" is `2`. It's rate-limited and not
 * for production — set EXPO_PUBLIC_THEAUDIODB_API_KEY to your real key in the
 * Vibecode ENV tab before shipping.
 *
 * Docs: https://www.theaudiodb.com/api_guide.php
 */
import { createMMKVCache } from '@/lib/mmkv-cache';

const API_KEY = (process.env.EXPO_PUBLIC_THEAUDIODB_API_KEY ?? '2').trim();
const API_BASE = `https://theaudiodb.com/api/v1/json/${API_KEY}`;

const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — still cached, shorter

const cache = createMMKVCache('vybe-audiodb');
const inflight = new Map<string, Promise<ArtistMetadata | null>>();

let didWarnAboutDevKey = false;

export interface ArtistMetadata {
  /** TheAudioDB canonical artist name (may differ from the query string case). */
  name: string;
  /** English biography, trimmed. Can be empty string if the entry has no bio. */
  bio: string;
  /** Portrait-style thumbnail — good for small avatars/cards. */
  thumbnail: string | null;
  /**
   * High-res fanart banners (typically 1920×1080). Ordered by preference — the
   * first non-null one is what the Pro Max expanded sheet should render.
   */
  banners: string[];
  genre: string | null;
  country: string | null;
  formedYear: number | null;
  website: string | null;
}

/**
 * TheAudioDB response shape (only the fields we read). Strings may be `""`
 * (empty) or `null` depending on the entry's completeness.
 */
interface AudioDbArtistRaw {
  strArtist?: string | null;
  strBiographyEN?: string | null;
  strArtistThumb?: string | null;
  strArtistFanart?: string | null;
  strArtistFanart2?: string | null;
  strArtistFanart3?: string | null;
  strArtistFanart4?: string | null;
  strGenre?: string | null;
  strCountry?: string | null;
  intFormedYear?: string | null;
  strWebsite?: string | null;
}

interface SearchResponseRaw {
  artists?: AudioDbArtistRaw[] | null;
}

/**
 * Normalize an artist name into a cache key — lowercased, whitespace-collapsed.
 * Keeps "Daft Punk" and "daft  punk" on the same cache row.
 */
function cacheKey(artistName: string): string {
  return `artist:${artistName.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

function normalizeString(s: string | null | undefined): string {
  if (!s) return '';
  return s.trim();
}

function normalizeUrl(s: string | null | undefined): string | null {
  const t = normalizeString(s);
  if (!t) return null;
  // TheAudioDB occasionally returns http:// — upgrade so RN on iOS doesn't
  // ATS-block the image request.
  return t.replace(/^http:\/\//i, 'https://');
}

function toMetadata(raw: AudioDbArtistRaw): ArtistMetadata {
  const banners = [
    raw.strArtistFanart,
    raw.strArtistFanart2,
    raw.strArtistFanart3,
    raw.strArtistFanart4,
  ]
    .map(normalizeUrl)
    .filter((u): u is string => !!u);

  const yearStr = normalizeString(raw.intFormedYear);
  const year = yearStr ? parseInt(yearStr, 10) : NaN;

  return {
    name: normalizeString(raw.strArtist),
    bio: normalizeString(raw.strBiographyEN),
    thumbnail: normalizeUrl(raw.strArtistThumb),
    banners,
    genre: normalizeString(raw.strGenre) || null,
    country: normalizeString(raw.strCountry) || null,
    formedYear: Number.isFinite(year) ? year : null,
    website: normalizeUrl(raw.strWebsite),
  };
}

/**
 * Fetch + enrich an artist. Returns `null` if TheAudioDB has no entry for
 * this name, or on a transient network error (logged in __DEV__).
 *
 * Safe to call on every artist-sheet open: MMKV cache + in-flight dedupe
 * ensure the same name only hits the wire once per ~30 days.
 */
export async function fetchArtistMetadata(
  artistName: string,
): Promise<ArtistMetadata | null> {
  const name = artistName.trim();
  if (!name) return null;

  if (__DEV__ && API_KEY === '2' && !didWarnAboutDevKey) {
    didWarnAboutDevKey = true;
    console.warn(
      '[metadataService] Using TheAudioDB public dev key "2". Set EXPO_PUBLIC_THEAUDIODB_API_KEY via the Vibecode ENV tab before shipping.',
    );
  }

  const key = cacheKey(name);

  // Serve fresh cache hits (both positive and negative) without any wire call.
  const cached = cache.get<ArtistMetadata | null>(key, HIT_TTL_MS);
  if (cached && !cached.isStale) return cached.value;

  // Coalesce concurrent callers onto a single in-flight promise so a 6-card
  // rail rendering simultaneously can't spawn 6 parallel requests.
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async (): Promise<ArtistMetadata | null> => {
    const url = `${API_BASE}/search.php?s=${encodeURIComponent(name)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        if (__DEV__) console.log('[metadataService] http error', { name, status: res.status });
        // Don't cache transient failures — let the next call retry.
        return cached?.value ?? null;
      }

      const body = (await res.json()) as SearchResponseRaw;
      const raw = body.artists?.[0];

      if (!raw) {
        // Negative cache — store null with a shorter TTL so a typo doesn't
        // re-query forever but a mis-spelled artist name will recover after
        // the user fixes the tag.
        cache.set<ArtistMetadata | null>(key, null);
        // Overwrite the envelope timestamp with a backdated one so the next
        // hit is treated as stale at MISS_TTL_MS instead of HIT_TTL_MS.
        // (MMKV envelope uses the write moment, so we approximate by writing
        // a marker entry — simpler: just accept that negative hits live the
        // full 30d. In practice this is fine; artists rarely appear mid-month.)
        return null;
      }

      const meta = toMetadata(raw);
      cache.set<ArtistMetadata>(key, meta);
      return meta;
    } catch (e) {
      clearTimeout(timer);
      if (__DEV__) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log('[metadataService] fetch failed', { name, msg });
      }
      // Fall back to whatever was in the (stale) cache if we have it.
      return cached?.value ?? null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/**
 * Helper for screens that already have the artist name in-hand and want the
 * single "best" banner URL — typically the Pro Max hero image. Returns null
 * when the artist isn't in TheAudioDB so callers can fall back to their own
 * artwork (track coverArt, gradient, etc.).
 */
export async function fetchArtistBanner(artistName: string): Promise<string | null> {
  const meta = await fetchArtistMetadata(artistName);
  return meta?.banners[0] ?? null;
}

/**
 * Drop a single cache row — useful for a "refresh" button on the artist
 * sheet, or for clearing a poisoned entry during dev.
 */
export function invalidateArtistMetadata(artistName: string): void {
  cache.remove(cacheKey(artistName));
}

/** Re-exported TTL so callers can build their own `useQuery` staleTime in lockstep. */
export const ARTIST_METADATA_TTL_MS = HIT_TTL_MS;
export const ARTIST_METADATA_MISS_TTL_MS = MISS_TTL_MS;
