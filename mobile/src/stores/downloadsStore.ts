import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import * as FileSystem from 'expo-file-system';
import { NativeModules, Platform } from 'react-native';
import { Track } from '@/types/music';
import { getShadowSyncDir, shadowSyncFilename } from './storageSettingsStore';
import {
  getVybeDownloadActivityModule,
  startVybeDownloadLiveActivity,
  takeLiveActivityFeedSnapshot,
} from '@/lib/audio/PlaybackController';

// ── Native background downloader (iOS only) ─────────────────────────────────
// Uses URLSession.background so downloads keep running — and the Dynamic
// Island Live Activity keeps updating — when the user backgrounds the app.
// Android falls back to expo-file-system below.
const NativeDownloader = Platform.OS === 'ios' ? NativeModules.VybeDownloader : null;

async function nativeDownload(args: {
  url: string;
  destPath: string;
  trackId: string;
  trackTitle: string;
  artistName: string;
  artworkUrl?: string;
  onProgress?: (progress: number) => void;
}): Promise<{ filePath: string; fileSize: number; fileFormat: 'M4A' | 'MP3' }> {
  if (!NativeDownloader) throw new Error('Native downloader unavailable');

  // Subscribe to progress events from Swift — per-trackId so concurrent
  // downloads don't overwrite each other's progress callbacks.
  const { NativeEventEmitter } = require('react-native');
  const emitter = new NativeEventEmitter(NativeDownloader);
  const sub = emitter.addListener('onDownloadProgress', (evt: { trackId: string; progress: number }) => {
    if (evt.trackId === args.trackId) args.onProgress?.(evt.progress);
  });

  try {
    const result = await NativeDownloader.startDownload({
      url: args.url,
      destPath: args.destPath,
      trackId: args.trackId,
      trackTitle: args.trackTitle,
      artistName: args.artistName,
      ...(args.artworkUrl ? { artworkUrl: args.artworkUrl } : {}),
    });
    return {
      filePath: result.filePath,
      fileSize: typeof result.fileSize === 'number' ? result.fileSize : Number(result.fileSize ?? 0),
      fileFormat: result.fileFormat === 'MP3' ? 'MP3' : 'M4A',
    };
  } finally {
    sub.remove();
  }
}

async function laStartDownloadActivity(
  trackTitle: string,
  artistName: string,
  artworkUrl: string = '',
): Promise<void> {
  // Reset throttle state so the next track's first progress update fires
  // immediately instead of being blocked by the previous track's throttle window.
  if (_laFlushTimer) { clearTimeout(_laFlushTimer); _laFlushTimer = null; }
  _laPending = null;
  _laLastSentAt = 0;
  try {
    await startVybeDownloadLiveActivity({ trackTitle, artistName, artworkUrl });
  } catch {
    /* ActivityKit optional */
  }
}

// Throttle ActivityKit updates — iOS rate-limits activity.update() to ~60/min
// and silently drops excess. createDownloadResumable can fire its callback
// dozens of times per second. We coalesce: send at most once per 200ms, but
// always send the final (100%) update so the completion state is never lost.
let _laLastSentAt = 0;
let _laPending: { progress: number; statusText: string } | null = null;
let _laFlushTimer: ReturnType<typeof setTimeout> | null = null;
const LA_MIN_INTERVAL_MS = 200;

function _laFlush(): void {
  if (!_laPending) return;
  const { progress, statusText } = _laPending;
  _laPending = null;
  _laLastSentAt = Date.now();
  try {
    getVybeDownloadActivityModule()?.updateProgress(progress, statusText, takeLiveActivityFeedSnapshot());
  } catch {}
}

