import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MusicGenTrack,
  MusicGenCatalogResponse,
  MusicGenMood,
  MusicGenGenre,
  MusicGenAlbum,
} from '@/types/musicgen';
import {
  fetchMusicGenCatalog,
  fetchMusicGenTracks,
  fetchMusicGenFeatured,
  fetchMusicGenTracksByMood,
  fetchMusicGenTracksByGenre,
  fetchMusicGenStatus,
} from '@/lib/api/musicgen';

/**
 * MusicGen store state
 */
interface MusicGenState {
  // Data
  tracks: MusicGenTrack[];
  featuredTracks: MusicGenTrack[];
  albums: MusicGenAlbum[];
  moods: MusicGenMood[];
  genres: MusicGenGenre[];

  // Cached full catalog for offline use
  cachedCatalog: MusicGenCatalogResponse | null;

  // Service availability
  isAvailable: boolean;
  totalTracks: number;

  // Loading and error states
  isLoading: boolean;
  error: string | null;

  // Refresh tracking
  lastRefresh: number | null;

  // Filter state
  selectedMood: MusicGenMood | null;
  selectedGenre: MusicGenGenre | null;
  selectedAlbum: string | null;

  // Actions
  checkStatus: () => Promise<boolean>;
  loadCatalog: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
  getFeaturedTracks: () => MusicGenTrack[];
  getTracksByMood: (mood: MusicGenMood) => MusicGenTrack[];
  getTracksByGenre: (genre: MusicGenGenre) => MusicGenTrack[];
  getTracksByAlbum: (albumId: string) => MusicGenTrack[];
  setSelectedMood: (mood: MusicGenMood | null) => void;
  setSelectedGenre: (genre: MusicGenGenre | null) => void;
  setSelectedAlbum: (albumId: string | null) => void;
  clearFilters: () => void;
  clearError: () => void;
  getTrackById: (id: string) => MusicGenTrack | undefined;
}

// Cache duration: 30 minutes
const CACHE_DURATION_MS = 30 * 60 * 1000;

