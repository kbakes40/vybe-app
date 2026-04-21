/**
 * Subsonic / Navidrome client.
 *
 * Protocol: Subsonic API v1.16.1 (https://www.subsonic.org/pages/api.jsp).
 * Navidrome implements this spec; the same client works against any Subsonic-
 * compatible server reached via Cloudflare Tunnel, Tailscale, or LAN.
 *
 * Auth: salted-token (per spec) — `t = md5(password + salt)`. Salt rotates per
 * session (kept as a module-level constant after first generation).
 *
 * Credentials: (1) values saved on-device via Library / Discover connect flow
 * (MMKV), or (2) EXPO_PUBLIC_NAVIDROME_URL / USER / PASSWORD at build time.
 * On-device storage wins when present so Vibecode builds work without env.
 */
import * as Crypto from 'expo-crypto';
import type { Track } from '@/types/music';
import { loadNavidromeFromDisk } from '@/lib/navidromeLocalConfig';

const CLIENT_ID = 'Vybe';
const PROTOCOL_VERSION = '1.16.1';

export type NavidromeCredentials = { baseUrl: string; username: string; password: string };

function envNavidrome(): NavidromeCredentials {
  return {
    baseUrl: (process.env.EXPO_PUBLIC_NAVIDROME_URL ?? '').trim().replace(/\/$/, ''),
    username: (process.env.EXPO_PUBLIC_NAVIDROME_USER ?? '').trim(),
    password: (process.env.EXPO_PUBLIC_NAVIDROME_PASSWORD ?? '').trim(),
  };
}

/** Active server + user — disk override first, then env. */
export function getActiveNavidrome(): NavidromeCredentials {
  const disk = loadNavidromeFromDisk();
  if (disk) return disk;
  return envNavidrome();
}

export function hasCredentials(): boolean {
  const c = getActiveNavidrome();
  return c.baseUrl.length > 0 && c.username.length > 0 && c.password.length > 0;
}

/** Session salt — generated lazily on first auth. Regenerated on app restart. */
let sessionSalt: string | null = null;
let sessionToken: string | null = null;

/** Call after saving or clearing credentials so the next token uses the new password. */
export function clearSubsonicSession(): void {
  sessionSalt = null;
  sessionToken = null;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

async function ensureSession(): Promise<{ salt: string; token: string }> {
  if (sessionSalt && sessionToken) return { salt: sessionSalt, token: sessionToken };
  const { password } = getActiveNavidrome();
  const raw = await Crypto.getRandomBytesAsync(3); // 3 bytes → 6 hex chars
  const salt = bytesToHex(raw);
  const token = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.MD5,
    password + salt,
  );
  sessionSalt = salt;
  sessionToken = token.toLowerCase();
  return { salt: sessionSalt, token: sessionToken };
}

function buildParams(auth: { salt: string; token: string }, extra?: Record<string, string>): string {
  const { username } = getActiveNavidrome();
  const p = new URLSearchParams({
    u: username,
    t: auth.token,
    s: auth.salt,
    v: PROTOCOL_VERSION,
    c: CLIENT_ID,
    f: 'json',
    ...(extra ?? {}),
  });
  return p.toString();
}

/**
 * Build a stream URL for a given Subsonic `songId`. `maxBitRate=0` pulls the
 * original file (no transcode), so FLAC/lossless passes through the tunnel.
 */
export async function buildStreamUrl(songId: string): Promise<string | null> {
  if (!hasCredentials()) return null;
  const { baseUrl, username } = getActiveNavidrome();
  const auth = await ensureSession();
  // Stream endpoint uses query-string auth; `f=json` is omitted since this
  // returns audio bytes, not JSON.
  const params = new URLSearchParams({
    id: songId,
    u: username,
    t: auth.token,
    s: auth.salt,
    v: PROTOCOL_VERSION,
    c: CLIENT_ID,
    maxBitRate: '0',
  });
  return `${baseUrl}/rest/stream?${params.toString()}`;
}

export type PingResult =
  | { ok: true; version: string }
  | { ok: false; reason: 'no-credentials' | 'network' | 'auth' | 'server' | 'tunnel' | 'unauthorized' | 'unknown'; status?: number; message?: string };

/**
 * Minimal album shape returned by `getAlbumList2.view`. Subsonic returns many
 * fields; we only type the ones the Library UI actually reads.
 */
