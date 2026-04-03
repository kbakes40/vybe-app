import { Linking, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useDiscoverFeedStore } from '@/stores/discoverFeedStore';

export type ExternalPlatform = 'YOUTUBE' | 'SOUNDCLOUD';

interface OpenExternalOptions {
  itemId: string;
  platform: ExternalPlatform;
  deepLinkUrl: string;
  externalUrl: string;
  searchQuery?: string;
}

/**
 * Opens an external link in the native app if available, falling back to web.
 *
 * For YouTube: Tries youtube:// deep link first, falls back to web URL.
 * For SoundCloud: Opens search URL (tracks may not be directly linkable).
 *
 * Tracks the 'open' event for analytics.
 */
export async function openExternal(options: OpenExternalOptions): Promise<boolean> {
  const { itemId, platform, deepLinkUrl, externalUrl, searchQuery } = options;

  // Haptic feedback on tap
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

  // Track the open event
  const trackEvent = useDiscoverFeedStore.getState().trackEvent;
  trackEvent(itemId, 'open');

  try {
    // For SoundCloud, we use search handoff since direct links may not work
    if (platform === 'SOUNDCLOUD' && searchQuery) {
      const searchUrl = buildSoundCloudSearchUrl(searchQuery);
      return await openWithFallback(
        'soundcloud://search?q=' + encodeURIComponent(searchQuery),
        searchUrl
      );
    }

    // For YouTube, try deep link first
    if (platform === 'YOUTUBE' && deepLinkUrl) {
      return await openWithFallback(deepLinkUrl, externalUrl);
    }

    // Default: just open the external URL
    const canOpen = await Linking.canOpenURL(externalUrl);
    if (canOpen) {
      await Linking.openURL(externalUrl);
      return true;
    }

    console.warn('[openExternal] Cannot open URL:', externalUrl);
    return false;
  } catch (error) {
    console.error('[openExternal] Error opening URL:', error);
    return false;
  }
}

/**
 * Tries to open a deep link URL first, falls back to web URL if it fails.
 */
async function openWithFallback(deepLinkUrl: string, webUrl: string): Promise<boolean> {
  try {
    // Try deep link first
    const canOpenDeepLink = await Linking.canOpenURL(deepLinkUrl);

    if (canOpenDeepLink) {
      await Linking.openURL(deepLinkUrl);
      return true;
    }
  } catch (error) {
    console.log('[openExternal] Deep link failed, trying web URL:', error);
  }

  // Fall back to web URL
  try {
    const canOpenWeb = await Linking.canOpenURL(webUrl);
    if (canOpenWeb) {
      await Linking.openURL(webUrl);
      return true;
    }
  } catch (error) {
    console.error('[openExternal] Web URL also failed:', error);
  }

  return false;
}

/**
 * Builds a SoundCloud search URL for the given query.
 * Opens the SoundCloud app/site with a search pre-filled.
 * Uses /search/sounds to filter to tracks only (not playlists/users)
 */
function buildSoundCloudSearchUrl(query: string): string {
  const encodedQuery = encodeURIComponent(query);
  return `https://soundcloud.com/search/sounds?q=${encodedQuery}`;
}

/**
 * Get the platform-specific deep link scheme
 */
export function getDeepLinkScheme(platform: ExternalPlatform): string {
  switch (platform) {
    case 'YOUTUBE':
      return 'youtube://';
    case 'SOUNDCLOUD':
      return 'soundcloud://';
    default:
      return 'https://';
  }
}

/**
 * Check if the native app is installed for a given platform
 */
export async function isNativeAppInstalled(platform: ExternalPlatform): Promise<boolean> {
  const scheme = getDeepLinkScheme(platform);
  try {
    return await Linking.canOpenURL(scheme);
  } catch {
    return false;
  }
}

/**
 * Get helper text for SoundCloud items
 */
export function getSoundCloudHelperText(): string {
  return 'Tap the first track to play';
}

/**
 * Get action button text based on platform
 */
export function getActionButtonText(platform: ExternalPlatform): string {
  switch (platform) {
    case 'YOUTUBE':
      return 'Open in YouTube';
    case 'SOUNDCLOUD':
      return 'Search SoundCloud';
    default:
      return 'Open';
  }
}

/**
 * Get platform brand color
 */
export function getPlatformColor(platform: ExternalPlatform): string {
  switch (platform) {
    case 'YOUTUBE':
      return '#FF0000';
    case 'SOUNDCLOUD':
      return '#FF5500';
    default:
      return '#8B5CF6';
  }
}