function laUpdateProgress(progress: number, statusText: string): void {
  if (!getVybeDownloadActivityModule()) return;
  const now = Date.now();
  const sinceLast = now - _laLastSentAt;

  // Always let the final (>= 0.98) update through immediately so completion
  // isn't delayed by an in-flight throttle timer.
  if (progress >= 0.98) {
    if (_laFlushTimer) { clearTimeout(_laFlushTimer); _laFlushTimer = null; }
    _laPending = { progress, statusText };
    _laFlush();
    return;
  }

  _laPending = { progress, statusText };
  if (sinceLast >= LA_MIN_INTERVAL_MS) {
    if (_laFlushTimer) { clearTimeout(_laFlushTimer); _laFlushTimer = null; }
    _laFlush();
  } else if (!_laFlushTimer) {
    _laFlushTimer = setTimeout(() => {
      _laFlushTimer = null;
      _laFlush();
    }, LA_MIN_INTERVAL_MS - sinceLast);
  }
}

function laEndActivity(success: boolean): void {
  if (_laFlushTimer) { clearTimeout(_laFlushTimer); _laFlushTimer = null; }
  _laPending = null;
  _laLastSentAt = 0;
  try {
    getVybeDownloadActivityModule()?.endActivity(success);
  } catch (e) {
    console.log('[LiveActivity] endActivity ERROR', e);
  }
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
  /** Track rows showing vault cloud sync pulse (POST /api/vault/save in flight). */
  vaultCloudActiveById: Record<string, boolean>;

  // Actions
  addDownload: (track: DownloadedTrack) => void;
  removeDownload: (trackId: string) => Promise<void>;
  getDownloadedTrack: (trackId: string) => DownloadedTrack | undefined;
  isTrackDownloaded: (trackId: string) => boolean;
  setImporting: (isImporting: boolean) => void;
  setImportProgress: (progress: number) => void;
  setVaultCloudPulse: (trackId: string, active: boolean) => void;
  getTotalStorageUsed: () => number;
  clearAllDownloads: () => Promise<void>;
}

// Shadow index — Map<trackId, DownloadedTrack>. Rebuilt whenever the
// downloads array changes so isTrackDownloaded / getDownloadedTrack are
// O(1) instead of O(n). Every track row in the app calls these on every
// render, so at 1000+ downloads the linear-scan version was doing tens of
// thousands of comparisons per render pass.
let _downloadsIndex: Map<string, DownloadedTrack> = new Map();
function _rebuildIndex(list: DownloadedTrack[]): Map<string, DownloadedTrack> {
  const map = new Map<string, DownloadedTrack>();
  for (const t of list) map.set(t.id, t);
  return map;
}

