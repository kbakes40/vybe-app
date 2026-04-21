/**
 * Bandcamp public-metadata enrichment.
 *
 * Scope: public artist pages only — NO login, NO streaming, NO collection/
 * wishlist, NO private data. This service exists to enrich the Artist Profile
 * sheet with location + tags + photo + top releases alongside TheAudioDB. For
 * playback of user-owned Bandcamp purchases, the correct path is via the
 * user's home Navidrome library over the existing Cloudflare Tunnel.
 *
 * Why this scope (and not the original "IMPLEMENT_BANDCAMP_COLLECTOR_SERVICE"
 * spec): the authenticated `/api/fancollection/*` endpoints require a full
 * session cookie jar and only return streamable preview URLs that expire in
 * ~24h. Scraping those from a shipped iOS app violates Bandcamp's ToS and
 * Apple guideline 5.2.2 — likely grounds for App Store removal. See chat
 * thread for the full risk breakdown.
 *
 * Strategy: fetch the public artist page HTML and parse it two ways:
 *   1. `<script type="application/ld+json">` gives us canonical name, URL,
 *      and main photo via schema.org `MusicGroup`.
 *   2. Targeted regex on the page body pulls `<span class="location ...">`
 *      and `<a class="tag">` nodes (which JSON-LD doesn't include).
 *
 * Caching: MMKV-backed, 30-day TTL. Mirrors `metadataService.ts` patterns —
 * in-flight dedupe, negative caching, https upgrade, safe fallback on fetch
 * failure.
 *
 * Image upgrade: Bandcamp's CDN (`bcbits.com`) serves size variants via a
 * `_<N>.jpg` suffix. `_16` is a 700px band photo, `_10` is 1200x1200 album
 * art. We normalize everything to `_10` for the Pro Max display.
 */
import { createMMKVCache } from '@/lib/mmkv-cache';

const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const cache = createMMKVCache('vybe-bandcamp');
const inflight = new Map<string, Promise<BandcampArtistMetadata | null>>();

export interface BandcampTopAlbum {
  title: string;
  url: string;
  /** 1200x1200 cover art (`_10.jpg`), or null if the grid item had no art. */
  artwork: string | null;
}

export interface BandcampArtistMetadata {
  /** Canonical artist name from JSON-LD. */
  name: string;
  /** `https://<slug>.bandcamp.com/` — the artist's canonical page. */
  url: string;
  /** Band location (e.g. "Berlin, Germany"). null when Bandcamp has no entry. */
  location: string | null;
  /** Lowercased genre tags. */
  tags: string[];
  /** High-res artist photo, normalized to `_10.jpg` (1200x1200). */
  photo: string | null;
  /** Up to 6 most-recent releases from the artist's /music grid. */
  topAlbums: BandcampTopAlbum[];
}

/**
 * TheAudioDB-style JSON-LD `MusicGroup` subset we read. Bandcamp includes a
 * lot more; we take only the fields we need.
 */
interface JsonLdMusicGroup {
  '@type': string | string[];
  name?: string;
  '@id'?: string;
  url?: string;
  image?: string | string[];
}

