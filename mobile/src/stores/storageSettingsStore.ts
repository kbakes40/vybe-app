import { create } from 'zustand';
import { MMKV } from 'react-native-mmkv';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const storage = new MMKV({ id: 'vybe-storage-settings' });

// ── Synchronous raw getter ─────────────────────────────────────────────────────
// Used in download functions outside React component context.
export function getPreferICloud(): boolean {
  return storage.getBoolean('storage_prefer_icloud') ?? false;
}

// ── Reactive Zustand store ────────────────────────────────────────────────────

interface StorageSettingsState {
  preferICloud: boolean;
  setPreferICloud: (v: boolean) => void;
}

export const useStorageSettingsStore = create<StorageSettingsState>()((set) => ({
  // Hydrate directly from MMKV so no persist middleware is needed
  preferICloud: storage.getBoolean('storage_prefer_icloud') ?? false,
  setPreferICloud: (v) => {
    storage.set('storage_prefer_icloud', v);
    set({ preferICloud: v });
  },
}));

// ── iCloud path probe ─────────────────────────────────────────────────────────
// Returns the iCloud save directory if accessible, null otherwise.
// On iOS without iCloud Documents entitlement the probe write will fail and
// we return null, causing callers to fall back to the local directory.

export async function probeICloudDir(): Promise<string | null> {
  if (Platform.OS !== 'ios' || !FileSystem.documentDirectory) return null;

  try {
    // documentDirectory = file:///private/var/mobile/Containers/Data/Application/{UUID}/Documents/
    // Attempt to reach the shared iCloud Drive container by going up from Documents/
    const containerRoot = FileSystem.documentDirectory.replace(/\/Documents\/$/, '/');
    const iCloudDir = `${containerRoot}Library/Mobile Documents/com~apple~CloudDocs/VYBE/`;

    await FileSystem.makeDirectoryAsync(iCloudDir, { intermediates: true });

    // Write + delete a probe file to confirm write access
    const probe = `${iCloudDir}.vybe_probe`;
    await FileSystem.writeAsStringAsync(probe, '', {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await FileSystem.deleteAsync(probe, { idempotent: true });

    return iCloudDir;
  } catch {
    return null;
  }
}

// ── getDownloadDir ────────────────────────────────────────────────────────────
// Call this at the start of every download to determine where to save the file.
// Returns { dir, isICloud } — dir always ends with '/'.

export async function getDownloadDir(): Promise<{ dir: string; isICloud: boolean }> {
  const localDir = `${FileSystem.documentDirectory}vybe_downloads/`;

  if (getPreferICloud()) {
    const iCloudDir = await probeICloudDir();
    if (iCloudDir) {
      await FileSystem.makeDirectoryAsync(iCloudDir, { intermediates: true }).catch(() => null);
      return { dir: iCloudDir, isICloud: true };
    }
    // iCloud not accessible — fall through to local with a console note
    console.log('[Storage] iCloud path not accessible (needs entitlement). Using local.');
  }

  await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
  return { dir: localDir, isICloud: false };
}

/** Offline cache under Caches (not surfaced in Files app). Used by Shadow Sync. */
export async function getShadowSyncDir(): Promise<string> {
  const root = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!root) throw new Error('[ShadowSync] No writable directory');
  const dir = `${root}shadow_cache/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => null);
  return dir;
}

/** Stable hashed filename — avoids predictable titles in the filesystem. */
export function shadowSyncFilename(trackId: string, ext: 'm4a' | 'mp3' = 'm4a'): string {
  let h = 5381;
  for (let i = 0; i < trackId.length; i++) {
    h = ((h << 5) + h) ^ trackId.charCodeAt(i);
  }
  const hex = (h >>> 0).toString(16);
  const safe = trackId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return `${hex}_${safe}.${ext}`;
}
