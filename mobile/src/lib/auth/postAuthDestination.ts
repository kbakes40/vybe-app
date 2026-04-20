import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/lib/api/api';

/** Same key as `onboarding.tsx` — local proof the style picker finished. */
export const ONBOARDING_VIBES_STORAGE_KEY = '@vybe/onboarding_vibes';

export type PostAuthHref = '/(app)/(tabs)' | '/onboarding';

async function hasLocalVibeOnboarding(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_VIBES_STORAGE_KEY);
    if (!raw) return false;
    const j = JSON.parse(raw) as { genres?: unknown };
    return Array.isArray(j.genres) && j.genres.length >= 1;
  } catch {
    return false;
  }
}

async function hasServerOnboardingDone(): Promise<boolean> {
  try {
    const prefs = await api.get<{ onboardingDone?: boolean }>('/api/user/preferences');
    return Boolean(prefs?.onboardingDone);
  } catch {
    return false;
  }
}

/**
 * After email OTP / social sign-in, skip `/onboarding` when we already have
 * local picks or the server marked onboarding complete (avoids boot-loop
 * back through the picker on every launch).
 */
export async function getPostAuthDestination(): Promise<PostAuthHref> {
  if (await hasLocalVibeOnboarding()) return '/(app)/(tabs)';
  if (await hasServerOnboardingDone()) return '/(app)/(tabs)';
  return '/onboarding';
}

/** Used by onboarding screen to bounce returning users straight to tabs. */
export async function hasOnboardingCompleted(): Promise<boolean> {
  if (await hasLocalVibeOnboarding()) return true;
  return hasServerOnboardingDone();
}
