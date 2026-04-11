/**
 * Apple Music Bridge
 * Albums:   iTunes Lookup API (no key needed) → track list → YouTube search
 * Playlists: extract slug name → search YouTube Music for playlist tracks
 */

import { spawn } from 'child_process';

const YTDLP_BIN = '/opt/homebrew/bin/yt-dlp';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface AppleMusicTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  durationMs: number;
}

export interface AppleMusicResult {
  id: string;
  name: string;
  artist: string;
  thumbnailUrl: string;
  tracks: AppleMusicTrack[];
  type: 'album' | 'playlist';
}

const cache = new Map<string, { result: AppleMusicResult; expiresAt: number }>();

function searchYouTube(title: string, artist: string): Promise<{ videoId: string; thumbnailUrl: string } | null> {
  return new Promise((resolve) => {
    const proc = spawn(YTDLP_BIN, [
      `ytsearch1:${title} ${artist}`, '--dump-json', '--no-warnings', '--quiet',
    ]);
    const timeout = setTimeout(() => { proc.kill('SIGKILL'); resolve(null); }, 15_000);
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('close', () => {
      clearTimeout(timeout);
      try {
        const item = JSON.parse(out.trim());
        resolve({
          videoId: item.id as string,
          thumbnailUrl: item.thumbnail ?? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
        });
      } catch { resolve(null); }
    });
    proc.on('error', () => { clearTimeout(timeout); resolve(null); });
  });
}

function searchYouTubePlaylist(query: string, limit = 20): Promise<AppleMusicTrack[]> {
  return new Promise((resolve) => {
    const proc = spawn(YTDLP_BIN, [
      `ytsearch${limit}:${query}`, '--dump-json', '--no-warnings', '--quiet',
    ]);
    const timeout = setTimeout(() => { proc.kill('SIGKILL'); resolve([]); }, 30_000);
    let out = '';
    proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('close', () => {
      clearTimeout(timeout);
      const tracks: AppleMusicTrack[] = [];
      for (const line of out.split('\n')) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          tracks.push({
            videoId: item.id,
            title: item.title,
            channelName: item.channel ?? item.uploader ?? '',
            thumbnailUrl: item.thumbnail ?? `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
            durationMs: (item.duration ?? 0) * 1000,
          });
        } catch {}
      }
      resolve(tracks);
    });
    proc.on('error', () => { clearTimeout(timeout); resolve([]); });
  });
}

/** Handle music.apple.com/…/album/…/ALBUM_ID */
async function fetchAlbum(albumId: string): Promise<AppleMusicResult> {
  const cached = cache.get(`album:${albumId}`);
  if (cached && Date.now() < cached.expiresAt) return cached.result;

  const res = await fetch(`https://itunes.apple.com/lookup?id=${albumId}&entity=song`);
  if (!res.ok) throw new Error(`iTunes Lookup failed: ${res.status}`);
  const data = await res.json() as { results: any[] };

  const albumMeta = data.results[0];
  const songEntries: { trackName: string; artistName: string; trackTimeMillis: number }[] =
    data.results.slice(1).filter((r: any) => r.wrapperType === 'track');

  const subset = songEntries.slice(0, 20);
  const resolved = await Promise.all(
    subset.map(async (s): Promise<AppleMusicTrack | null> => {
      const yt = await searchYouTube(s.trackName, s.artistName);
      if (!yt) return null;
      return {
        videoId: yt.videoId,
        title: s.trackName,
        channelName: s.artistName,
        thumbnailUrl: yt.thumbnailUrl,
        durationMs: s.trackTimeMillis ?? 0,
      };
    })
  );

  const tracks = resolved.filter((t): t is AppleMusicTrack => t !== null);
  const result: AppleMusicResult = {
    id: albumId,
    name: albumMeta?.collectionName ?? 'Apple Music Album',
    artist: albumMeta?.artistName ?? '',
    thumbnailUrl: (albumMeta?.artworkUrl100 ?? '').replace('100x100', '600x600'),
    tracks,
    type: 'album',
  };

  cache.set(`album:${albumId}`, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/** Handle music.apple.com/…/playlist/SLUG/pl.XXXXXX — search YouTube for the playlist name */
async function fetchPlaylist(playlistId: string, nameSlug: string): Promise<AppleMusicResult> {
  const cached = cache.get(`playlist:${playlistId}`);
  if (cached && Date.now() < cached.expiresAt) return cached.result;

  const name = nameSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const tracks = await searchYouTubePlaylist(`${name} playlist songs`, 20);

  const result: AppleMusicResult = {
    id: playlistId,
    name,
    artist: 'Apple Music',
    thumbnailUrl: tracks[0]?.thumbnailUrl ?? '',
    tracks,
    type: 'playlist',
  };

  cache.set(`playlist:${playlistId}`, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export interface AppleMusicSearchResult {
  /** Stable ID from iTunes — prefix used by the client to avoid collision with other sources. */
  id: string;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  durationMs: number;
  /** The resolved YouTube video ID that the mobile app will actually play/download. */
  videoId: string;
}

const searchCache = new Map<string, { result: AppleMusicSearchResult[]; expiresAt: number }>();
const SEARCH_TTL_MS = 10 * 60 * 1000; // 10 min

/**
 * Search Apple Music via iTunes Search API (no auth required). Results are
 * enriched with YouTube video IDs via yt-dlp so the client can play/download
 * them through our existing YouTube pipeline — same pattern as the album
 * import flow. Returns at most `limit` tracks and caches for 10 minutes so
 * repeated searches for the same query are instant.
 */
export async function searchAppleMusic(query: string, limit = 10): Promise<AppleMusicSearchResult[]> {
  const key = `${query.toLowerCase()}::${limit}`;
  const cached = searchCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.result;

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`iTunes search failed: ${res.status}`);
  const json = (await res.json()) as { results: any[] };
  const songs = (json.results ?? []).filter((r: any) => r.kind === 'song');

  // Resolve YouTube video IDs for each song in parallel. A song with no
  // YouTube match is dropped from the list — the user can't play it.
  const resolved = await Promise.all(
    songs.map(async (s: any): Promise<AppleMusicSearchResult | null> => {
      const yt = await searchYouTube(s.trackName ?? '', s.artistName ?? '');
      if (!yt) return null;
      return {
        id: `am-${s.trackId}`,
        title: s.trackName ?? 'Unknown',
        artist: s.artistName ?? 'Unknown',
        album: s.collectionName ?? '',
        artwork: (s.artworkUrl100 ?? '').replace('100x100', '300x300'),
        durationMs: s.trackTimeMillis ?? 0,
        videoId: yt.videoId,
      };
    }),
  );

  const result = resolved.filter((r): r is AppleMusicSearchResult => r !== null);
  searchCache.set(key, { result, expiresAt: Date.now() + SEARCH_TTL_MS });
  return result;
}

/** Main entry: parse Apple Music URL and delegate */
export async function fetchAppleMusicUrl(url: string): Promise<AppleMusicResult> {
  // Album: music.apple.com/us/album/album-name/1649434004
  const albumMatch = url.match(/\/album\/[^/]+\/(\d+)/);
  if (albumMatch) return fetchAlbum(albumMatch[1]);

  // Playlist: music.apple.com/us/playlist/slug/pl.XXXXX
  const playlistMatch = url.match(/\/playlist\/([^/]+)\/(pl\.[a-zA-Z0-9]+)/);
  if (playlistMatch) return fetchPlaylist(playlistMatch[2], playlistMatch[1]);

  throw new Error('Unrecognized Apple Music URL. Use an album or playlist link.');
}
