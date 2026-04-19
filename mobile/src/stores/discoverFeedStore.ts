import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/lib/api/api';
import { isDiscoverBackendFailure, raceWithDiscoverTimeout } from '@/lib/discoverRace';

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

  // Client-built Vybe Beats list (YouTube + SoundCloud tracks matched to the
  // user's onboarding answers). Used when the backend discover feed is
  // unavailable and as the data source for the Vybe Beats playlist screen.
  vybeBeats: DiscoverItem[];
  setVybeBeats: (items: DiscoverItem[]) => void;

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
      vybeBeats: [],
      setVybeBeats: (items) => set({ vybeBeats: items }),
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

        const cachedSectionsSnapshot = state.sections;

        set({ isLoadingFeed: true, feedError: null });

        try {
          const response = await raceWithDiscoverTimeout(
            api.get<{ sections: DiscoverSection[] }>('/api/discover/feed'),
          );

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
          // Backend discover routes are auth-gated — 401 is expected for
          // unauthenticated sessions. The discover tab has a client-side
          // fallback (public YouTube + SoundCloud search) that populates the
          // Vybe Beats card, so this isn't fatal for the user.
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('UNAUTHORIZED')) {
            console.warn('[DiscoverFeed] Feed fetch skipped (unauthenticated) — using local fallback');
          } else {
            console.warn('[DiscoverFeed] Feed fetch failed:', msg);
          }
          if (isDiscoverBackendFailure(error) && cachedSectionsSnapshot.length > 0) {
            console.warn('[DiscoverFeed] Restoring cached sections after server/timeout failure');
            set({
              sections: cachedSectionsSnapshot,
              isLoadingFeed: false,
              feedError: null,
            });
          } else {
            set({ isLoadingFeed: false });
          }
        }
      },

      // Force refresh feed (ignores cache)
      refreshFeed: async () => {
        set({ lastFetchedAt: null });
        await get().fetchFeed();
      },

      // Fetch user preferences
      fetchPreferences: async () => {
        const prefsSnapshot = get().preferences;
        set({ isLoadingPreferences: true, preferencesError: null });

        try {
          // Backend returns onboardingDone, we map to onboardingComplete
          const response = await raceWithDiscoverTimeout(
            api.get<{
              genres: string[];
              moods: string[];
              favoriteArtists: string[];
              onboardingDone: boolean;
              eraPreference: string | null;
            }>('/api/discover/preferences'),
          );

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
          // Same story as fetchFeed — 401 is expected when the user isn't
          // signed in. Local preferences (persisted via zustand) are still
          // the source of truth and the onboarding flow writes to them.
          const msg = error instanceof Error ? error.message : String(error);
          if (msg.includes('UNAUTHORIZED')) {
            console.warn('[DiscoverFeed] Preferences fetch skipped (unauthenticated) — using local state');
          } else {
            console.warn('[DiscoverFeed] Preferences fetch failed:', msg);
          }
          if (isDiscoverBackendFailure(error)) {
            set({ preferences: prefsSnapshot, isLoadingPreferences: false, preferencesError: null });
          } else {
            set({ isLoadingPreferences: false });
          }
        }
      },

      // Save user preferences
      savePreferences: async (newPreferences) => {
        set({ isSavingPreferences: true, preferencesError: null });

        const currentPreferences = get().preferences;
        const mergedPreferences = {
          ...currentPreferences,
          ...newPreferences,
          onboardingComplete: true,
          updatedAt: new Date().toISOString(),
        };

        // Persist locally first so onboarding always completes even if the
        // backend is unreachable or rejects the request (e.g. 401 during
        // guest sessions). The backend copy is best-effort.
        set({
          preferences: mergedPreferences,
          isSavingPreferences: false,
          lastFetchedAt: null,
        });

        try {
          await api.post('/api/discover/preferences', mergedPreferences);
          return true;
        } catch (error) {
          console.warn('[DiscoverFeed] Preferences saved locally; backend sync failed:', error);
          return true;
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

        const sectionsSnapshot = get().sections;

        // Persist locally first so the UI can proceed even if the backend is
        // unreachable or the user is unauthenticated.
        set({
          preferences: {
            genres: prefs.genres,
            moods: prefs.moods,
            favoriteArtists: prefs.favoriteArtists,
            onboardingComplete: true,
            updatedAt: new Date().toISOString(),
          },
          isSavingPreferences: true,
          isLoadingFeed: true,
          preferencesError: null,
          feedError: null,
        });

        try {
          const response = await raceWithDiscoverTimeout(
            api.post<{ sections: DiscoverSection[] }>('/api/discover/instant-onboarding', {
              genres: prefs.genres,
              moods: prefs.moods,
              favoriteArtists: prefs.favoriteArtists,
            }),
          );

          console.log('[DiscoverFeed] Instant onboarding response:', {
            hasSections: !!response?.sections,
            sectionCount: response?.sections?.length ?? 0,
          });

          if (response?.sections) {
            // Flatten only REAL tracks into Vybe Beats. Some backend items are
            // "Tap to search" placeholders — these have no real id prefix or
            // their creator name hints at the search prompt. Filter them out.
            const isRealTrack = (item: DiscoverItem) => {
              const idOk = /^yt-[\w-]+$|^sc-\d+$/.test(item.id);
              const creatorOk = !/tap to search/i.test(item.creatorName ?? '');
              const hasUrl = !!item.externalUrl && /^https?:\/\//.test(item.externalUrl);
              return idOk && creatorOk && hasUrl;
            };
            const beats: DiscoverItem[] = [];
            const seen = new Set<string>();
            for (const section of response.sections) {
              for (const item of section.items ?? []) {
                if (seen.has(item.id)) continue;
                if (!isRealTrack(item)) continue;
                seen.add(item.id);
                beats.push(item);
                if (beats.length >= 20) break;
              }
              if (beats.length >= 20) break;
            }
            set({
              sections: response.sections,
              vybeBeats: beats,
              lastFetchedAt: Date.now(),
              isSavingPreferences: false,
              isLoadingFeed: false,
            });
          } else {
            set({ isSavingPreferences: false, isLoadingFeed: false });
          }
          return true;
        } catch (error) {
          console.warn('[DiscoverFeed] Instant feed failed; local prefs kept:', error);
          if (isDiscoverBackendFailure(error) && sectionsSnapshot.length > 0) {
            set({
              sections: sectionsSnapshot,
              isSavingPreferences: false,
              isLoadingFeed: false,
              feedError: null,
            });
          } else {
            set({ isSavingPreferences: false, isLoadingFeed: false });
          }
          return true;
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

      // Discover-onboarding is disabled — always behave as if the user
      // already completed it so the feed loads straight from defaults and
      // nothing auto-navigates to /(app)/discover-onboarding.
      needsOnboarding: () => false,
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

/** Alias for engine wiring / logs — same as `useDiscoverFeedStore.getState().fetchFeed`. */
export function fetchSections(): Promise<void> {
  return useDiscoverFeedStore.getState().fetchFeed();
}