export interface SubsonicAlbum {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  year?: number;
  genre?: string;
  created?: string;
}

export type AlbumListResult =
  | { ok: true; albums: SubsonicAlbum[] }
  | { ok: false; reason: 'no-credentials' | 'network' | 'auth' | 'server' | 'tunnel' | 'unauthorized' | 'unknown'; message?: string };

/**
 * Hit /rest/ping to verify the tunnel + credentials. Classifies common failure
 * modes so the UI can show something more useful than "error".
 */
export async function pingServer(timeoutMs = 6000): Promise<PingResult> {
  if (!hasCredentials()) return { ok: false, reason: 'no-credentials' };

  const { baseUrl } = getActiveNavidrome();
  const auth = await ensureSession();
  const url = `${baseUrl}/rest/ping?${buildParams(auth)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    // Cloudflare tunnel down / origin unreachable.
    if (res.status === 404 || res.status === 502 || res.status === 522 || res.status === 530) {
      return { ok: false, reason: 'tunnel', status: res.status };
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      return { ok: false, reason: 'server', status: res.status, message: 'non-JSON response' };
    }

    const resp = (body as { 'subsonic-response'?: { status?: string; version?: string; error?: { code?: number; message?: string } } })['subsonic-response'];
    if (!resp) {
      return { ok: false, reason: 'server', status: res.status, message: 'missing subsonic-response' };
    }

    if (resp.status === 'ok') {
      return { ok: true, version: resp.version ?? PROTOCOL_VERSION };
    }

    // Subsonic error code 40 = wrong username/password.
    const code = resp.error?.code;
    if (code === 40 || code === 41 || code === 42 || code === 43) {
      return { ok: false, reason: 'auth', message: resp.error?.message };
    }
    // Code 10 = required parameter missing / client not authorized — usually
    // means Navidrome's "Subsonic API" toggle is off or the client string is
    // rejected. Surface it distinctly so the UI can point the user at settings
    // instead of retrying credentials.
    if (code === 10) {
      return { ok: false, reason: 'unauthorized', status: res.status, message: resp.error?.message };
    }
    return { ok: false, reason: 'server', status: res.status, message: resp.error?.message };
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    // Abort / DNS / offline.
    return { ok: false, reason: 'network', message: msg };
  }
}

/**
 * Classify a Subsonic `error.code` into our `reason` union. Keeps ping +
 * request error paths consistent so callers only need one switch.
 */
function reasonForCode(
  code: number | undefined,
): 'auth' | 'unauthorized' | 'server' {
  if (code === 40 || code === 41 || code === 42 || code === 43) return 'auth';
  if (code === 10) return 'unauthorized';
  return 'server';
}

/**
 * Generic Subsonic JSON caller. Handles auth params, tunnel-level HTTP errors,
 * and the `subsonic-response.status === "failed"` envelope. Returns the inner
 * `subsonic-response` object on success so callers can read the endpoint-
 * specific payload (e.g. `albumList2.album`).
 */
type SubsonicFailReason = Extract<AlbumListResult, { ok: false }>['reason'];

async function subsonicGet<T = unknown>(
  endpoint: string,
  extraParams?: Record<string, string>,
  timeoutMs = 8000,
): Promise<
  | { ok: true; data: T }
  | { ok: false; reason: SubsonicFailReason; status?: number; message?: string }
> {
  if (!hasCredentials()) return { ok: false, reason: 'no-credentials' };

  const { baseUrl } = getActiveNavidrome();
  const auth = await ensureSession();
  const url = `${baseUrl}/rest/${endpoint}?${buildParams(auth, extraParams)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.status === 404 || res.status === 502 || res.status === 522 || res.status === 530) {
      return { ok: false, reason: 'tunnel', status: res.status };
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      return { ok: false, reason: 'server', status: res.status, message: 'non-JSON response' };
    }

    const resp = (body as { 'subsonic-response'?: { status?: string; error?: { code?: number; message?: string } } & Record<string, unknown> })['subsonic-response'];
    if (!resp) {
      return { ok: false, reason: 'server', status: res.status, message: 'missing subsonic-response' };
    }

    if (resp.status === 'failed') {
      const code = resp.error?.code;
      const msg = resp.error?.message;
      if (__DEV__) {
        console.log('[subsonic] failed', { endpoint, code, message: msg });
      }
      return { ok: false, reason: reasonForCode(code), status: res.status, message: msg };
    }

    return { ok: true, data: resp as T };
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'network', message: msg };
  }
}

