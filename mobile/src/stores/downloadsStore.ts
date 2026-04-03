import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Track } from '@/types/music';

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
      storage: createJSONStorage(() => AsyncStorage),
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