export const useMusicGenStore = create<MusicGenState>()(
  persist(
    (set, get) => ({
      // Initial state
      tracks: [],
      featuredTracks: [],
      albums: [],
      moods: [],
      genres: [],
      cachedCatalog: null,
      isAvailable: false,
      totalTracks: 0,
      isLoading: false,
      error: null,
      lastRefresh: null,
      selectedMood: null,
      selectedGenre: null,
      selectedAlbum: null,

      /**
       * Checks if MusicGen service is available
       */
      checkStatus: async () => {
        try {
          const status = await fetchMusicGenStatus();
          set({
            isAvailable: status.available,
            totalTracks: status.totalTracks,
          });
          return status.available;
        } catch (error) {
          console.error('MusicGen status check error:', error);
          set({ isAvailable: false });
          return false;
        }
      },

      /**
       * Loads the MusicGen catalog (uses cache if fresh)
       */
      loadCatalog: async () => {
        const state = get();

        // Check if cache is still fresh (30 minutes)
        if (
          state.cachedCatalog &&
          state.lastRefresh &&
          Date.now() - state.lastRefresh < CACHE_DURATION_MS
        ) {
          // Use cached data
          set({
            tracks: state.cachedCatalog.tracks,
            featuredTracks: state.cachedCatalog.featuredTracks,
            albums: state.cachedCatalog.albums,
            moods: state.cachedCatalog.moods,
            genres: state.cachedCatalog.genres,
            totalTracks: state.cachedCatalog.totalTracks,
            isAvailable: true,
            isLoading: false,
          });
          return;
        }

        // Don't block UI if we already have data
        if (state.tracks.length === 0) {
          set({ isLoading: true });
        }

        try {
          const catalog = await fetchMusicGenCatalog();

          set({
            tracks: catalog.tracks,
            featuredTracks: catalog.featuredTracks,
            albums: catalog.albums,
            moods: catalog.moods,
            genres: catalog.genres,
            totalTracks: catalog.totalTracks,
            cachedCatalog: catalog,
            lastRefresh: Date.now(),
            isAvailable: true,
            error: null,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to load MusicGen catalog';
          set({ error: errorMessage });
          console.error('MusicGen catalog load error:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      /**
       * Forces a refresh of the catalog from the server
       */
      refreshCatalog: async () => {
        set({ isLoading: true, error: null });

        try {
          const catalog = await fetchMusicGenCatalog();

          set({
            tracks: catalog.tracks,
            featuredTracks: catalog.featuredTracks,
            albums: catalog.albums,
            moods: catalog.moods,
            genres: catalog.genres,
            totalTracks: catalog.totalTracks,
            cachedCatalog: catalog,
            lastRefresh: Date.now(),
            isAvailable: true,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Failed to refresh MusicGen catalog';
          set({ error: errorMessage });
          console.error('MusicGen catalog refresh error:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      /**
       * Gets featured tracks (from cached data)
       */
      getFeaturedTracks: () => {
        const state = get();
        return state.featuredTracks;
      },

      /**
       * Gets tracks filtered by mood (from cached data)
       */
      getTracksByMood: (mood: MusicGenMood) => {
        const state = get();
        return state.tracks.filter((track) =>
          track.moods.includes(mood)
        );
      },

      /**
       * Gets tracks filtered by genre (from cached data)
       */
      getTracksByGenre: (genre: MusicGenGenre) => {
        const state = get();
        return state.tracks.filter((track) =>
          track.genres.includes(genre)
        );
      },

      /**
       * Gets tracks filtered by album (from cached data)
       */
      getTracksByAlbum: (albumId: string) => {
        const state = get();
        return state.tracks.filter((track) => track.albumId === albumId);
      },

      /**
       * Sets the selected mood filter
       */
      setSelectedMood: (mood: MusicGenMood | null) => {
        set({ selectedMood: mood });
      },

      /**
       * Sets the selected genre filter
       */
      setSelectedGenre: (genre: MusicGenGenre | null) => {
        set({ selectedGenre: genre });
      },

      /**
       * Sets the selected album filter
       */
      setSelectedAlbum: (albumId: string | null) => {
        set({ selectedAlbum: albumId });
      },

      /**
       * Clears all filters
       */
      clearFilters: () => {
        set({
          selectedMood: null,
          selectedGenre: null,
          selectedAlbum: null,
        });
      },

      /**
       * Clears any error state
       */
      clearError: () => {
        set({ error: null });
      },

      /**
       * Gets a single track by ID
       */
      getTrackById: (id: string) => {
        const state = get();
        return state.tracks.find((track) => track.id === id);
      },
    }),
    {
      name: 'vybe-musicgen',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist essential data to avoid storage bloat
      partialize: (state) => ({
        tracks: state.tracks,
        featuredTracks: state.featuredTracks,
        albums: state.albums,
        moods: state.moods,
        genres: state.genres,
        cachedCatalog: state.cachedCatalog,
        lastRefresh: state.lastRefresh,
        isAvailable: state.isAvailable,
        totalTracks: state.totalTracks,
      }),
    }
  )
);

// Selector helpers for optimal re-renders
export const selectMusicGenTracks = (state: MusicGenState) => state.tracks;
export const selectMusicGenFeaturedTracks = (state: MusicGenState) => state.featuredTracks;
export const selectMusicGenAlbums = (state: MusicGenState) => state.albums;
export const selectMusicGenMoods = (state: MusicGenState) => state.moods;
export const selectMusicGenGenres = (state: MusicGenState) => state.genres;
export const selectMusicGenIsLoading = (state: MusicGenState) => state.isLoading;
export const selectMusicGenError = (state: MusicGenState) => state.error;
export const selectMusicGenIsAvailable = (state: MusicGenState) => state.isAvailable;
export const selectMusicGenTotalTracks = (state: MusicGenState) => state.totalTracks;
export const selectMusicGenSelectedMood = (state: MusicGenState) => state.selectedMood;
export const selectMusicGenSelectedGenre = (state: MusicGenState) => state.selectedGenre;
export const selectMusicGenSelectedAlbum = (state: MusicGenState) => state.selectedAlbum;