export type AlbumListType =
  | 'newest'
  | 'random'
  | 'frequent'
  | 'starred'
  | 'recent'
  | 'alphabeticalByName';

/**
 * `getAlbumList2.view` — album lists by Subsonic `type` (Navidrome-supported).
 */
export async function getAlbumList2(
  type: AlbumListType,
  size = 24,
): Promise<AlbumListResult> {
  const clamped = Math.max(1, Math.min(500, Math.trunc(size)));
  const result = await subsonicGet<{ albumList2?: { album?: SubsonicAlbum[] } }>(
    'getAlbumList2.view',
    { type, size: String(clamped) },
  );
  if (!result.ok) return result;
  const raw = result.data.albumList2?.album ?? [];
  const albums = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return { ok: true, albums };
}

/**
 * `getAlbumList2.view?type=newest` — recently added albums, used by the
 * Library "Recent" rail. Returns up to `size` albums (Subsonic caps at 500).
 */
export async function getNewestAlbums(size = 24): Promise<AlbumListResult> {
  return getAlbumList2('newest', size);
}

export type AlbumDetailResult =
  | { ok: true; songs: SubsonicSong[]; albumName: string; artistName: string; coverArt?: string }
  | { ok: false; reason: SubsonicFailReason; status?: number; message?: string };

/**
 * `getAlbum.view` — full track list for an album (playback queue).
 */
export async function getAlbumDetail(albumId: string): Promise<AlbumDetailResult> {
  const result = await subsonicGet<{
    album?: {
      id: string;
      name: string;
      artist: string;
      coverArt?: string;
      song?: SubsonicSong | SubsonicSong[];
    };
  }>('getAlbum.view', { id: albumId });
  if (!result.ok) return result;
  const al = result.data.album;
  if (!al) {
    return { ok: false, reason: 'server', message: 'missing album' };
  }
  const raw = al.song;
  const songs = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  return {
    ok: true,
    songs,
    albumName: al.name,
    artistName: al.artist,
    coverArt: al.coverArt,
  };
}

/** Full album as `Track[]` for the player (signed stream + cover URLs). */
export async function getAlbumPlaybackQueue(albumId: string): Promise<Track[]> {
  const detail = await getAlbumDetail(albumId);
  if (!detail.ok || detail.songs.length === 0) return [];
  const auth = await ensureSession();
  return detail.songs.map((s) => ({
    ...normalizeSubsonicTrackWithAuth(s, auth),
    album: detail.albumName || (s.album ?? ''),
    albumId: `navidrome-album:${albumId}`,
  }));
}

/**
 * `getCoverArt.view?id=ID&size=NNN` — Pro Max display gets 512px artwork by
 * default (matches the expanded Dynamic Island art). This returns the signed
 * URL rather than fetching the bytes; feed it straight to `expo-image`.
 *
 * Returns `null` if credentials are missing — callers should fall back to
 * whatever placeholder art they use elsewhere.
 */
export async function getCoverArtUrl(
  coverArtId: string,
  size = 512,
): Promise<string | null> {
  if (!hasCredentials()) return null;
  if (!coverArtId) return null;
  const auth = await ensureSession();
  // Must not pass `f=json` — same as stream + sync `coverArtUrlFromAuth`; some
  // servers return a JSON error body instead of image bytes when `f` is set.
  return coverArtUrlFromAuth(coverArtId, Math.max(32, Math.trunc(size)), auth);
}

// ─────────────────────────────────────────────────────────────────────────────
// Songs + library feed
// ─────────────────────────────────────────────────────────────────────────────

export interface SubsonicSong {
  id: string;
  title: string;
  album?: string;
  albumId?: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  duration?: number;
  /** e.g. "flac", "mp3", "wav", "alac" */
  suffix?: string;
  contentType?: string;
  bitRate?: number;
}

const LOSSLESS_SUFFIXES = new Set([
  'flac', 'wav', 'alac', 'aif', 'aiff', 'ape', 'wv', 'dsf', 'dff',
]);

export function isLossless(song: Pick<SubsonicSong, 'suffix' | 'contentType'>): boolean {
  const suf = (song.suffix ?? '').toLowerCase();
  if (suf && LOSSLESS_SUFFIXES.has(suf)) return true;
  const ct = (song.contentType ?? '').toLowerCase();
  return /flac|wav|alac|aiff/.test(ct);
}

