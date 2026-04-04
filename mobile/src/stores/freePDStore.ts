import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  FreePDTrack,
  FreePDCatalogResponse,
  FreePDCategory,
} from '@/types/freepd';
import {
  fetchFreePDCatalog,
  fetchFreePDTracks,
  searchFreePDTracks as apiSearchFreePDTracks,
  fetchFreePDGenres,
  refreshFreePDCatalog as apiRefreshCatalog,
} from '@/lib/api/freepd';

/**
 * Genre info with track count
 */
interface GenreInfo {
  name: string;
  count: number;
}

/**
 * FreePD store state
 */
interface FreePDState {
  // Data
  tracks: FreePDTrack[];
  genres: GenreInfo[];
  moods: string[];

  // Cached full catalog for offline use
  cachedCatalog: FreePDCatalogResponse | null;

  // Loading and error states
  isLoading: boolean;
  error: string | null;

  // Refresh tracking
  lastRefresh: number | null;

  // Search state
  searchQuery: string;
  searchResults: FreePDTrack[];
  isSearching: boolean;

  // Filter state
  selectedGenre: FreePDCategory | null;
  selectedMood: string | null;

  // Actions
  loadCatalog: () => Promise<void>;
  refreshCatalog: () => Promise<void>;
  searchTracks: (query: string) => Promise<void>;
  getTracksByGenre: (genre: FreePDCategory) => FreePDTrack[];
  getTracksByMood: (mood: string) => FreePDTrack[];
  clearError: () => void;
  setSelectedGenre: (genre: FreePDCategory | null) => void;
  setSelectedMood: (mood: string | null) => void;
  clearSearch: () => void;
  getTrackById: (id: string) => FreePDTrack | undefined;
}

// Cache duration: 1 hour
const CACHE_DURATION_MS = 60 * 60 * 1000;

