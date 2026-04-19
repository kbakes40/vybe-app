/**
 * Best-effort album art from the public iTunes Search API (no API key).
 * Used for global radio live previews where streams expose title/artist only.
 */
const cache = new Map<string, string | null>();
const CACHE_MAX = 64;

function cacheSet(key: string, value: string | null) {
  cache.set(key, value);
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value as string | undefined;
    if (first) cache.delete(first);
  }
}

export async function itunesLookupArtwork(searchTerm: string): Promise<string | null> {
  const key = searchTerm.trim().toLowerCase();
  if (key.length < 2) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(
      searchTerm,
    )}&media=music&entity=song&limit=10`;
    const r = await fetch(url);
    if (!r.ok) {
      cacheSet(key, null);
      return null;
    }
    const j = (await r.json()) as { results?: Array<{ artworkUrl100?: string }> };
    for (const row of j.results ?? []) {
      const raw = row.artworkUrl100;
      if (!raw) continue;
      const hi = raw
        .replace('100x100bb', '600x600bb')
        .replace('100x100', '600x600')
        .replace('60x60bb', '600x600bb');
      cacheSet(key, hi);
      return hi;
    }
    cacheSet(key, null);
    return null;
  } catch {
    cacheSet(key, null);
    return null;
  }
}