export type SongsResult =
  | { ok: true; songs: SubsonicSong[] }
  | { ok: false; reason: 'no-credentials' | 'network' | 'auth' | 'server' | 'tunnel' | 'unauthorized' | 'unknown'; message?: string };

/** `getRandomSongs.view` — random sampler from the whole library. */
export async function getRandomSongs(size = 24): Promise<SongsResult> {
  const clamped = Math.max(1, Math.min(500, Math.trunc(size)));
  const result = await subsonicGet<{ randomSongs?: { song?: SubsonicSong[] } }>(
    'getRandomSongs.view',
    { size: String(clamped) },
  );
  if (!result.ok) return result;
  return { ok: true, songs: result.data.randomSongs?.song ?? [] };
}

// Sync URL builders used during bulk normalization (auth already resolved).
function streamUrlFromAuth(songId: string, auth: { salt: string; token: string }): string {
  const { baseUrl, username } = getActiveNavidrome();
  const params = new URLSearchParams({
    id: songId,
    u: username,
    t: auth.token,
    s: auth.salt,
    v: PROTOCOL_VERSION,
    c: CLIENT_ID,
    maxBitRate: '0',
  });
  return `${baseUrl}/rest/stream.view?${params.toString()}`;
}

function coverArtUrlFromAuth(
  coverArtId: string,
  size: number,
  auth: { salt: string; token: string },
): string {
  const { baseUrl, username } = getActiveNavidrome();
  const params = new URLSearchParams({
    id: coverArtId,
    u: username,
    t: auth.token,
    s: auth.salt,
    v: PROTOCOL_VERSION,
    c: CLIENT_ID,
    size: String(size),
  });
  return `${baseUrl}/rest/getCoverArt.view?${params.toString()}`;
}

/**
 * Convert a raw Subsonic song into our app's `Track` shape. Stream + artwork
 * URLs are pre-signed with the current session's salt+token so callers just
 * pass the `Track` straight to `playerStore`.
 *
 * Returns `null` if credentials aren't set (caller should filter).
 */
export async function normalizeSubsonicTrack(song: SubsonicSong): Promise<Track | null> {
  if (!hasCredentials()) return null;
  const auth = await ensureSession();
  return normalizeSubsonicTrackWithAuth(song, auth);
}

function normalizeSubsonicTrackWithAuth(
  song: SubsonicSong,
  auth: { salt: string; token: string },
): Track {
  return {
    id: `navidrome:${song.id}`,
    title: song.title,
    artist: song.artist ?? 'Unknown Artist',
    artistId: '',
    album: song.album ?? '',
    albumId: '',
    isLiked: false,
    artwork: song.coverArt ? coverArtUrlFromAuth(song.coverArt, 512, auth) : '',
    duration: song.duration ?? 0,
    source: 'navidrome',
    audioUrl: streamUrlFromAuth(song.id, auth),
  };
}

export interface LibraryFeed {
  albums: SubsonicAlbum[];
  songs: SubsonicSong[];
  tracks: Track[];
}

/**
 * One-shot fetch for the Library tab's Navidrome section. Pulls newest albums
 * + a random song sampler in parallel and pre-normalizes songs into `Track`s
 * with signed stream/artwork URLs baked in.
 */
export async function getLibraryFeed(albumCount = 20, songCount = 20): Promise<LibraryFeed> {
  if (!hasCredentials()) return { albums: [], songs: [], tracks: [] };
  const auth = await ensureSession();
  const [albumsRes, songsRes] = await Promise.all([
    getNewestAlbums(albumCount),
    getRandomSongs(songCount),
  ]);
  const albums = albumsRes.ok ? albumsRes.albums : [];
  const songs = songsRes.ok ? songsRes.songs : [];
  const tracks = songs.map((s) => normalizeSubsonicTrackWithAuth(s, auth));
  return { albums, songs, tracks };
}

/** Public sync cover-art URL — requires session already established. */
export function coverArtUrl(coverArtId: string, size = 512): string | null {
  if (!hasCredentials() || !coverArtId) return null;
  if (!sessionSalt || !sessionToken) return null;
  return coverArtUrlFromAuth(coverArtId, size, { salt: sessionSalt, token: sessionToken });
}
