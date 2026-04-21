/**
 * Bandcamp — public tag discovery + authenticated fan collection (Subsonic-adjacent
 * fidelity story: preview streams + collection metadata for Vybe Library).
 *
 * Tag hub HTML is parsed with regex (no DOM parser). Fan API uses Cookie + fan_id.
 */
import type { Track } from '@/types/music';
import { BANDCAMP_DISCOVER_ALBUM_SEEDS, BANDCAMP_JAZZ_ALBUM_SEEDS } from '@/constants/bandcampDiscoverSeeds';
import { getActiveBandcampIdentity } from '@/lib/bandcampLocalConfig';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export type BandcampTagAlbum = {
  id: string;
  albumTitle: string;
  artistName: string;
  artUrl: string;
  previewUrl: string;
  albumUrl: string;
  durationSec: number;
};

export type BandcampCollectionItem = {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  albumUrl: string;
  /** True when Bandcamp reports a lossless / FLAC purchase option in collection payload. */
  hasFlacDownload: boolean;
  tralbumId?: string;
};

/** Map bcbits art URLs to `_10` size when possible (high-res tile). */
export function toBandcampHighResArtUrl(url: string): string {
  if (!url || !url.includes('bcbits.com')) return url;
  return url.replace(/_(\d+)\.(jpg|jpeg|png)$/i, '_10.$2');
}

function extractMetaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const m = html.match(re);
  if (m?.[1]) return m[1];
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`,
    'i',
  );
  const m2 = html.match(re2);
  return m2?.[1] ?? null;
}

function extractTitleArtist(html: string): { title: string; artist: string } {
  const title = extractMetaContent(html, 'og:title') ?? 'Unknown album';
  const ogSite = extractMetaContent(html, 'og:site_name');
  const byLine = extractMetaContent(html, 'twitter:description') ?? '';
  let artist = ogSite ?? '';
  const byMatch = byLine.match(/by\s+(.+)/i) || title.match(/^(.+?)\s+by\s+(.+)$/i);
  if (title.includes(' by ')) {
    const parts = title.split(/\s+by\s+/i);
    if (parts.length >= 2) {
      return { title: parts[0].trim(), artist: parts.slice(1).join(' by ').trim() };
    }
  }
  if (byMatch && byMatch[1]) artist = byMatch[1].trim();
  return { title: title.replace(/\s+by\s+.+$/i, '').trim() || title, artist: artist || 'Unknown artist' };
}

function tagSlug(tag: string): string {
  return encodeURIComponent(tag.trim().toLowerCase().replace(/\s+/g, '-'));
}

/** Collect unique album URLs from a tag hub HTML page (order preserved). */
function parseHubAlbumLinks(html: string, maxLinks: number): string[] {
  const hrefRe = /href="(https:\/\/[a-z0-9-]+\.bandcamp\.com\/album\/[^"?#]+)/gi;
  const seen = new Set<string>();
  const albumUrls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const u = m[1].split('?')[0].replace(/\/$/, '');
    if (!seen.has(u)) {
      seen.add(u);
      albumUrls.push(u);
    }
    if (albumUrls.length >= maxLinks) break;
  }
  return albumUrls;
}

function decodeTralbumAttrValue(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Bandcamp album pages embed `data-tralbum="…"` JSON with `trackinfo[].file['mp3-128']`
 * (og:audio is often absent on modern layouts).
 */
export function parseDataTralbumBlock(html: string): {
  albumTitle: string;
  artistName: string;
  previewUrl: string;
  durationSec: number;
} | null {
  const m = html.match(/data-tralbum="([^"]+)"/);
  if (!m?.[1]) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeTralbumAttrValue(m[1]));
  } catch {
    return null;
  }
  const root = parsed as {
    artist?: unknown;
    current?: { title?: string };
    trackinfo?: Array<{
      file?: Record<string, string>;
      duration?: number;
    }>;
  };
  const ar = root.artist;
  const artistName =
    typeof ar === 'string' ? ar : (ar as { name?: string } | undefined)?.name ?? 'Unknown artist';
  const albumTitle = root?.current?.title ?? 'Unknown album';
  const tracks = root.trackinfo;
  if (!Array.isArray(tracks)) return null;
  for (const tr of tracks) {
    const f = tr?.file;
    if (!f || typeof f !== 'object') continue;
    const mp3 = f['mp3-128'] ?? f['mp3-v0'];
    if (typeof mp3 !== 'string' || !mp3) continue;
    const previewUrl = mp3.startsWith('//') ? `https:${mp3}` : mp3;
    const rawD = tr.duration as unknown;
    const parsed =
      typeof rawD === 'number' && rawD > 0
        ? Math.round(rawD)
        : typeof rawD === 'string' && Number(rawD) > 0
          ? Math.round(Number(rawD))
          : 120;
    const d = parsed > 0 ? parsed : 120;
    return {
      albumTitle: String(albumTitle),
      artistName: String(artistName),
      previewUrl,
      durationSec: d,
    };
  }
  return null;
}

function mergeAlternatingUnique(primary: string[], secondary: string[], cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let i = 0;
  let j = 0;
  while (out.length < cap && (i < primary.length || j < secondary.length)) {
    if (i < primary.length) {
      const u = primary[i++];
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
    if (out.length >= cap) break;
    if (j < secondary.length) {
      const u = secondary[j++];
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    }
  }
  return out;
}

/** Interleave two URL lists so Discover gets variety from two Bandcamp tags. */
function pickSeedAlbumUrls(primaryTag: string, merge: string | undefined, cap: number): string[] {
  const all = [...BANDCAMP_DISCOVER_ALBUM_SEEDS];
  const nudge = (primaryTag.length + (merge?.length ?? 0)) % 7;
  const rotated = [...all.slice(nudge), ...all.slice(0, nudge)];
  /** Tag hubs fall back to seeds — jazz lives at end of global list; surface it for jazz/fusion tags. */
  if (tagSlug(primaryTag) === 'jazz' || (merge && tagSlug(merge) === 'jazz')) {
    const jazz = [...BANDCAMP_JAZZ_ALBUM_SEEDS];
    return mergeAlternatingUnique(jazz, rotated, cap);
  }
  if (!merge || tagSlug(merge) === tagSlug(primaryTag)) {
    return rotated.slice(0, cap);
  }
  const rev = [...all].reverse();
  return mergeAlternatingUnique(rotated, rev, cap);
}

async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        ...(init?.headers as Record<string, string>),
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export type FetchBandcampTagOptions = {
  /** Second tag hub — URLs are merged (alternating, deduped) with the primary tag for more Discover variety. */
  mergeTag?: string;
  /** Max album detail fetches after hub scrape (default 30). */
  maxAlbumUrls?: number;
};

/**
 * Scrape `https://bandcamp.com/tag/[tag]` for album URLs, then each album page
 * for og:image, og:audio (128k preview), title/artist.
 */
export async function fetchTrendingByTag(
  tag: string,
  opts?: FetchBandcampTagOptions,
): Promise<BandcampTagAlbum[]> {
  const cap = Math.min(40, Math.max(8, opts?.maxAlbumUrls ?? 32));
  const pullPerHub = Math.min(36, cap + 12);

  const primaryHtml = await fetchText(`https://bandcamp.com/tag/${tagSlug(tag)}`);

  const merge = opts?.mergeTag?.trim();
  let albumUrls: string[] = [];
  if (primaryHtml) {
    if (merge && tagSlug(merge) !== tagSlug(tag)) {
      const primaryUrls = parseHubAlbumLinks(primaryHtml, pullPerHub);
      const secondaryHtml = await fetchText(`https://bandcamp.com/tag/${tagSlug(merge)}`);
      const secondaryUrls = secondaryHtml ? parseHubAlbumLinks(secondaryHtml, pullPerHub) : [];
      albumUrls = mergeAlternatingUnique(primaryUrls, secondaryUrls, cap);
    } else {
      albumUrls = parseHubAlbumLinks(primaryHtml, cap);
    }
  }
  /** Tag hubs are SPAs — hub HTML usually has zero album links; fall back to curated seeds. */
  if (albumUrls.length === 0) {
    albumUrls = pickSeedAlbumUrls(tag, merge, cap);
  }

  return fetchBandcampAlbumsFromUrls(albumUrls, { max: cap });
}