function cacheKey(artistName: string): string {
  return `bc:artist:${artistName.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

/** Swap any Bandcamp `_<N>.jpg` suffix with `_10.jpg` (1200x1200). */
function upgradeBandcampArt(url: string | null | undefined): string | null {
  if (!url) return null;
  const https = url.replace(/^http:\/\//i, 'https://');
  // bcbits.com/img/a12345_7.jpg → bcbits.com/img/a12345_10.jpg
  return https.replace(/(_)(\d{1,2})(\.(jpe?g|png|webp))/i, '$110$3');
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/');
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').trim();
}

/**
 * Pull every `<script type="application/ld+json">` block out of the page HTML
 * and JSON.parse them. Bandcamp emits one per page (the `MusicGroup`) but we
 * iterate defensively in case that changes.
 */
function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    try {
      out.push(JSON.parse(match[1]));
    } catch {
      // Malformed JSON-LD — Bandcamp occasionally ships comments in the block.
      // Skip and keep going.
    }
  }
  return out;
}

/** Find the first `MusicGroup` node among the parsed JSON-LD blocks. */
function findMusicGroup(blocks: unknown[]): JsonLdMusicGroup | null {
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const node = block as JsonLdMusicGroup;
    const t = node['@type'];
    if (t === 'MusicGroup' || (Array.isArray(t) && t.includes('MusicGroup'))) {
      return node;
    }
  }
  return null;
}

function extractLocation(html: string): string | null {
  // Matches `<span class="location secondaryText">Berlin, Germany</span>` and
  // minor variants. Bandcamp has used both `secondaryText` and `location`
  // alone across redesigns.
  const m = html.match(/<span[^>]*class="[^"]*\blocation\b[^"]*"[^>]*>([^<]+)<\/span>/i);
  return m ? decodeHtmlEntities(stripTags(m[1])) || null : null;
}

function extractTags(html: string): string[] {
  const out: string[] = [];
  const regex = /<a[^>]*class="[^"]*\btag\b[^"]*"[^>]*>([^<]+)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const tag = decodeHtmlEntities(stripTags(m[1])).toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 12); // cap — long tag walls are noise
}

/**
 * Very conservative top-album extraction. Bandcamp's music grid looks like:
 *   <li class="music-grid-item ..." data-item-id="...">
 *     <a href="/album/slug">
 *       <img src="https://f4.bcbits.com/img/a1234567890_7.jpg">
 *       <p class="title">Album Title</p>
 *     </a>
 *   </li>
 * Grabs the first `LIMIT` items; bails silently on any schema drift.
 */
function extractTopAlbums(html: string, artistBase: string, limit = 6): BandcampTopAlbum[] {
  const out: BandcampTopAlbum[] = [];
  const liRegex = /<li[^>]*class="[^"]*music-grid-item[^"]*"[\s\S]*?<\/li>/gi;
  let li: RegExpExecArray | null;
  while ((li = liRegex.exec(html)) !== null && out.length < limit) {
    const block = li[0];
    const hrefMatch = block.match(/href="(\/[^"]+)"/i);
    const imgMatch = block.match(/<img[^>]+src="([^"]+)"/i);
    const titleMatch = block.match(/<p[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    const url = href.startsWith('http') ? href : `${artistBase.replace(/\/$/, '')}${href}`;
    const title = titleMatch ? decodeHtmlEntities(stripTags(titleMatch[1])) : '';
    if (!title) continue;
    out.push({
      title,
      url,
      artwork: upgradeBandcampArt(imgMatch?.[1] ?? null),
    });
  }
  return out;
}

/**
 * Ask Bandcamp's public search for the first band/artist match. Returns the
 * canonical `https://<slug>.bandcamp.com/` URL, or null if nothing matched.
 *
 * We use the public web search page rather than an undocumented API so the
 * request looks like any ordinary Safari user — no auth, no internal
 * endpoints.
 */
async function resolveArtistUrl(
  artistName: string,
  signal: AbortSignal,
): Promise<string | null> {
  const url = `https://bandcamp.com/search?q=${encodeURIComponent(artistName)}&item_type=b`;
  const res = await fetch(url, {
    signal,
    headers: {
      // Transparent UA — we're not pretending to be a specific browser.
      'User-Agent': 'VybeApp/1.0 (+artist-metadata)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) return null;
  const html = await res.text();
  // Search result items contain `<div class="itemurl"><a href="https://foo.bandcamp.com">`.
  const m = html.match(/class="itemurl"[\s\S]*?href="(https:\/\/[^"]+\.bandcamp\.com[^"]*)"/i);
  if (!m) return null;
  // Strip path — we only want the root page for metadata.
  try {
    const parsed = new URL(m[1]);
    return `${parsed.protocol}//${parsed.host}/`;
  } catch {
    return null;
  }
}

/**
 * Fetch + parse public Bandcamp artist metadata. Returns `null` when the
 * artist has no Bandcamp presence, when search fails, or on network error
 * (logged in __DEV__). Safe to call on every artist-sheet open — MMKV cache
 * + in-flight dedupe keep hits off the wire.
 */
export async function fetchBandcampArtistMetadata(
  artistName: string,
): Promise<BandcampArtistMetadata | null> {
  const name = artistName.trim();
  if (!name) return null;

  const key = cacheKey(name);

  const cached = cache.get<BandcampArtistMetadata | null>(key, HIT_TTL_MS);
  if (cached && !cached.isStale) return cached.value;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async (): Promise<BandcampArtistMetadata | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const artistUrl = await resolveArtistUrl(name, controller.signal);
      if (!artistUrl) {
        cache.set<BandcampArtistMetadata | null>(key, null);
        return null;
      }

      const res = await fetch(artistUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'VybeApp/1.0 (+artist-metadata)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });
      clearTimeout(timer);

      if (!res.ok) {
        if (__DEV__) console.log('[bandcamp] artist fetch http error', { name, status: res.status });
        // Bandcamp occasionally 403s via Akamai — fall back to stale cache if any.
        return cached?.value ?? null;
      }

      const html = await res.text();
      const jsonLd = extractJsonLd(html);
      const mg = findMusicGroup(jsonLd);
      if (!mg) {
        cache.set<BandcampArtistMetadata | null>(key, null);
        return null;
      }

      const rawImage = Array.isArray(mg.image) ? mg.image[0] : mg.image;
      const meta: BandcampArtistMetadata = {
        name: (mg.name ?? '').trim() || name,
        url: (mg['@id'] ?? mg.url ?? artistUrl).trim(),
        location: extractLocation(html),
        tags: extractTags(html),
        photo: upgradeBandcampArt(rawImage ?? null),
        topAlbums: extractTopAlbums(html, artistUrl),
      };

      cache.set<BandcampArtistMetadata>(key, meta);
      return meta;
    } catch (e) {
      clearTimeout(timer);
      if (__DEV__) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log('[bandcamp] fetch failed', { name, msg });
      }
      return cached?.value ?? null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

/** Drop a single row — useful for a "refresh" button or dev cache poisoning. */
export function invalidateBandcampArtistMetadata(artistName: string): void {
  cache.remove(cacheKey(artistName));
}

export const BANDCAMP_METADATA_TTL_MS = HIT_TTL_MS;
