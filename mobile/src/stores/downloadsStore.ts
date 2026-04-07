import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import * as FileSystem from 'expo-file-system';
import { NativeModules, Platform } from 'react-native';
import { Track } from '@/types/music';
import { getDownloadDir } from './storageSettingsStore';

// ── Live Activity bridge (iOS 16.1+ only) ─────────────────────────────────────
const LiveActivityBridge = Platform.OS === 'ios' ? NativeModules.VybeDownloadActivity : null;

async function laStartDownloadActivity(trackTitle: string, artistName: string): Promise<void> {
  try {
    await LiveActivityBridge?.startActivity(trackTitle, artistName);
  } catch {}
}

function laUpdateProgress(progress: number, statusText: string): void {
  try {
    LiveActivityBridge?.updateProgress(progress, statusText);
  } catch {}
}

function laEndActivity(success: boolean): void {
  try {
    LiveActivityBridge?.endActivity(success);
  } catch {}
}

// ── Serial download queue ──────────────────────────────────────────────────────
// Prevents simultaneous yt-dlp processes from aborting each other.
type QueueEntry = { id: string; fn: () => Promise<void> };
const _queue: QueueEntry[] = [];
let _queueRunning = false;

async function _processQueue(): Promise<void> {
  if (_queueRunning || _queue.length === 0) return;
  _queueRunning = true;
  while (_queue.length > 0) {
    const entry = _queue.shift()!;
    try { await entry.fn(); } catch (e) { console.error('[DownloadQueue]', e); }
  }
  _queueRunning = false;
}

/** Enqueue a download. Duplicate IDs are silently ignored. */
export function enqueueDownload(trackId: string, fn: () => Promise<void>): void {
  if (_queue.some(e => e.id === trackId)) return;
  _queue.push({ id: trackId, fn });
  _processQueue();
}

/** True if this track ID is currently waiting or running in the queue. */
export function isDownloadQueued(trackId: string): boolean {
  return _queue.some(e => e.id === trackId);
}

const downloadsStorage = new MMKV({ id: 'vybe-downloads-storage' });

const mmkvStorage = {
  getItem: (name: string) => {
    const value = downloadsStorage.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string) => {
    downloadsStorage.set(name, value);
  },
  removeItem: (name: string) => {
    downloadsStorage.delete(name);
  },
};

export interface DownloadedTrack extends Track {
  isDownloaded: true;
  localFilePath: string;
  importedAt: number;
  isUserImported: boolean;
  fileSize: number;
  fileFormat: string;
}

interface DownloadsState {
  downloads: DownloadedTrack[];
  isImporting: boolean;
  importProgress: number;

  // Actions
  addDownload: (track: DownloadedTrack) => void;
  removeDownload: (trackId: string) => Promise<void>;
  getDownloadedTrack: (trackId: string) => DownloadedTrack | undefined;
  isTrackDownloaded: (trackId: string) => boolean;
  setImporting: (isImporting: boolean) => void;
  setImportProgress: (progress: number) => void;
  getTotalStorageUsed: () => number;
  clearAllDownloads: () => Promise<void>;
}

export const useDownloadsStore = create<DownloadsState>()(
  persist(
    (set, get) => ({
      downloads: [],
      isImporting: false,
      importProgress: 0,

      addDownload: (track) => {
        set((state) => {
          // Don't add duplicates
          if (state.downloads.some(d => d.id === track.id)) {
            return state;
          }
          return { downloads: [...state.downloads, track] };
        });
      },

      removeDownload: async (trackId) => {
        const track = get().downloads.find(d => d.id === trackId);
        if (track?.localFilePath) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(track.localFilePath);
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(track.localFilePath);
            }
          } catch (error) {
            console.error('Error deleting file:', error);
          }
        }
        set((state) => ({
          downloads: state.downloads.filter(d => d.id !== trackId),
        }));
      },

      getDownloadedTrack: (trackId) => {
        return get().downloads.find(d => d.id === trackId);
      },

      isTrackDownloaded: (trackId) => {
        return get().downloads.some(d => d.id === trackId);
      },

      setImporting: (isImporting) => set({ isImporting }),

      setImportProgress: (progress) => set({ importProgress: progress }),

      getTotalStorageUsed: () => {
        return get().downloads.reduce((total, track) => total + (track.fileSize || 0), 0);
      },

      clearAllDownloads: async () => {
        const downloads = get().downloads;
        for (const track of downloads) {
          if (track.localFilePath) {
            try {
              const fileInfo = await FileSystem.getInfoAsync(track.localFilePath);
              if (fileInfo.exists) {
                await FileSystem.deleteAsync(track.localFilePath);
              }
            } catch (error) {
              console.error('Error deleting file:', error);
            }
          }
        }
        set({ downloads: [] });
      },
    }),
    {
      name: 'vybe-downloads',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({ downloads: state.downloads }),
    }
  )
);

