/**
 * SubsonicService — Vybe Library ⇄ Navidrome/Cloudflare Vault integration.
 *
 * High-level surface for the "Vault" connection. Wraps the lower-level auth
 * primitives in `./subsonic/subsonicClient` and adds:
 *   - `generateAuthParams(password)` — stateless per-request salted MD5
 *   - `subsonicFetch(method, params)` — GET wrapper with gzip + error logging
 *   - `ping()` / `getLibrary()` / `getStreamUrl(id)` — Vault-facing helpers
 *   - `LibraryItem` normalization with `lossless` flag derived from FLAC suffix
 *
 * Auth: Subsonic salted-token (v1.16.1) per
 *   https://www.subsonic.org/pages/api.jsp
 *
 * MD5 via `expo-crypto` (native digest). We deliberately do NOT pull in
 * `js-md5` — expo-crypto is already wired up for the client, computes MD5 on
 * the native side (faster than JS), and avoids adding a pure-JS MD5 impl to
 * the bundle.
 */
import * as Crypto from 'expo-crypto';
import {
  buildStreamUrl,
  hasCredentials,
} from './subsonic/subsonicClient';

const CLIENT_ID = 'Vybe';
const PROTOCOL_VERSION = '1.16.1';

const RAW_BASE = (process.env.EXPO_PUBLIC_NAVIDROME_URL ?? '').trim().replace(/\/$/, '');
/**
 * Spec requires BASE_URL to end in `/rest`. Accept either form in the env
 * var so the operator can paste `https://vault.example.com` OR
 * `https://vault.example.com/rest` and it just works.
 */
const BASE_URL = RAW_BASE.endsWith('/rest') ? RAW_BASE : `${RAW_BASE}/rest`;

const USERNAME = (process.env.EXPO_PUBLIC_NAVIDROME_USER ?? '').trim();
const PASSWORD = (process.env.EXPO_PUBLIC_NAVIDROME_PASSWORD ?? '').trim();

const CORE_PARAMS = {
  v: PROTOCOL_VERSION,
  c: CLIENT_ID,
  f: 'json',
} as const;

// ─── Auth ───────────────────────────────────────────────────────────────────

async function randomHex6(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(3); // 3 bytes → 6 hex chars
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

async function md5(input: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, input);
  return hex.toLowerCase();
}

/**
 * Stateless auth-param generator per the Subsonic salted-token spec. Rotates
 * the salt every call so each request gets a unique `s`/`t` pair. Callers
 * that want a cached salt (e.g. streaming) should use `buildStreamUrl` from
 * `./subsonic/subsonicClient` instead.
 */
export async function generateAuthParams(
  password: string = PASSWORD,
): Promise<{ u: string; t: string; s: string }> {
  const s = await randomHex6();
  const t = await md5(password + s);
  return { u: USERNAME, t, s };
}

// ─── Request wrapper ────────────────────────────────────────────────────────

export type SubsonicFailureReason =
  | 'no-credentials'
  | 'network'
  | 'auth'
  | 'unauthorized'
  | 'tunnel'
  | 'server';

export interface SubsonicFailure {
  ok: false;
  reason: SubsonicFailureReason;
  code?: number;
  message?: string;
}

export interface SubsonicSuccess<T> {
  ok: true;
  data: T;
}

export type SubsonicResult<T> = SubsonicSuccess<T> | SubsonicFailure;

/**
 * Canonical "engine error" log format. Every `status === "failed"` envelope
 * is routed through this so the logs are greppable and consistent.
 */
function logEngineError(code: number | undefined, message: string | undefined): void {
  console.log(`[SUBSONIC_ENGINE_ERROR] Code: ${code ?? '?'} - ${message ?? 'unknown'}`);
}

function reasonForCode(code: number | undefined): SubsonicFailureReason {
  // Subsonic spec codes:
  //   10 = required parameter missing / API disabled
  //   40 = wrong username/password
  //   41 = token auth not supported for the given user
  //   42 = client must upgrade (unsupported protocol)
  //   43 = server must upgrade
  if (code === 40 || code === 41 || code === 42 || code === 43) return 'auth';
  if (code === 10) return 'unauthorized';
  return 'server';
}

/**
 * Core Subsonic request wrapper. Merges CORE_PARAMS + fresh auth + caller
 * params, issues a GET with explicit `Accept-Encoding: gzip` so metadata
 * responses compress over 5G / cellular.
 */