export type FetchBandcampFromUrlsOptions = {
  /** Max album pages to fetch (default: length of list). */
  max?: number;
};

/**
 * Fetch album metadata + preview URLs from explicit Bandcamp `/album/...` URLs
 * (used by Home deck so jazz picks are not truncated by global seed rotation).
 */
export async function fetchBandcampAlbumsFromUrls(
  urls: readonly string[],
  opts?: FetchBandcampFromUrlsOptions,
): Promise<BandcampTagAlbum[]> {
  const max = Math.min(urls.length, Math.max(1, opts?.max ?? urls.length));
  const albumUrls = urls.slice(0, max);
  const out: BandcampTagAlbum[] = [];
  const chunk = 4;
  for (let i = 0; i < albumUrls.length; i += chunk) {
    const slice = albumUrls.slice(i, i + chunk);
    const rows = await Promise.all(
      slice.map(async (albumUrl) => {
        const page = await fetchText(albumUrl);
        if (!page) return null;
        const tr = parseDataTralbumBlock(page);
        const ogImage = extractMetaContent(page, 'og:image') ?? '';
        let title: string;
        let artist: string;
        let previewUrl: string | null = null;
        let durationSec = 120;
        if (tr) {
          title = tr.albumTitle;
          artist = tr.artistName;
          previewUrl = tr.previewUrl;
          durationSec = tr.durationSec;
        } else {
          const ta = extractTitleArtist(page);
          title = ta.title;
          artist = ta.artist;
          previewUrl =
            extractMetaContent(page, 'og:audio') ??
            extractMetaContent(page, 'og:audio:secure_url') ??
            extractMetaContent(page, 'twitter:player:stream');
        }
        if (!previewUrl) return null;
        const artUrl = toBandcampHighResArtUrl(ogImage);
        const id = `bc-album:${albumUrl.replace(/^https:\/\//, '')}`;
        return {
          id,
          albumTitle: title,
          artistName: artist,
          artUrl,
          previewUrl: previewUrl.startsWith('//') ? `https:${previewUrl}` : previewUrl,
          albumUrl,
          durationSec,
        } satisfies BandcampTagAlbum;
      }),
    );
    for (const r of rows) {
      if (r) out.push(r);
    }
  }
  return out;
}

function normalizeBandcampItemUrl(raw: string | undefined | null): string {
  if (!raw) return '';
  const u = raw.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u.replace(/\/$/, '');
  if (u.startsWith('//')) return `https:${u}`.replace(/\/$/, '');
  if (u.startsWith('/')) return `https://bandcamp.com${u}`.replace(/\/$/, '');
  return `https://${u}`.replace(/\/$/, '');
}

function parseCollectionPayload(json: unknown): BandcampCollectionItem[] {
  const root = json as {
    items?: Array<Record<string, unknown>>;
  };
  const items = root?.items;
  if (!Array.isArray(items)) return [];
  return items.map((it, idx) => {
    const title =
      (it.item_title as string) ||
      (it.album_title as string) ||
      (it.title as string) ||
      'Item';
    const artist =
      (it.band_name as string) ||
      (it.artist as string) ||
      (it.artist_name as string) ||
      'Unknown';
    const albumUrl = normalizeBandcampItemUrl(
      (it.item_url as string) || (it.item_url_path as string) || (it.tralbum_url as string),
    );
    const thumb =
      (it.art_thumb_url as string) ||
      (it.art_url as string) ||
      (it.thumb_url as string) ||
      '';
    const artwork = toBandcampHighResArtUrl(thumb);
    const blob = JSON.stringify(it).toLowerCase();
    const hasFlacDownload =
      /\bflac\b/.test(blob) ||
      /\blossless\b/.test(blob) ||
      /\balac\b/.test(blob) ||
      /\bwav\b/.test(blob) ||
      /download_type.*?flac/.test(blob);
    const tralbumId = it.tralbum_id as number | string | undefined;
    const id = `bc-col:${tralbumId ?? idx}:${String(title).slice(0, 40)}`;
    return {
      id,
      title: String(title),
      artist: String(artist),
      artwork,
      albumUrl,
      hasFlacDownload,
      tralbumId: tralbumId != null ? String(tralbumId) : undefined,
    };
  });
}