// Helper to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Helper to get audio format from file extension
export function getAudioFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const formats: Record<string, string> = {
    mp3: 'MP3',
    m4a: 'AAC',
    aac: 'AAC',
    wav: 'WAV (Lossless)',
    flac: 'FLAC (Lossless)',
    alac: 'ALAC (Lossless)',
    ogg: 'OGG',
    opus: 'Opus',
  };
  return formats[ext] || ext.toUpperCase();
}

// Helper to check if format is lossless
export function isLosslessFormat(format: string): boolean {
  const lossless = ['wav', 'flac', 'alac', 'aiff'];
  return lossless.includes(format.toLowerCase());
}

/**
 * Download a YouTube track for offline playback.
 * Streams audio from the backend `GET /api/youtube/audio/:videoId` route
 * and saves it under the app documents directory.
 *
 * Usage:
 *   import { downloadYouTubeTrack } from '@/stores/downloadsStore';
 *   await downloadYouTubeTrack(track, 'https://192.168.x.x:3000');
 */
export async function downloadYouTubeTrack(
  track: Track & { youtubeId?: string; youtubeMusicId?: string },
  backendBaseUrl: string,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; error?: string }> {
  const videoId = track.youtubeId || track.youtubeMusicId;
  if (!videoId) {
    return { success: false, error: 'No YouTube video ID on this track' };
  }

  const store = useDownloadsStore.getState();

  if (store.isTrackDownloaded(track.id)) {
    return { success: true };
  }

  store.setImporting(true);
  store.setImportProgress(0);

  const trackTitle = track.title ?? 'Unknown track';
  const artistName = track.artist ?? 'Unknown artist';

  // Start Dynamic Island Live Activity
  await laStartDownloadActivity(trackTitle, artistName);

  const base = backendBaseUrl.replace(/\/$/, '');

  try {
    const { dir, isICloud } = await getDownloadDir();
    if (isICloud) console.log('[downloadYouTubeTrack] saving to iCloud:', dir);

    onProgress?.(0.01);
    store.setImportProgress(0.01);
    laUpdateProgress(0.01, 'Fetching from server…');

    // Use /download/ endpoint: backend uses yt-dlp to download to a temp file first,
    // then serves it with Content-Length. This is much faster than the /audio/ streaming
    // proxy because yt-dlp fetches from YouTube CDN at full server speed, and the mobile
    // then downloads over LAN in seconds instead of minutes.
    // 8-minute timeout covers: 3 min yt-dlp download + 5 min mobile transfer buffer.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 480_000);

    let resp: Response;
    try {
      resp = await fetch(`${base}/api/youtube/download/${videoId}`, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!resp.ok) {
      let reason = `Server error (${resp.status})`;
      try {
        const json = await resp.json();
        if (json?.error) reason = json.error;
      } catch {}
      throw new Error(reason);
    }

    laUpdateProgress(0.5, 'Saving to device…');

    // Detect actual format from Content-Type
    const ct = resp.headers.get('Content-Type') ?? '';
    const fileExt = ct.includes('mpeg') ? 'mp3' : 'm4a';
    const localFilePath = `${dir}yt_${videoId}.${fileExt}`;

    const buffer = await resp.arrayBuffer();
    const fileSize = buffer.byteLength;
    if (fileSize === 0) throw new Error('Downloaded file is empty');

    onProgress?.(0.9);
    store.setImportProgress(0.9);
    laUpdateProgress(0.9, 'Almost done…');

    // Convert to base64 in chunks to avoid call-stack overflow on large files
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...(bytes.subarray(i, i + chunkSize) as unknown as number[]));
    }
    const base64 = btoa(binary);

    await FileSystem.writeAsStringAsync(localFilePath, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    onProgress?.(1);
    store.setImportProgress(1);
    laUpdateProgress(1, 'Downloaded');

    const fileFormat = fileExt === 'mp3' ? 'MP3' : 'M4A';
    const downloadedTrack: DownloadedTrack = {
      ...track,
      isDownloaded: true,
      localFilePath,
      audioUrl: localFilePath,
      importedAt: Date.now(),
      isUserImported: false,
      fileSize,
      fileFormat,
    };

    store.addDownload(downloadedTrack);
    laEndActivity(true);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Download failed';
    console.error('[downloadYouTubeTrack]', msg);
    laEndActivity(false);
    return { success: false, error: msg };
  } finally {
    store.setImporting(false);
    store.setImportProgress(0);
  }
}

