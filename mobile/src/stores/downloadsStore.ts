import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import * as FileSystem from 'expo-file-system';
import { Track } from '@/types/music';

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

  const base = backendBaseUrl.replace(/\/$/, '');
  const audioUrl = `${base}/api/youtube/audio/${videoId}`;

  try {
    const fileName = `yt_${videoId}.mp4`;
    const dir = `${FileSystem.documentDirectory}vybe_downloads/`;
    const localFilePath = `${dir}${fileName}`;

    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

    const downloadResumable = FileSystem.createDownloadResumable(
      audioUrl,
      localFilePath,
      {},
      (downloadProgress) => {
        const total = downloadProgress.totalBytesExpectedToWrite;
        const progress =
          total > 0 ? downloadProgress.totalBytesWritten / total : 0;
        store.setImportProgress(progress);
        onProgress?.(progress);
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result || result.status !== 200) {
      throw new Error(`Download failed with status ${result?.status ?? 'unknown'}`);
    }

    const fileInfo = await FileSystem.getInfoAsync(localFilePath, { size: true });
    const fileSize =
      fileInfo.exists && 'size' in fileInfo ? (fileInfo.size ?? 0) : 0;

    const downloadedTrack: DownloadedTrack = {
      ...track,
      source: 'vybe',
      isDownloaded: true,
      localFilePath,
      audioUrl: localFilePath,
      importedAt: Date.now(),
      isUserImported: false,
      fileSize,
      fileFormat: 'MP4',
    };

    store.addDownload(downloadedTrack);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Download failed';
    console.error('[downloadYouTubeTrack]', msg);
    return { success: false, error: msg };
  } finally {
    store.setImporting(false);
    store.setImportProgress(0);
  }
}

/**
 * Download a SoundCloud track for offline playback.
 * Streams audio from the backend `GET /api/soundcloud/audio?url=...&dl=1` route
 * and saves it under the app documents directory.
 */
export async function downloadSoundCloudTrack(
  track: Track & { soundcloudUrl?: string },
  backendBaseUrl: string,
  onProgress?: (progress: number) => void
): Promise<{ success: boolean; error?: string }> {
  if (!track.soundcloudUrl) {
    return { success: false, error: 'No SoundCloud URL on this track' };
  }

  const store = useDownloadsStore.getState();

  if (store.isTrackDownloaded(track.id)) {
    return { success: true };
  }

  store.setImporting(true);
  store.setImportProgress(0);

  const base = backendBaseUrl.replace(/\/$/, '');
  const audioUrl = `${base}/api/soundcloud/audio?url=${encodeURIComponent(track.soundcloudUrl)}&dl=1`;

  try {
    const safeId = track.id.replace(/[^\w-]/g, '_');
    const fileName = `sc_${safeId}.m4a`;
    const dir = `${FileSystem.documentDirectory}vybe_downloads/`;
    const localFilePath = `${dir}${fileName}`;

    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

    const downloadResumable = FileSystem.createDownloadResumable(
      audioUrl,
      localFilePath,
      {},
      (downloadProgress) => {
        const total = downloadProgress.totalBytesExpectedToWrite;
        const progress = total > 0 ? downloadProgress.totalBytesWritten / total : 0;
        store.setImportProgress(progress);
        onProgress?.(progress);
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result || result.status !== 200) {
      throw new Error(`Download failed with status ${result?.status ?? 'unknown'}`);
    }

    const fileInfo = await FileSystem.getInfoAsync(localFilePath, { size: true });
    const fileSize = fileInfo.exists && 'size' in fileInfo ? (fileInfo.size ?? 0) : 0;

    const downloadedTrack: DownloadedTrack = {
      ...track,
      source: 'vybe',
      isDownloaded: true,
      localFilePath,
      audioUrl: localFilePath,
      importedAt: Date.now(),
      isUserImported: false,
      fileSize,
      fileFormat: 'M4A',
    };

    store.addDownload(downloadedTrack);
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Download failed';
    console.error('[downloadSoundCloudTrack]', msg);
    return { success: false, error: msg };
  } finally {
    store.setImporting(false);
    store.setImportProgress(0);
  }
}
