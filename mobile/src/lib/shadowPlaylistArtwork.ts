/**
 * Shadow curation: legacy playlist artwork + OLED title fallbacks when CDN thumbs are weak.
 */

/** Curated IDs → high-contrast art (grit / era). Picsum seeds are stable per playlist. */
export const LEGACY_SHADOW_PLAYLIST_ART: Record<string, string> = {
  "OLAK5uy_nNJT7AbBdhV752pwUKXiyYRs6aEiUyh5Y": 'https://picsum.photos/seed/vybe-shadow-70s/800/800?grayscale',
  "RDCLAK5uy_lMzHW51iFg1Kx0d_2EHpzbOgCrwtu8cgI": 'https://picsum.photos/seed/vybe-shadow-80s/800/800?grayscale',
  "RDCLAK5uy_nQkPLhMF6chdzKSlWdX8NHMrLVpdci-eU": 'https://picsum.photos/seed/vybe-shadow-90s/800/800?grayscale',
  "RDCLAK5uy_mplKe9BIYCO3ZuNWSHZr48bm9DUDzbWnE": 'https://picsum.photos/seed/vybe-shadow-millennial/800/800?grayscale',
  "PLmyAPRLQRJ6lMbAdXYGuyZ627Y9RoX25i": 'https://images.unsplash.com/photo-1598489037733-4ec44cb3519b?w=800&h=800&fit=crop&q=85',
  "OLAK5uy_k8MpasYgwAswSjuvZN5ilDMNPxT5R-mHk": 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=800&h=800&fit=crop&q=85',
};

const DECADE_BW = 'https://picsum.photos/seed/vybe-shadow-decade/800/800?grayscale';
const RETRO_FUTURE = 'https://images.unsplash.com/photo-1550684848-fac1c47261b4?w=800&h=800&fit=crop&q=85';

/** Title-pattern overrides when playlistId is unknown. */
export function shadowArtworkForPlaylistTitle(title: string): string | null {
  const t = title.toLowerCase();
  if (t.includes("'70") || t.includes('70s') || t.includes('1970')) return DECADE_BW;
  if (t.includes("'80") || t.includes('80s') || t.includes('1980')) return DECADE_BW;
  if (t.includes("'90") || t.includes('90s') || t.includes('1990')) return DECADE_BW;
  if (t.includes('millennial')) return 'https://picsum.photos/seed/vybe-shadow-millennial/800/800?grayscale';
  if (t.includes('mtv hits')) return RETRO_FUTURE;
  if (t.includes('rewind')) return RETRO_FUTURE;
  return null;
}

/**
 * Large era digit for Shadow Editorial overlay on Hits / legacy decade rails.
 */
export function inferEditorialEraLabel(title: string): string | null {
  const t = title.toLowerCase();
  const hitsLike =
    t.includes('hit') ||
    t.includes('rewind') ||
    t.includes('mtv') ||
    t.includes('millennial') ||
    t.includes('mixtape') ||
    t.includes('party');
  if (!hitsLike) return null;
  if (t.includes('millennial')) return 'M';
  if (t.includes('mtv') || (t.includes('90') && t.includes('2000'))) return '90';
  if (t.includes("'70") || t.includes('70s') || t.includes('1970')) return '70';
  if (t.includes("'80") || t.includes('80s') || t.includes('1980')) return '80';
  if (t.includes("'90") || t.includes('90s') || t.includes("90's") || t.includes('1990')) return '90';
  if (t.includes("'10") || t.includes('10s') || t.includes('2010')) return '10';
  return null;
}

export function upgradeYoutubeThumbUrl(url: string | null | undefined): string {
  if (!url?.trim()) return '';
  let u = url.trim();
  u = u.replace(/\/(default|mqdefault|sddefault)\.jpg(\?.*)?$/i, '/hqdefault.jpg$2');
  u = u.replace(/\/hqdefault\.jpg(\?.*)?$/i, '/maxresdefault.jpg$1');
  return u;
}

/** Heuristic: thumbs we should not ship as hero covers. */
export function isLowResYoutubeThumbnail(url: string): boolean {
  if (!url?.trim()) return true;
  const u = url.toLowerCase();
  if (u.includes('mqdefault')) return true;
  if (u.includes('/default.jpg')) return true;
  if (u.includes('sddefault')) return true;
  if (u.includes('vi_webp')) return true;
  const m = u.match(/[=/-](\d{2,4})[x×](\d{2,4})/);
  if (m) {
    const w = parseInt(m[1], 10);
    const h = parseInt(m[2], 10);
    if (w > 0 && w < 360 && h > 0 && h < 360) return true;
  }
  return false;
}

export function canonicalYoutubeVideoThumb(videoId: string, quality: 'maxres' | 'hq' = 'maxres'): string {
  const q = quality === 'maxres' ? 'maxresdefault' : 'hqdefault';
  return `https://i.ytimg.com/vi/${videoId}/${q}.jpg`;
}

type VisualOpts = {
  title: string;
  playlistId?: string;
  thumbnailUrl?: string;
  seedVideoId?: string;
  trackThumb?: string;
};

/**
 * Pick final cover URI and optional OLED title fallback (900 / #000 handled in card).
 */
export function resolveShadowPlaylistVisual(opts: VisualOpts): { artwork: string; oledTitle?: string } {
  const id = opts.playlistId;
  if (id && LEGACY_SHADOW_PLAYLIST_ART[id]) {
    return { artwork: LEGACY_SHADOW_PLAYLIST_ART[id] };
  }

  const byTitle = shadowArtworkForPlaylistTitle(opts.title);
  if (byTitle) return { artwork: byTitle };

  const candidates = [opts.thumbnailUrl, opts.trackThumb].filter(Boolean) as string[];
  let best = '';
  for (const c of candidates) {
    const up = upgradeYoutubeThumbUrl(c);
    if (up && !isLowResYoutubeThumbnail(up)) {
      best = up;
      break;
    }
    if (up) best = up;
  }

  if (best && !isLowResYoutubeThumbnail(best)) {
    return { artwork: best };
  }

  if (opts.seedVideoId) {
    const maxres = canonicalYoutubeVideoThumb(opts.seedVideoId, 'maxres');
    if (!isLowResYoutubeThumbnail(maxres)) return { artwork: maxres };
    return { artwork: canonicalYoutubeVideoThumb(opts.seedVideoId, 'hq') };
  }

  if (best) return { artwork: best };

  return { artwork: '', oledTitle: opts.title };
}
