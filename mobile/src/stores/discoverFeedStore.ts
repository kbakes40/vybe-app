import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/lib/api/api';

// Types for the discover feature
export interface DiscoverItem {
  id: string;
  sourcePlatform: 'YOUTUBE' | 'SOUNDCLOUD';
  title: string;
  creatorName: string;
  thumbnailUrl: string;
  externalUrl: string;
  deepLinkUrl: string;
  searchQuery: string;
  publishedAt: string | null;
  createdAt: string;
}

export interface DiscoverSection {
  id: string;
  title: string;
  subtitle?: string;
  items: DiscoverItem[];
}

export interface UserPreferences {
  genres: string[];
  moods: string[];
  favoriteArtists: string[];
  onboardingComplete: boolean;
  updatedAt: string | null;
}

// Event types for tracking
export type DiscoverEventType = 'impression' | 'open' | 'save' | 'hide';

interface DiscoverFeedState {
  // Feed sections
  sections: DiscoverSection[];

  // User preferences
  preferences: UserPreferences;

  // Cache management
  lastFetchedAt: number | null;
  cacheDurationMs: number;

  // Loading states
  isLoadingFeed: boolean;
  isLoadingPreferences: boolean;
  isSavingPreferences: boolean;

  // Errors
  feedError: string | null;
  preferencesError: string | null;

  // Actions
  fetchFeed: () => Promise<void>;
  refreshFeed: () => Promise<void>;
  fetchPreferences: () => Promise<void>;
  savePreferences: (preferences: Partial<UserPreferences>) => Promise<boolean>;
  completeOnboardingWithInstantFeed: (preferences: { genres: string[]; moods: string[]; favoriteArtists: string[] }) => Promise<boolean>;
  trackEvent: (itemId: string, eventType: DiscoverEventType, sectionId?: string, position?: number) => void;
  clearCache: () => void;

  // Getters
  isCacheValid: () => boolean;
  needsOnboarding: () => boolean;
}

// Default preferences
const defaultPreferences: UserPreferences = {
  genres: [],
  moods: [],
  favoriteArtists: [],
  onboardingComplete: false,
  updatedAt: null,
};

// Cache duration: 30 minutes
const DEFAULT_CACHE_DURATION_MS = 30 * 60 * 1000;

