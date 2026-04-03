import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Time ranges for greetings
type TimeRange = 'early_morning' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'late_night';

// Greetings for each time range - calm, modern, music-focused
const GREETINGS: Record<TimeRange, string[]> = {
  early_morning: [
    'Rise into the VYBE',
    'First light first sounds',
    'Start soft start right',
    'Dawn calls for music',
    'Wake up to your sound',
    'Early hours easy beats',
  ],
  morning: [
    'Set the tone',
    'Fresh sounds await',
    'Your morning soundtrack',
    'New day new rhythm',
    'Music moves the morning',
    'Good vibes only',
  ],
  midday: [
    'Keep the rhythm going',
    'Midday momentum',
    'Stay in the zone',
    'Flow through the day',
    'Sounds for the grind',
    'Peak hours peak sound',
  ],
  afternoon: [
    'Afternoon unwind',
    'Slow things down',
    'Ease into evening',
    'Golden hour sounds',
    'Let the music carry',
    'Drift into dusk',
  ],
  evening: [
    'Evening awaits',
    'Night sounds better',
    'Unwind your way',
    'Sunset sessions',
    'Time to feel the music',
    'Evening energy',
  ],
  night: [
    'Night sounds better',
    'Into the dark',
    'Nighttime frequency',
    'After hours audio',
    'The night is yours',
    'Sounds for the shadows',
  ],
  late_night: [
    'Quiet hours',
    'Deep into the night',
    'Late night frequencies',
    'Still awake still listening',
    'Night owl vibes',
    'The world sleeps you listen',
  ],
};

function getTimeRange(): TimeRange {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 9) return 'early_morning';
  if (hour >= 9 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 15) return 'midday';
  if (hour >= 15 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 21) return 'evening';
  if (hour >= 21 && hour < 24) return 'night';
  // 0-4
  return 'late_night';
}

function selectGreeting(timeRange: TimeRange, lastGreeting: string | null): string {
  const greetings = GREETINGS[timeRange];

  // Filter out the last shown greeting to avoid repetition
  const available = lastGreeting
    ? greetings.filter(g => g !== lastGreeting)
    : greetings;

  // If somehow all are filtered (shouldn't happen), use full list
  const pool = available.length > 0 ? available : greetings;

  // Random selection
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

interface GreetingState {
  currentGreeting: string;
  lastGreeting: string | null;
  lastRefreshTime: number;

  // Actions
  refreshGreeting: () => void;
  getGreeting: () => string;
}

export const useGreetingStore = create<GreetingState>()(
  persist(
    (set, get) => ({
      currentGreeting: '',
      lastGreeting: null,
      lastRefreshTime: 0,

      refreshGreeting: () => {
        const timeRange = getTimeRange();
        const lastGreeting = get().lastGreeting;
        const newGreeting = selectGreeting(timeRange, lastGreeting);

        set({
          currentGreeting: newGreeting,
          lastGreeting: newGreeting,
          lastRefreshTime: Date.now(),
        });
      },

      getGreeting: () => {
        const state = get();

        // If no greeting set yet, or if it's a new app open (more than 5 minutes since last refresh)
        const now = Date.now();
        const timeSinceRefresh = now - state.lastRefreshTime;
        const shouldRefresh = !state.currentGreeting || timeSinceRefresh > 5 * 60 * 1000;

        if (shouldRefresh) {
          state.refreshGreeting();
          return get().currentGreeting;
        }

        return state.currentGreeting;
      },
    }),
    {
      name: 'vybe-greeting-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastGreeting: state.lastGreeting,
        lastRefreshTime: state.lastRefreshTime,
      }),
    }
  )
);