// Debounce search timeout
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Retry a non-critical async operation with exponential backoff.
 * Swallows all errors silently — callers check the return value.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 1000
): Promise<T | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) {
        console.warn('[FreePD] All fetch attempts failed:', err instanceof Error ? err.message : err);
        return null;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.warn(`[FreePD] Fetch attempt ${attempt + 1} failed, retrying in ${delay}ms…`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return null;
}

export const useFreePDStore = create<FreePDState>()(
  persist(
    (set, get) => ({
      // Initial state
      tracks: [],
      genres: [],
      moods: [],
      cachedCatalog: null,
      isLoading: false,
      error: null,
      lastRefresh: null,
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      selectedGenre: null,
      selectedMood: null,

      /**
       * Loads the FreePD catalog (uses cache if fresh)
       */
      loadCatalog: async () => {
        const state = get();

        // Check if cache is still fresh
        if (
          state.cachedCatalog &&
          state.lastRefresh &&
          Date.now() - state.lastRefresh < CACHE_DURATION_MS
        ) {
          // Use cached data
          set({
            tracks: state.cachedCatalog.tracks,
            isLoading: false,
          });
          return;
        }

        // Don't block UI if we already have data
        if (state.tracks.length === 0) {
          set({ isLoading: true });
        }

        const [catalog, genresResponse] = await Promise.all([
          withRetry(() => fetchFreePDCatalog()),
          withRetry(() => fetchFreePDGenres()),
        ]);

        if (catalog?.success && catalog.tracks) {
          set({
            tracks: catalog.tracks,
            cachedCatalog: catalog,
            lastRefresh: Date.now(),
            error: null,
          });
        }

        if (genresResponse) {
          set({
            genres: genresResponse.genres || [],
            moods: genresResponse.moods || [],
          });
        }

        set({ isLoading: false });
      },

      /**
       * Forces a refresh of the catalog from the server
       */
      refreshCatalog: async () => {
        set({ isLoading: true, error: null });

        await withRetry(() => apiRefreshCatalog());

        const [catalog, genresResponse] = await Promise.all([
          withRetry(() => fetchFreePDCatalog()),
          withRetry(() => fetchFreePDGenres()),
        ]);

        if (catalog?.success && catalog.tracks) {
          set({
            tracks: catalog.tracks,
            cachedCatalog: catalog,
            lastRefresh: Date.now(),
          });
        }

        if (genresResponse) {
          set({
            genres: genresResponse.genres || [],
            moods: genresResponse.moods || [],
          });
        }

        set({ isLoading: false });
      },

      /**
       * Searches tracks with debouncing
       */
      searchTracks: async (query: string) => {
        set({ searchQuery: query });

        // Clear existing timeout
        if (searchTimeout) {
          clearTimeout(searchTimeout);
        }

        // If query is empty, clear results
        if (!query.trim()) {
          set({ searchResults: [], isSearching: false });
          return;
        }

        set({ isSearching: true });

        // Debounce the search
        searchTimeout = setTimeout(async () => {
          try {
            const state = get();

            // First try local search if we have cached tracks
            if (state.tracks.length > 0) {
              const lowerQuery = query.toLowerCase();
              const localResults = state.tracks.filter(
                (track) =>
                  track.title.toLowerCase().includes(lowerQuery) ||
                  track.artist.toLowerCase().includes(lowerQuery) ||
                  track.tags?.some((tag) =>
                    tag.toLowerCase().includes(lowerQuery)
                  ) ||
                  track.moodTags?.some((mood) =>
                    mood.toLowerCase().includes(lowerQuery)
                  )
              );

              if (localResults.length > 0) {
                set({ searchResults: localResults, isSearching: false });
                return;
              }
            }

            // Fall back to API search
            const response = await apiSearchFreePDTracks(query);
            set({
              searchResults: response?.tracks || [],
              isSearching: false,
            });
          } catch (error) {
            console.warn('[FreePD] Search error:', error instanceof Error ? error.message : error);
            set({ searchResults: [], isSearching: false });
          }
        }, SEARCH_DEBOUNCE_MS);
      },

      /**
       * Gets tracks filtered by genre (from cached data)
       */
      getTracksByGenre: (genre: FreePDCategory) => {
        const state = get();
        return state.tracks.filter(
          (track) => track.freePdCategory === genre
        );
      },

      /**
       * Gets tracks filtered by mood (from cached data)
       */
      getTracksByMood: (mood: string) => {
        const state = get();
        const lowerMood = mood.toLowerCase();
        return state.tracks.filter(
          (track) =>
            track.moodTags?.some((m) => m.toLowerCase() === lowerMood) ||
            track.tags?.some((t) => t.toLowerCase() === lowerMood)
        );
      },

      /**
       * Clears any error state
       */
      clearError: () => {
        set({ error: null });
      },

      /**
       * Sets the selected genre filter
       */
      setSelectedGenre: (genre: FreePDCategory | null) => {
        set({ selectedGenre: genre });
      },

      /**
       * Sets the selected mood filter
       */
      setSelectedMood: (mood: string | null) => {
        set({ selectedMood: mood });
      },

      /**
       * Clears search query and results
       */
      clearSearch: () => {
        if (searchTimeout) {
          clearTimeout(searchTimeout);
        }
        set({
          searchQuery: '',
          searchResults: [],
          isSearching: false,
        });
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
      name: 'vybe-freepd',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist essential data to avoid storage bloat
      partialize: (state) => ({
        tracks: state.tracks,
        genres: state.genres,
        moods: state.moods,
        cachedCatalog: state.cachedCatalog,
        lastRefresh: state.lastRefresh,
      }),
    }
  )
);

// Selector helpers for optimal re-renders
export const selectFreePDTracks = (state: FreePDState) => state.tracks;
export const selectFreePDGenres = (state: FreePDState) => state.genres;
export const selectFreePDMoods = (state: FreePDState) => state.moods;
export const selectFreePDIsLoading = (state: FreePDState) => state.isLoading;
export const selectFreePDError = (state: FreePDState) => state.error;
export const selectFreePDSearchResults = (state: FreePDState) => state.searchResults;
export const selectFreePDIsSearching = (state: FreePDState) => state.isSearching;
export const selectFreePDSearchQuery = (state: FreePDState) => state.searchQuery;
export const selectFreePDSelectedGenre = (state: FreePDState) => state.selectedGenre;
export const selectFreePDSelectedMood = (state: FreePDState) => state.selectedMood;
