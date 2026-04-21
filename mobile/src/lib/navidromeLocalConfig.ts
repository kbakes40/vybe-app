import { MMKV } from 'react-native-mmkv';

const KEY = 'navidromeCredentialsV1';
const mmkv = new MMKV({ id: 'vybe-navidrome-credentials' });

export type NavidromeStoredCredentials = {
  baseUrl: string;
  username: string;
  password: string;
};

function normalizeBaseUrl(input: string): string {
  return input.trim().replace(/\/$/, '');
}

/** In-app credentials take precedence over EXPO_PUBLIC_NAVIDROME_* at build time. */
export function loadNavidromeFromDisk(): NavidromeStoredCredentials | null {
  try {
    const raw = mmkv.getString(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<NavidromeStoredCredentials>;
    const baseUrl = normalizeBaseUrl(o.baseUrl ?? '');
    const username = (o.username ?? '').trim();
    const password = typeof o.password === 'string' ? o.password : '';
    if (!baseUrl || !username || !password) return null;
    return { baseUrl, username, password };
  } catch {
    return null;
  }
}

export function saveNavidromeToDisk(creds: NavidromeStoredCredentials): void {
  try {
    mmkv.set(
      KEY,
      JSON.stringify({
        baseUrl: normalizeBaseUrl(creds.baseUrl),
        username: creds.username.trim(),
        password: creds.password,
      }),
    );
  } catch {
    /* best-effort */
  }
}

export function clearNavidromeFromDisk(): void {
  try {
    mmkv.delete(KEY);
  } catch {
    /* best-effort */
  }
}