/**
 * Download a SoundCloud track for offline playback.
 * Uses the backend `GET /api/soundcloud/download?url=...` route which pre-downloads
 * via yt-dlp then serves the full file — same pattern as the YouTube download endpoint.
 */
export async function downloadSoundCloudTrack(
  track: Track & { soundcloudUrl?: string },
  backendBaseUrl: string,
  onProgress?: (progress: number) => void,
  /** When true, suppress isImporting UI state (used for background quality upgrades) */
  silent = false,
): Promise<{ success: boolean; error?: string }> {
  if (!track.soundcloudUrl) {
    return { success: false, error: 'No SoundCloud URL on this track' };
  }

  const store = useDownloadsStore.getState();

  if (store.isTrackDownloaded(track.id)) {
    return { success: true };
  }

  if (!silent) {
    store.setImporting(true);
    store.setImportProgress(0);
  }

  const trackTitle = track.title ?? 'Unknown track';
  const artistName = track.artist ?? 'Unknown artist';

  await laStartDownloadActivity(trackTitle, artistName);

  const base = backendBaseUrl.replace(/\/$/, '');
  const audioUrl = `${base}/api/soundcloud/download?url=${encodeURIComponent(track.soundcloudUrl)}`;

  try {
    const safeId = track.id.replace(/[^\w-]/g, '_');
    const { dir, isICloud } = await getDownloadDir();
    if (isICloud) console.log('[downloadSoundCloudTrack] saving to iCloud:', dir);

    onProgress?.(0.01);
    if (!silent) store.setImportProgress(0.01);
    laUpdateProgress(0.01, 'Fetching from server…');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300_000);

    let resp: Response;
    try {
      resp = await fetch(audioUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);

    laUpdateProgress(0.5, silent ? 'Upgrading quality…' : 'Saving to device…');

    // Detect format from Content-Type before buffering
    const respContentType = resp.headers.get('Content-Type') ?? '';
    const fileFormat = respContentType.includes('mpeg') ? 'MP3' : 'M4A';
    const fileExt = fileFormat === 'MP3' ? 'mp3' : 'm4a';
    const localFilePath = `${dir}sc_${safeId}.${fileExt}`;

    const buffer = await resp.arrayBuffer();
    const fileSize = buffer.byteLength;
    if (fileSize === 0) throw new Error('Downloaded file is empty');

    onProgress?.(0.9);
    if (!silent) store.setImportProgress(0.9);
    laUpdateProgress(0.9, 'Almost done…');

    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...(bytes.subarray(i, i + chunkSize) as unknown as number[]));
    }
    const base64 = btoa(binary);

    await FileSystem.writeAsStringAsync(localFilePath, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    onProgress?.(1);
    if (!silent) store.setImportProgress(1);
    laUpdateProgress(1, silent ? 'Quality upgraded' : 'Downloaded');

    const downloadedTrack: DownloadedTrack = {
      ...track,
      isDownloaded: true,
      localFilePath,
      audioUrl: localFilePath,
      importedAt: Date.now(),
      isUserImported: false,
      fileSize,
      fileFormat,
    };

    store.addDownload(downloadedTrack);
    laEndActivity(true);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Download failed';
    console.error('[downloadSoundCloudTrack]', msg);
    laEndActivity(false);
    return { success: false, error: msg };
  } finally {
    if (!silent) {
      store.setImporting(false);
      store.setImportProgress(0);
    }
  }
}