export async function subsonicFetch<T = unknown>(
  method: string,
  params: Record<string, string | number> = {},
  timeoutMs = 8000,
): Promise<SubsonicResult<T>> {
  if (!hasCredentials()) return { ok: false, reason: 'no-credentials' };

  const auth = await generateAuthParams();
  const qs = new URLSearchParams({
    ...CORE_PARAMS,
    ...auth,
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)]),
    ),
  }).toString();

  const url = `${BASE_URL}/${method}?${qs}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Encoding': 'gzip' },
    });
    clearTimeout(timer);

    // Cloudflare tunnel / origin unreachable buckets.
    if (res.status === 404 || res.status === 502 || res.status === 522 || res.status === 530) {
      logEngineError(res.status, `tunnel HTTP ${res.status}`);
      return { ok: false, reason: 'tunnel', code: res.status };
    }

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      logEngineError(res.status, 'non-JSON response');
      return { ok: false, reason: 'server', code: res.status, message: 'non-JSON response' };
    }

    const resp = (body as {
      'subsonic-response'?: Record<string, unknown> & {
        status?: string;
        error?: { code?: number; message?: string };
      };
    })['subsonic-response'];

    if (!resp) {
      logEngineError(res.status, 'missing subsonic-response envelope');
      return { ok: false, reason: 'server', code: res.status, message: 'missing subsonic-response' };
    }

    if (resp.status === 'failed') {
      const code = resp.error?.code;
      const message = resp.error?.message;
      logEngineError(code, message);
      return { ok: false, reason: reasonForCode(code), code, message };
    }

    return { ok: true, data: resp as T };
  } catch (e) {
    clearTimeout(timer);
    const message = e instanceof Error ? e.message : String(e);
    // Abort / DNS / offline — not an engine error per se, but log for parity.
    logEngineError(undefined, `network: ${message}`);
    return { ok: false, reason: 'network', message };
  }
}

// ─── Vault mapping ──────────────────────────────────────────────────────────

/**
 * Vybe's normalized album shape. Keeps UI components decoupled from the raw
 * Subsonic envelope — every Vault rail reads from `LibraryItem`, never from
 * `subsonic-response.albumList2.album` directly.
 */
export interface LibraryItem {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  /** Raw Subsonic coverArt id — feed to `getCoverArt.view` for re-fetches. */
  coverArtId?: string;
  /** Pre-signed 512px cover art URL for the Pro Max display. */
  coverArtUrl?: string;
  year?: number;
  genre?: string;
  songCount?: number;
  /** Total album duration in seconds. */
  duration?: number;
  /** ISO8601 added-to-library timestamp (from Subsonic `created`). */
  createdAt?: string;
  /**
   * Lossless badge — drives the "FLAC / Lossless" chip in the Library UI.
   * Derived from Navidrome's `suffix` extension: `flac` → true. Stock
   * Subsonic responses don't include this field on albums, so servers
   * without the extension default to false (no badge, not "not lossless").
   */
  lossless: boolean;
}

/** Shape of a single album entry in `getAlbumList2.view` (Navidrome flavor). */
interface SubsonicAlbumRaw {
  id: string;
  name: string;
  artist: string;
  artistId?: string;
  coverArt?: string;
  year?: number;
  genre?: string;
  songCount?: number;
  duration?: number;
  created?: string;
  /** Navidrome / OpenSubsonic extension — 'flac', 'mp3', etc. */
  suffix?: string;
}

/**
 * Builds a pre-signed cover-art URL. Splits off from `subsonicFetch` because
 * this one returns a URL string (fed to `expo-image`), not a JSON envelope.
 * Uses fresh auth params so cache keys line up with the request URL.
 */
async function buildCoverArtUrl(coverArtId: string, size = 512): Promise<string> {
  const auth = await generateAuthParams();
  const qs = new URLSearchParams({
    ...CORE_PARAMS,
    ...auth,
    id: coverArtId,
    size: String(Math.max(32, Math.trunc(size))),
  }).toString();
  return `${BASE_URL}/getCoverArt.view?${qs}`;
}

async function normalizeAlbum(a: SubsonicAlbumRaw): Promise<LibraryItem> {
  return {
    id: a.id,
    name: a.name,
    artist: a.artist,
    artistId: a.artistId,
    coverArtId: a.coverArt,
    coverArtUrl: a.coverArt ? await buildCoverArtUrl(a.coverArt, 512) : undefined,
    year: a.year,
    genre: a.genre,
    songCount: a.songCount,
    duration: a.duration,
    createdAt: a.created,
    lossless: a.suffix?.toLowerCase() === 'flac',
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Pings the vault. `true` iff `subsonic-response.status === "ok"`. */
export async function ping(): Promise<boolean> {
  const r = await subsonicFetch('ping.view');
  return r.ok;
}

/**
 * Pulls the 50 newest albums and normalizes them for the Library "Recent"
 * section. One tunnel round-trip + N parallel auth-param generations for the
 * cover-art URLs.
 */
export async function getLibrary(): Promise<SubsonicResult<LibraryItem[]>> {
  const r = await subsonicFetch<{ albumList2?: { album?: SubsonicAlbumRaw[] } }>(
    'getAlbumList2.view',
    { type: 'newest', size: 50 },
  );
  if (!r.ok) return r;
  const raw = r.data.albumList2?.album ?? [];
  const items = await Promise.all(raw.map((a) => normalizeAlbum(a)));
  return { ok: true, data: items };
}

/**
 * Original-quality stream URL for a given song id. Forces `maxBitRate=0` so
 * FLAC / hi-res files pass through the tunnel untranscoded. Delegates to the
 * session-cached URL builder in `./subsonic/subsonicClient` so the stream
 * reuses a stable salt (avoids mid-playback auth churn).
 */
export async function getStreamUrl(id: string): Promise<string | null> {
  return buildStreamUrl(id);
}

export { hasCredentials };
