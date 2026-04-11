/**
 * Spotify Playlist Bridge
 * Scrapes the Spotify embed page for track metadata (no API key needed),
 * then searches YouTube for each track via yt-dlp to get playable video IDs.
 */

import { spawn } from 'child_process';

const YTDLP_BIN = '/opt/homebrew/bin/yt-dlp';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SpotifyTrackMeta {
  title: string;
  artist: string;
  durationMs: number;
}

export interface SpotifyPlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  durationMs: number;
}

export interface SpotifyPlaylistResult {
  playlistId: string;
  name: string;
  thumbnailUrl: string;
  tracks: SpotifyPlaylistTrack[];
}

const cache = new Map<string, { result: SpotifyPlaylistResult; expiresAt: number }>();

/** Scrape the Spotify embed page for track listing (no auth required for public playlists). */
async function scrapeSpotifyEmbed(playlistId: string): Promise<{ name: string; tracks: SpotifyTrackMeta[] }> {
  const url = `https://open.spotify.com/embed/playlist/${playlistId}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`Spotify embed fetch failed: ${res.status}`);
  const html = await res.text();

  // Extract playlist name from embedded JSON
  const nameMatch = html.match(/"playlist"[\s\S]*?"name":"([^"]+)"/) ??
                    html.match(/"name":"([^"]+)"[\s\S]*?"type":"playlist"/);
  const name = nameMatch ? nameMatch[1] : 'Spotify Playlist';

  // Extract trackList JSON embedded in the page
  const trackListMatch = html.match(/"trackList":\[(.*?)\](?=,\"|\})/s);
  if (!trackListMatch) return { name, tracks: [] };

  const tracks: SpotifyTrackMeta[] = [];
  const trackRegex = /"title":"([^"]+)","subtitle":"([^"]+)"[^}]*?"duration":(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = trackRegex.exec(trackListMatch[1])) !== null) {
    tracks.push({ title: m[1], artist: m[2], durationMs: parseInt(m[3], 10) });
  }
  return { name, tracks };
}

/** Search YouTube for one track via yt-dlp and return the first result. */
function searchYouTube(title: string, artist: string): Promise<{ videoId: string; thumbnailUrl: string } | null> {
  return new Promise((resolve) => {
    const query = `${title} ${artist}`;
    const proc = spawn(YTDLP_BIN, [
      `ytsearch1:${query}`, '--dump-json', '--no-warnings', '--quiet',
    ]);
    const timeout = setTimeout(() => { proc.kill('SIGKILL'); resolve(null); }, 15_000);
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('close', () => {
      clearTimeout(timeout);
      try {
        const item = JSON.parse(out.trim());
        const videoId = item.id as string;
        const thumbnailUrl: string =
          item.thumbnail ??
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        resolve({ videoId, thumbnailUrl });
      } catch {
        resolve(null);
      }
    });
    proc.on('error', () => { clearTimeout(timeout); resolve(null); });
  });
}

export interface SpotifyTrackResult {
  trackId: string;
  videoId: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationMs: number;
}

export interface SpotifySearchResult {
  /** Prefixed ID so the mobile client can namespace this per source. */
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  durationMs: number;
  /** The resolved YouTube video ID the client will play/download. */
  videoId: string;
}

const trackCache = new Map<string, { result: SpotifyTrackResult; expiresAt: number }>();
const searchCache = new Map<string, { result: SpotifySearchResult[]; expiresAt: number }>();
const SEARCH_TTL_MS = 10 * 60 * 1000; // 10 min

/**
 * Search for tracks "as if" on Spotify and return each with a resolved
 * YouTube video ID. Spotify's own search API requires client credentials
 * so we hit the iTunes Search API instead — it's free, keyless, and
 * returns the same songs. The client treats these results exactly like
 * YouTube/YouTube Music search results, piping each selection through the
 * existing YouTube download route.
 */
export async function searchSpotifyTracks(query: string, limit = 10): Promise<SpotifySearchResult[]> {
  const key = `${query.toLowerCase()}::${limit}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.result;

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Metadata search failed: ${res.status}`);
  const json = (await res.json()) as { results: any[] };
  const songs = (json.results ?? []).filter((r: any) => r.kind === 'song');

  const resolved = await Promise.all(
    songs.map(async (s: any): Promise<SpotifySearchResult | null> => {
      const yt = await searchYouTube(s.trackName ?? '', s.artistName ?? '');
      if (!yt) return null;
      return {
        id: `sp-${s.trackId}`,
        title: s.trackName ?? 'Unknown',
        artist: s.artistName ?? 'Unknown',
        album: s.collectionName ?? '',
        artwork: (s.artworkUrl100 ?? '').replace('100x100', '300x300'),
        durationMs: s.trackTimeMillis ?? 0,
        videoId: yt.videoId,
      };
    }),
  );

  const result = resolved.filter((r): r is SpotifySearchResult => r !== null);
  searchCache.set(key, { result, expiresAt: Date.now() + SEARCH_TTL_MS });
  return result;
}

/** Scrape a single Spotify track embed for title/artist, then find on YouTube. */
export async function fetchSpotifyTrack(trackId: string): Promise<SpotifyTrackResult> {
  const cached = trackCache.get(trackId);
  if (cached && Date.now() < cached.expiresAt) return cached.result;

  const url = `https://open.spotify.com/embed/track/${trackId}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
  });
  if (!res.ok) throw new Error(`Spotify embed fetch failed: ${res.status}`);
  const html = await res.text();

  const titleMatch = html.match(/"title":"([^"]+)"/) ;
  const artistMatch = html.match(/"subtitle":"([^"]+)"/);
  const durationMatch = html.match(/"duration":(\d+)/);

  const title = titleMatch ? titleMatch[1] : 'Unknown Track';
  const artist = artistMatch ? artistMatch[1] : '';
  const durationMs = durationMatch ? parseInt(durationMatch[1], 10) : 0;

  const yt = await searchYouTube(title, artist);
  if (!yt) throw new Error('Could not find track on YouTube');

  const result: SpotifyTrackResult = {
    trackId,
    videoId: yt.videoId,
    title,
    artist,
    thumbnailUrl: yt.thumbnailUrl,
    durationMs,
  };
  trackCache.set(trackId, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Fetch a Spotify playlist and resolve each track to a YouTube video. Cached 24h. */
export async function fetchSpotifyPlaylist(playlistId: string): Promise<SpotifyPlaylistResult> {
  const cached = cache.get(playlistId);
  if (cached && Date.now() < cached.expiresAt) return cached.result;

  const { name, tracks } = await scrapeSpotifyEmbed(playlistId);

  // Resolve up to 20 tracks in parallel (enough for a good playlist preview)
  const subset = tracks.slice(0, 20);
  const resolved = await Promise.all(
    subset.map(async (t): Promise<SpotifyPlaylistTrack | null> => {
      const yt = await searchYouTube(t.title, t.artist);
      if (!yt) return null;
      return {
        videoId: yt.videoId,
        title: t.title,
        channelName: t.artist,
        thumbnailUrl: yt.thumbnailUrl,
        durationMs: t.durationMs,
      };
    })
  );

  const validTracks = resolved.filter((t): t is SpotifyPlaylistTrack => t !== null);
  const thumbnailUrl = validTracks[0]?.thumbnailUrl ?? '';

  const result: SpotifyPlaylistResult = { playlistId, name, thumbnailUrl, tracks: validTracks };
  cache.set(playlistId, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}
