import { Linking, Alert } from 'react-native';
import { Track } from '@/types/music';

/**
 * SoundCloud Search Handoff Utility
 *
 * Opens SoundCloud search with the track's artist and title.
 * Attempts app deep link first, falls back to web browser.
 *
 * This approach prevents dead links by always generating fresh searches
 * from artist and title instead of storing track URLs.
 */

// Build the search query from track data
export function buildSearchQuery(track: Track): string {
  // Use stored external search query if available
  if (track.externalSearchQuery) {
    return track.externalSearchQuery;
  }

  // Otherwise build from artist and title
  const artist = track.artist || '';
  const title = track.title || '';

  // Clean up common suffixes and noise
  const cleanTitle = title
    .replace(/\s*[\[\(](official|audio|video|lyric|lyrics|hd|hq|4k)[\]\)]/gi, '')
    .replace(/\s*-\s*(official|audio|video|lyric|lyrics|hd|hq|4k)$/gi, '')
    .trim();

  return `${artist} ${cleanTitle}`.trim();
}

// Build SoundCloud app deep link URL
export function buildSoundCloudAppUrl(searchQuery: string): string {
  const encoded = encodeURIComponent(searchQuery);
  return `soundcloud://search?q=${encoded}`;
}

// Build SoundCloud web URL
export function buildSoundCloudWebUrl(searchQuery: string): string {
  const encoded = encodeURIComponent(searchQuery);
  return `https://soundcloud.com/search?q=${encoded}`;
}

// Open SoundCloud with search query (app first, then web fallback)
export async function openInSoundCloud(track: Track): Promise<boolean> {
  const searchQuery = buildSearchQuery(track);

  if (!searchQuery) {
    Alert.alert('Cannot Open', 'No search information available for this track.');
    return false;
  }

  const appUrl = buildSoundCloudAppUrl(searchQuery);
  const webUrl = buildSoundCloudWebUrl(searchQuery);

  // Try to open the SoundCloud app first (if scheme is registered)
  // Note: canOpenURL throws on iOS if scheme isn't in LSApplicationQueriesSchemes
  // Instead of adding the scheme, we gracefully fall back to web
  let canOpenApp = false;
  try {
    canOpenApp = await Linking.canOpenURL(appUrl);
  } catch {
    // Scheme not registered in Info.plist - this is expected
    // Fall through to web URL
    console.log('[SoundCloud Handoff] App scheme not available, using web');
  }

  try {
    if (canOpenApp) {
      await Linking.openURL(appUrl);
      return true;
    }

    // Fall back to web browser
    await Linking.openURL(webUrl);
    return true;
  } catch (error) {
    console.error('[SoundCloud Handoff] Error opening URL:', error);

    // Last resort: try web URL directly if app URL failed
    try {
      await Linking.openURL(webUrl);
      return true;
    } catch (webError) {
      Alert.alert(
        'Cannot Open SoundCloud',
        'Unable to open SoundCloud. Please make sure you have a browser installed.'
      );
      return false;
    }
  }
}

// Create external search data for a new track
export function createExternalSearchData(artist: string, title: string): {
  externalSource: 'SOUNDCLOUD';
  externalSearchQuery: string;
} {
  const cleanTitle = title
    .replace(/\s*[\[\(](official|audio|video|lyric|lyrics|hd|hq|4k)[\]\)]/gi, '')
    .replace(/\s*-\s*(official|audio|video|lyric|lyrics|hd|hq|4k)$/gi, '')
    .trim();

  return {
    externalSource: 'SOUNDCLOUD',
    externalSearchQuery: `${artist} ${cleanTitle}`.trim(),
  };
}

// Check if track has SoundCloud external source
export function isSoundCloudTrack(track: Track): boolean {
  return track.source === 'soundcloud' || track.externalSource === 'SOUNDCLOUD';
}