export const useDiscoverFeedStore = create<DiscoverFeedState>()(
  persist(
    (set, get) => ({
      // Initial state
      sections: [],
      preferences: defaultPreferences,
      lastFetchedAt: null,
      cacheDurationMs: DEFAULT_CACHE_DURATION_MS,
      isLoadingFeed: false,
      isLoadingPreferences: false,
      isSavingPreferences: false,
      feedError: null,
      preferencesError: null,

      // Fetch feed from backend
      fetchFeed: async () => {
        const state = get();

        // Check cache validity
        if (state.isCacheValid() && state.sections.length > 0) {
          console.log('[DiscoverFeed] Using cached feed');
          return;
        }

        set({ isLoadingFeed: true, feedError: null });

        try {
          const response = await api.get<{ sections: DiscoverSection[] }>('/api/discover/feed');

          if (response?.sections) {
            set({
              sections: response.sections,
              lastFetchedAt: Date.now(),
              isLoadingFeed: false,
            });
          } else {
            // Empty response - set empty sections
            set({
              sections: [],
              lastFetchedAt: Date.now(),
              isLoadingFeed: false,
            });
          }
        } catch (error) {
          console.error('[DiscoverFeed] Error fetching feed:', error);
          set({
            isLoadingFeed: false,
            feedError: error instanceof Error ? error.message : 'Failed to load recommendations',
          });
        }
      },

      // Force refresh feed (ignores cache)
      refreshFeed: async () => {
        set({ lastFetchedAt: null });
        await get().fetchFeed();
      },

      // Fetch user preferences
      fetchPreferences: async () => {
        set({ isLoadingPreferences: true, preferencesError: null });

        try {
          // Backend returns onboardingDone, we map to onboardingComplete
          const response = await api.get<{
            genres: string[];
            moods: string[];
            favoriteArtists: string[];
            onboardingDone: boolean;
            eraPreference: string | null;
          }>('/api/discover/preferences');

          if (response) {
            set({
              preferences: {
                genres: response.genres || [],
                moods: response.moods || [],
                favoriteArtists: response.favoriteArtists || [],
                onboardingComplete: response.onboardingDone ?? false,
                updatedAt: null,
              },
              isLoadingPreferences: false,
            });
          } else {
            set({ isLoadingPreferences: false });
          }
        } catch (error) {
          console.error('[DiscoverFeed] Error fetching preferences:', error);
          set({
            isLoadingPreferences: false,
            preferencesError: error instanceof Error ? error.message : 'Failed to load preferences',
          });
        }
      },

      // Save user preferences
      savePreferences: async (newPreferences) => {
        set({ isSavingPreferences: true, preferencesError: null });

        try {
          const currentPreferences = get().preferences;
          const mergedPreferences = {
            ...currentPreferences,
            ...newPreferences,
            onboardingComplete: true,
            updatedAt: new Date().toISOString(),
          };

          await api.post('/api/discover/preferences', mergedPreferences);

          set({
            preferences: mergedPreferences,
            isSavingPreferences: false,
          });

          // Invalidate cache so feed refreshes with new preferences
          set({ lastFetchedAt: null });

          return true;
        } catch (error) {
          console.error('[DiscoverFeed] Error saving preferences:', error);
          set({
            isSavingPreferences: false,
            preferencesError: error instanceof Error ? error.message : 'Failed to save preferences',
          });
          return false;
        }
      },

      // Complete onboarding and build instant personalized feed
      // Uses instant artist queries for immediate personalization
      completeOnboardingWithInstantFeed: async (prefs) => {
        console.log('[DiscoverFeed] Starting instant onboarding with picks:', {
          genres: prefs.genres,
          moods: prefs.moods,
          favoriteArtists: prefs.favoriteArtists,
        });

        set({ isSavingPreferences: true, isLoadingFeed: true, preferencesError: null, feedError: null });

        try {
          // Call instant onboarding endpoint which saves prefs AND builds feed
          const response = await api.post<{ sections: DiscoverSection[] }>('/api/discover/instant-onboarding', {
            genres: prefs.genres,
            moods: prefs.moods,
            favoriteArtists: prefs.favoriteArtists,
          });

          console.log('[DiscoverFeed] Instant onboarding response:', {
            hasSections: !!response?.sections,
            sectionCount: response?.sections?.length ?? 0,
            itemCounts: response?.sections?.map(s => ({ id: s.id, items: s.items?.length ?? 0 })) ?? [],
          });

          // Update local state with the instant feed
          if (response?.sections) {
            const totalItems = response.sections.reduce((sum, s) => sum + (s.items?.length ?? 0), 0);
            console.log('[DiscoverFeed] Total recommendations:', totalItems);

            set({
              sections: response.sections,
              preferences: {
                genres: prefs.genres,
                moods: prefs.moods,
                favoriteArtists: prefs.favoriteArtists,
                onboardingComplete: true,
                updatedAt: new Date().toISOString(),
              },
              lastFetchedAt: Date.now(),
              isSavingPreferences: false,
              isLoadingFeed: false,
            });
          } else {
            console.log('[DiscoverFeed] No sections in response, saving preferences only');
            set({
              preferences: {
                genres: prefs.genres,
                moods: prefs.moods,
                favoriteArtists: prefs.favoriteArtists,
                onboardingComplete: true,
                updatedAt: new Date().toISOString(),
              },
              isSavingPreferences: false,
              isLoadingFeed: false,
            });
          }

          return true;
        } catch (error) {
          console.error('[DiscoverFeed] Error completing onboarding:', error);
          set({
            isSavingPreferences: false,
            isLoadingFeed: false,
            preferencesError: error instanceof Error ? error.message : 'Failed to complete onboarding',
          });
          return false;
        }
      },

      // Track discovery events (fire and forget)
      trackEvent: (itemId, eventType, sectionId?: string, position?: number) => {
        // Fire and forget - don't block UI
        api.post('/api/discover/event', {
          discoverItemId: itemId,
          eventType,
          sectionId,
          position,
        }).catch((error) => {
          console.warn('[DiscoverFeed] Failed to track event:', error);
        });
      },

      // Clear all cached data
      clearCache: () => {
        set({
          sections: [],
          lastFetchedAt: null,
          feedError: null,
        });
      },

      // Check if cache is still valid
      isCacheValid: () => {
        const { lastFetchedAt, cacheDurationMs } = get();
        if (!lastFetchedAt) return false;
        return Date.now() - lastFetchedAt < cacheDurationMs;
      },

      // Check if user needs to complete onboarding
      needsOnboarding: () => {
        const { preferences } = get();
        return !preferences.onboardingComplete;
      },
    }),
    {
      name: 'vybe-discover-feed',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sections: state.sections,
        preferences: state.preferences,
        lastFetchedAt: state.lastFetchedAt,
      }),
    }
  )
);
