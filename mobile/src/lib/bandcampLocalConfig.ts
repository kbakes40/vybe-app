import { MMKV } from 'react-native-mmkv';

const KEY = 'bandcampIdentityV1';
const mmkv = new MMKV({ id: 'vybe-bandcamp-identity' });

/** Raw Cookie header value for authenticated Bandcamp Fan API calls. */
export type BandcampIdentity = {
  /** Full `Cookie` header (e.g. `client_id=…; BACKEND=…`). */
  cookie: string;
  /** Numeric fan id from Bandcamp account (required for fancollection API). */
  fanId: string;
};

export function loadBandcampIdentityFromDisk(): BandcampIdentity | null {
  try {
    const raw = mmkv.getString(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<BandcampIdentity>;
    if (!o.cookie?.trim() || !o.fanId?.trim()) return null;
    return { cookie: o.cookie.trim(), fanId: String(o.fanId).trim() };
  } catch {
    return null;
  }
}

export function saveBandcampIdentityToDisk(id: BandcampIdentity): void {
  try {
    mmkv.set(KEY, JSON.stringify({ cookie: id.cookie.trim(), fanId: id.fanId.trim() }));
  } catch {
    /* best-effort */
  }
}

export function clearBandcampIdentityFromDisk(): void {
  try {
    mmkv.delete(KEY);
  } catch {
    /* best-effort */
  }
}

/** Env: single JSON `{"cookie":"...","fanId":"..."}` or split vars. */
export function getActiveBandcampIdentity(): BandcampIdentity | null {
  const disk = loadBandcampIdentityFromDisk();
  if (disk) return disk;
  const raw = (process.env.EXPO_PUBLIC_BANDCAMP_IDENTITY ?? '').trim();
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<BandcampIdentity>;
    if (o.cookie?.trim() && o.fanId?.trim()) {
      return { cookie: o.cookie.trim(), fanId: String(o.fanId).trim() };
    }
  } catch {
    /* ignore */
  }
  return null;
}