/**
 * Fan collection — `POST /api/fancollection/1/collection_items` with session cookie + fan id.
 * Identity from {@link getActiveBandcampIdentity} (MMKV or `EXPO_PUBLIC_BANDCAMP_IDENTITY` JSON).
 */
export async function fetchFanCollectionItems(count = 40): Promise<BandcampCollectionItem[]> {
  const id = getActiveBandcampIdentity();
  if (!id) return [];
  const fanIdNum = Number(id.fanId);
  if (!Number.isFinite(fanIdNum)) return [];

  const tryPost = async (olderThan: string | null) => {
    const body = {
      fan_id: fanIdNum,
      older_than_token: olderThan,
      count: Math.min(80, Math.max(1, count)),
    };
    return fetch('https://bandcamp.com/api/fancollection/1/collection_items', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: id.cookie,
        Origin: 'https://bandcamp.com',
        Referer: 'https://bandcamp.com/',
      },
      body: JSON.stringify(body),
    });
  };

  try {
    let res = await tryPost(null);
    if (!res.ok) {
      res = await tryPost('::a::');
    }
    if (!res.ok) return [];
    const json = await res.json();
    return parseCollectionPayload(json);
  } catch {
    return [];
  }
}

/** Map a tag-hub row to a Vybe `Track` (preview stream + artwork). */
export function bandcampTagAlbumToTrack(row: BandcampTagAlbum, vaultReady = false): Track {
  return {
    id: row.id,
    title: row.albumTitle,
    artist: row.artistName,
    artistId: '',
    album: row.albumTitle,
    albumId: row.albumUrl,
    artwork: row.artUrl,
    duration: row.durationSec,
    isLiked: false,
    source: 'bandcamp',
    audioUrl: row.previewUrl,
    bandcampTralbumUrl: row.albumUrl,
    bandcampVaultReady: vaultReady,
  };
}

/** Map a collection item to a preview `Track` (opens album; preview URL may be resolved later). */
export function bandcampCollectionItemToTrack(it: BandcampCollectionItem): Track {
  return {
    id: it.id,
    title: it.title,
    artist: it.artist,
    artistId: '',
    album: it.title,
    albumId: it.albumUrl,
    artwork: it.artwork,
    duration: 0,
    isLiked: false,
    source: 'bandcamp',
    audioUrl: '',
    bandcampTralbumUrl: it.albumUrl,
    bandcampVaultReady: it.hasFlacDownload,
    qualityOptions: it.hasFlacDownload ? ['Lossless'] : ['Standard'],
  };
}

/** Refresh fan collection into normalized list (call from Library sync). */
export async function syncBandcampFanCollection(): Promise<BandcampCollectionItem[]> {
  return fetchFanCollectionItems(48);
}

/** Resolve 128k preview URL from a public album/tr URL (collection rows). */
export async function resolveBandcampPreviewUrl(albumOrTrackUrl: string): Promise<string | null> {
  const page = await fetchText(albumOrTrackUrl.replace(/\/$/, ''));
  if (!page) return null;
  const tr = parseDataTralbumBlock(page);
  if (tr?.previewUrl) return tr.previewUrl;
  const ogAudio =
    extractMetaContent(page, 'og:audio') ??
    extractMetaContent(page, 'og:audio:secure_url') ??
    extractMetaContent(page, 'twitter:player:stream');
  if (!ogAudio) return null;
  return ogAudio.startsWith('//') ? `https:${ogAudio}` : ogAudio;
}
