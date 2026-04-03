import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Track } from '@/types/music';
import { FreePDTrack } from '@/types/freepd';

/**
 * Downloaded track with local file info
 */
export interface DownloadedTrack extends Track {
  localFilePath: string;
  downloadedAt: number;
  fileSize: number;
  isComplete: boolean;
}

/**
 * Download task for tracking active downloads
 */
interface DownloadTask {
  trackId: string;
  downloadUrl: string;
  destinationPath: string;
  downloadResumable: FileSystem.DownloadResumable | null;
  startedAt: number;
}

/**
 * Serializable state for persistence
 */
interface PersistedDownloadState {
  downloads: [string, DownloadedTrack][];
}

/**
 * Download store state
 */
interface DownloadState {
  // Downloaded tracks (trackId -> DownloadedTrack)
  downloads: Map<string, DownloadedTrack>;

  // Download progress (trackId -> progress 0-1)
  downloadProgress: Map<string, number>;

  // Active download task IDs
  activeDownloads: Set<string>;

  // Internal: active download tasks (not persisted)
  _downloadTasks: Map<string, DownloadTask>;

  // Actions
  startDownload: (track: Track | FreePDTrack) => Promise<void>;
  cancelDownload: (trackId: string) => Promise<void>;
  removeDownload: (trackId: string) => Promise<void>;
  getDownloadedTrack: (trackId: string) => DownloadedTrack | undefined;
  isDownloaded: (trackId: string) => boolean;
  getDownloadProgress: (trackId: string) => number;
  isDownloading: (trackId: string) => boolean;
  getAllDownloads: () => DownloadedTrack[];
  getTotalStorageUsed: () => number;
  clearAllDownloads: () => Promise<void>;
}

// Download directory
const DOWNLOAD_DIR = `${FileSystem.documentDirectory}downloads/`;

/**
 * Ensures the download directory exists
 */
async function ensureDownloadDir(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
  }
}

/**
 * Generates a safe filename from track info
 */
function generateFilename(track: Track): string {
  const safeTitle = track.title
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 50);
  const safeArtist = track.artist
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 30);
  return `${safeArtist}_${safeTitle}_${track.id.substring(0, 8)}.mp3`;
}