export const useDownloadsStore = create<DownloadsState>()(
  persist(
    (set, get) => ({
      downloads: [],
      isImporting: false,
      importProgress: 0,
      vaultCloudActiveById: {},

      addDownload: (track) => {
        set((state) => {
          if (_downloadsIndex.has(track.id)) return state;
          const next = [...state.downloads, track];
          _downloadsIndex = _rebuildIndex(next);
          return { downloads: next };
        });
      },

      removeDownload: async (trackId) => {
        const track = _downloadsIndex.get(trackId);
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
        set((state) => {
          const next = state.downloads.filter(d => d.id !== trackId);
          _downloadsIndex = _rebuildIndex(next);
          return { downloads: next };
        });
      },

      getDownloadedTrack: (trackId) => _downloadsIndex.get(trackId),

      isTrackDownloaded: (trackId) => _downloadsIndex.has(trackId),

      setImporting: (isImporting) => set({ isImporting }),

      setImportProgress: (progress) => set({ importProgress: progress }),

      setVaultCloudPulse: (trackId, active) =>
        set((s) => {
          const next = { ...s.vaultCloudActiveById };
          if (active) next[trackId] = true;
          else delete next[trackId];
          return { vaultCloudActiveById: next };
        }),

      getTotalStorageUsed: () => {
        return get().downloads.reduce((total, track) => total + (track.fileSize || 0), 0);
      },

      clearAllDownloads: async () => {
        const downloads = get().downloads;
        // Fire all deletes in parallel — at 1000 tracks this goes from ~30s
        // sequential down to a couple seconds. expo-file-system handles the
        // concurrent IO fine.
        await Promise.all(
          downloads.map(async (track) => {
            if (!track.localFilePath) return;
            try {
              const fileInfo = await FileSystem.getInfoAsync(track.localFilePath);
              if (fileInfo.exists) {
                await FileSystem.deleteAsync(track.localFilePath);
              }
            } catch (error) {
              console.error('Error deleting file:', error);
            }
          })
        );
        _downloadsIndex = new Map();
        set({ downloads: [] });
      },
    }),
    {
      name: 'vybe-downloads',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({ downloads: state.downloads }),
      onRehydrateStorage: () => (state) => {
        // Build the O(1) lookup index once the persisted array lands in
        // state. Without this, the first isTrackDownloaded calls on app
        // boot would miss because the index hasn't been populated yet.
        if (state?.downloads) {
          _downloadsIndex = _rebuildIndex(state.downloads);
        }
      },
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
 * Shadow Sync: pull audio from the Railway proxy and cache locally (file://) for instant playback.
 * JS path uses expo-file-system `downloadAsync`; iOS may use the native Sync Engine when available.
 */
export async function downloadYouTubeTrack(
  track: Track & { youtubeId?: string; youtubeMusicId?: string },
  backendBaseUrl: string,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; error?: string }> {
  const videoId = track.youtubeId || track.youtubeMusicId;
  if (!videoId) {
    return { success: false, error: 'No stream ID on this track' };
  }

  const store = useDownloadsStore.getState();

  if (store.isTrackDownloaded(track.id)) {
    return { success: true };
  }

  store.setImporting(true);
  store.setImportProgress(0);

  const trackTitle = track.title ?? 'Unknown track';
  const artistName = track.artist ?? 'Unknown artist';

  // On iOS with the native downloader, Swift owns the Live Activity
  // lifecycle (start/update/end) so that pill updates keep flowing even
  // when the app is backgrounded. The Android fallback path still uses
  // the JS-driven Live Activity bridge.
  if (!NativeDownloader) {
    await laStartDownloadActivity(trackTitle, artistName, track.artwork ?? '');
  }

  const base = backendBaseUrl.replace(/\/$/, '');

  store.setVaultCloudPulse(track.id, true);
  void fetch(`${base}/api/vault/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      title: trackTitle,
      artist: artistName,
      soundcloudUrl: (track as Track & { soundcloudUrl?: string }).soundcloudUrl,
    }),
  })
    .catch(() => {})
    .finally(() => {
      setTimeout(() => store.setVaultCloudPulse(track.id, false), 2400);
    });

  try {
    const dir = await getShadowSyncDir();
    onProgress?.(0.01);
    store.setImportProgress(0.01);

    const destM4a = `${dir}${shadowSyncFilename(track.id, 'm4a')}`;
    const downloadUrl = `${base}/api/youtube/download/${videoId}`;

    let localFilePath: string;
    let fileSize: number;
    let fileFormat: 'M4A' | 'MP3';

    if (NativeDownloader) {
      const res = await nativeDownload({
        url: downloadUrl,
        destPath: destM4a,
        trackId: track.id,
        trackTitle,
        artistName,
        artworkUrl: track.artwork ?? '',
        onProgress: (ratio) => {
          const mapped = 0.02 + ratio * 0.93;
          onProgress?.(mapped);
          store.setImportProgress(mapped);
        },
      });
      localFilePath = res.filePath;
      fileSize = res.fileSize;
      fileFormat = res.fileFormat;
    } else {
      laUpdateProgress(0.02, 'Starting…');
      onProgress?.(0.02);
      store.setImportProgress(0.02);
      const result = await FileSystem.downloadAsync(downloadUrl, destM4a);
      if (!result || result.status !== 200) {
        throw new Error(`Server error (${result?.status ?? 'no response'})`);
      }
      const ct = (result.headers?.['Content-Type'] ?? result.headers?.['content-type'] ?? '') as string;
      localFilePath = result.uri;
      fileFormat = 'M4A';
      if (ct.includes('mpeg')) {
        fileFormat = 'MP3';
        const mp3Path = `${dir}${shadowSyncFilename(track.id, 'mp3')}`;
        await FileSystem.moveAsync({ from: localFilePath, to: mp3Path });
        localFilePath = mp3Path;
      }
      const info = await FileSystem.getInfoAsync(localFilePath);
      fileSize = (info.exists && 'size' in info ? info.size : 0) || 0;
      if (fileSize === 0) throw new Error('Synced file is empty');
      laUpdateProgress(1, 'Synced');
      onProgress?.(0.96);
      store.setImportProgress(0.96);
    }

    onProgress?.(1);
    store.setImportProgress(1);
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
    if (!NativeDownloader) laEndActivity(true);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Sync failed';
    console.error('[ShadowSync]', msg);
    if (!NativeDownloader) laEndActivity(false);
    return { success: false, error: msg };
  } finally {
    store.setImporting(false);
    store.setImportProgress(0);
  }
}

/**
 * Shadow Sync for SoundCloud — same cache directory as web stream tracks.
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

  if (!NativeDownloader) {
    await laStartDownloadActivity(trackTitle, artistName, track.artwork ?? '');
  }

  const base = backendBaseUrl.replace(/\/$/, '');
  const audioUrl = `${base}/api/soundcloud/download?url=${encodeURIComponent(track.soundcloudUrl)}`;

  try {
    const dir = await getShadowSyncDir();

    onProgress?.(0.01);
    if (!silent) store.setImportProgress(0.01);

    const tempPath = `${dir}${shadowSyncFilename(track.id, 'm4a')}`;

    let localFilePath: string;
    let fileSize: number;
    let fileFormat: 'M4A' | 'MP3';

    if (NativeDownloader) {
      const res = await nativeDownload({
        url: audioUrl,
        destPath: tempPath,
        trackId: track.id,
        trackTitle,
        artistName,
        artworkUrl: track.artwork ?? '',
        onProgress: (ratio) => {
          const mapped = 0.02 + ratio * 0.93;
          onProgress?.(mapped);
          if (!silent) store.setImportProgress(mapped);
        },
      });
      localFilePath = res.filePath;
      fileSize = res.fileSize;
      fileFormat = res.fileFormat;
    } else {
      laUpdateProgress(0.01, 'Starting…');
      const resumable = FileSystem.createDownloadResumable(
        audioUrl,
        tempPath,
        {},
        (progress) => {
          const { totalBytesWritten, totalBytesExpectedToWrite } = progress;
          if (totalBytesExpectedToWrite > 0) {
            const ratio = totalBytesWritten / totalBytesExpectedToWrite;
            const mapped = 0.02 + ratio * 0.93;
            onProgress?.(mapped);
            if (!silent) store.setImportProgress(mapped);
            laUpdateProgress(mapped, silent ? `Upgrading ${trackTitle} · ${Math.round(ratio * 100)}%` : `${trackTitle} · ${Math.round(ratio * 100)}%`);
          }
        },
      );
      const result = await resumable.downloadAsync();
      if (!result || result.status !== 200) {
        throw new Error(`Server returned ${result?.status ?? 'no response'}`);
      }
      const respContentType = (result.headers?.['Content-Type'] ?? result.headers?.['content-type'] ?? '') as string;
      fileFormat = 'M4A';
      localFilePath = tempPath;
      if (respContentType.includes('mpeg')) {
        fileFormat = 'MP3';
        localFilePath = `${dir}${shadowSyncFilename(track.id, 'mp3')}`;
        await FileSystem.moveAsync({ from: tempPath, to: localFilePath });
      }
      const info = await FileSystem.getInfoAsync(localFilePath);
      fileSize = (info.exists && 'size' in info ? info.size : 0) || 0;
      if (fileSize === 0) throw new Error('Synced file is empty');
      laUpdateProgress(1, silent ? 'Quality upgraded' : 'Synced');
    }

    onProgress?.(1);
    if (!silent) store.setImportProgress(1);

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
    if (!NativeDownloader) laEndActivity(true);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Sync failed';
    console.error('[ShadowSync:SoundCloud]', msg);
    if (!NativeDownloader) laEndActivity(false);
    return { success: false, error: msg };
  } finally {
    if (!silent) {
      store.setImporting(false);
      store.setImportProgress(0);
    }
  }
}

/** Alias for store reviewers / call sites preferring “sync” wording. */
export { downloadYouTubeTrack as syncWebStreamTrackOffline };