export const useDownloadStore = create<DownloadState>()(
  persist(
    (set, get) => ({
      // Initial state
      downloads: new Map(),
      downloadProgress: new Map(),
      activeDownloads: new Set(),
      _downloadTasks: new Map(),

      /**
       * Starts downloading a track
       */
      startDownload: async (track: Track | FreePDTrack) => {
        const state = get();

        // Check if already downloaded
        if (state.downloads.has(track.id)) {
          console.log('Track already downloaded:', track.id);
          return;
        }

        // Check if already downloading
        if (state.activeDownloads.has(track.id)) {
          console.log('Track already downloading:', track.id);
          return;
        }

        // Get download URL
        const downloadUrl = track.audioUrl || track.downloadUrl;
        if (!downloadUrl) {
          console.error('No download URL available for track:', track.id);
          return;
        }

        // Ensure download directory exists
        await ensureDownloadDir();

        // Generate destination path
        const filename = generateFilename(track);
        const destinationPath = `${DOWNLOAD_DIR}${filename}`;

        // Mark as active
        set((state) => {
          const newActive = new Set(state.activeDownloads);
          newActive.add(track.id);
          const newProgress = new Map(state.downloadProgress);
          newProgress.set(track.id, 0);
          return {
            activeDownloads: newActive,
            downloadProgress: newProgress,
          };
        });

        try {
          // Create download callback for progress
          const progressCallback: FileSystem.DownloadProgressCallback = (
            progress
          ) => {
            const percent =
              progress.totalBytesExpectedToWrite > 0
                ? progress.totalBytesWritten /
                  progress.totalBytesExpectedToWrite
                : 0;

            set((state) => {
              const newProgress = new Map(state.downloadProgress);
              newProgress.set(track.id, percent);
              return { downloadProgress: newProgress };
            });
          };

          // Create download resumable
          const downloadResumable = FileSystem.createDownloadResumable(
            downloadUrl,
            destinationPath,
            {},
            progressCallback
          );

          // Store download task
          const downloadTask: DownloadTask = {
            trackId: track.id,
            downloadUrl,
            destinationPath,
            downloadResumable,
            startedAt: Date.now(),
          };

          set((state) => {
            const newTasks = new Map(state._downloadTasks);
            newTasks.set(track.id, downloadTask);
            return { _downloadTasks: newTasks };
          });

          // Start download
          const result = await downloadResumable.downloadAsync();

          if (result?.uri) {
            // Get file info for size
            const fileInfo = await FileSystem.getInfoAsync(result.uri);
            const fileSize = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;

            // Create downloaded track entry
            const downloadedTrack: DownloadedTrack = {
              ...track,
              localFilePath: result.uri,
              downloadedAt: Date.now(),
              fileSize,
              isComplete: true,
              isDownloaded: true,
            };

            // Update state
            set((state) => {
              const newDownloads = new Map(state.downloads);
              newDownloads.set(track.id, downloadedTrack);

              const newActive = new Set(state.activeDownloads);
              newActive.delete(track.id);

              const newProgress = new Map(state.downloadProgress);
              newProgress.delete(track.id);

              const newTasks = new Map(state._downloadTasks);
              newTasks.delete(track.id);

              return {
                downloads: newDownloads,
                activeDownloads: newActive,
                downloadProgress: newProgress,
                _downloadTasks: newTasks,
              };
            });

            console.log('Download complete:', track.id);
          }
        } catch (error) {
          console.error('Download failed:', error);

          // Clean up on failure
          set((state) => {
            const newActive = new Set(state.activeDownloads);
            newActive.delete(track.id);

            const newProgress = new Map(state.downloadProgress);
            newProgress.delete(track.id);

            const newTasks = new Map(state._downloadTasks);
            newTasks.delete(track.id);

            return {
              activeDownloads: newActive,
              downloadProgress: newProgress,
              _downloadTasks: newTasks,
            };
          });

          // Try to clean up partial file
          try {
            await FileSystem.deleteAsync(destinationPath, { idempotent: true });
          } catch {
            // Ignore cleanup errors
          }
        }
      },

      /**
       * Cancels an active download
       */
      cancelDownload: async (trackId: string) => {
        const state = get();
        const task = state._downloadTasks.get(trackId);

        if (task?.downloadResumable) {
          try {
            await task.downloadResumable.pauseAsync();
          } catch {
            // Ignore pause errors
          }

          // Clean up partial file
          try {
            await FileSystem.deleteAsync(task.destinationPath, {
              idempotent: true,
            });
          } catch {
            // Ignore cleanup errors
          }
        }

        // Update state
        set((state) => {
          const newActive = new Set(state.activeDownloads);
          newActive.delete(trackId);

          const newProgress = new Map(state.downloadProgress);
          newProgress.delete(trackId);

          const newTasks = new Map(state._downloadTasks);
          newTasks.delete(trackId);

          return {
            activeDownloads: newActive,
            downloadProgress: newProgress,
            _downloadTasks: newTasks,
          };
        });
      },

      /**
       * Removes a downloaded track
       */
      removeDownload: async (trackId: string) => {
        const state = get();
        const download = state.downloads.get(trackId);

        if (download?.localFilePath) {
          try {
            const fileInfo = await FileSystem.getInfoAsync(
              download.localFilePath
            );
            if (fileInfo.exists) {
              await FileSystem.deleteAsync(download.localFilePath);
            }
          } catch (error) {
            console.error('Error deleting file:', error);
          }
        }

        set((state) => {
          const newDownloads = new Map(state.downloads);
          newDownloads.delete(trackId);
          return { downloads: newDownloads };
        });
      },

      /**
       * Gets a downloaded track by ID
       */
      getDownloadedTrack: (trackId: string) => {
        return get().downloads.get(trackId);
      },

      /**
       * Checks if a track is downloaded
       */
      isDownloaded: (trackId: string) => {
        return get().downloads.has(trackId);
      },

      /**
       * Gets download progress for a track (0-1)
       */
      getDownloadProgress: (trackId: string) => {
        return get().downloadProgress.get(trackId) ?? 0;
      },

      /**
       * Checks if a track is currently downloading
       */
      isDownloading: (trackId: string) => {
        return get().activeDownloads.has(trackId);
      },

      /**
       * Gets all downloaded tracks as an array
       */
      getAllDownloads: () => {
        return Array.from(get().downloads.values());
      },

      /**
       * Gets total storage used by downloads
       */
      getTotalStorageUsed: () => {
        const downloads = get().downloads;
        let total = 0;
        downloads.forEach((track) => {
          total += track.fileSize || 0;
        });
        return total;
      },

      /**
       * Clears all downloads
       */
      clearAllDownloads: async () => {
        const state = get();

        // Cancel active downloads
        for (const trackId of state.activeDownloads) {
          await get().cancelDownload(trackId);
        }

        // Delete all downloaded files
        for (const [, download] of state.downloads) {
          if (download.localFilePath) {
            try {
              const fileInfo = await FileSystem.getInfoAsync(
                download.localFilePath
              );
              if (fileInfo.exists) {
                await FileSystem.deleteAsync(download.localFilePath);
              }
            } catch (error) {
              console.error('Error deleting file:', error);
            }
          }
        }

        set({
          downloads: new Map(),
          downloadProgress: new Map(),
          activeDownloads: new Set(),
          _downloadTasks: new Map(),
        });
      },
    }),
    {
      name: 'vybe-download-store',
      storage: createJSONStorage(() => AsyncStorage),
      // Custom serialization for Map
      partialize: (state): PersistedDownloadState => ({
        downloads: Array.from(state.downloads.entries()),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert array back to Map after rehydration
          const downloadsArray = state.downloads as unknown as [
            string,
            DownloadedTrack
          ][];
          state.downloads = new Map(downloadsArray);
          // Reset ephemeral state
          state.downloadProgress = new Map();
          state.activeDownloads = new Set();
          state._downloadTasks = new Map();
        }
      },
    }
  )
);

// Selector helpers for optimal re-renders
export const selectDownloads = (state: DownloadState) => state.downloads;
export const selectActiveDownloads = (state: DownloadState) =>
  state.activeDownloads;
export const selectDownloadProgress = (state: DownloadState) =>
  state.downloadProgress;

// Helper to format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
