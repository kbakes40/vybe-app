/**
 * yt-dlp Search Service
 * Real search against SoundCloud and YouTube using yt-dlp's scsearch/ytsearch prefixes.
 * Unlike the API-key-based YouTube Data API or the placeholder SoundCloud handoff,
 * this returns actual tracks with real titles, creators, and thumbnail URLs.
 * Used by the discover feed builder to populate the Vybe Beats card.
 */

import YTDlpWrap from 'yt-dlp-wrap';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { DiscoverItem } from '../types/discover';

const ytDlp = new YTDlpWrap();

// Matches the cookie file path written by youtube.ts route on startup
const YTDLP_COOKIES_PATH = path.join(os.tmpdir(), 'youtube-cookies.txt');
function cookieArgs(): string[] {
  try {
    return fs.existsSync(YTDLP_COOKIES_PATH) ? ['--cookies', YTDLP_COOKIES_PATH] : [];
  } catch { return []; }
}

interface RawTrack {
  id: string;
  title: string;
  creator: string;
  thumbnail: string;
  url: string;
}

async function runYtDlpSearch(prefix: string, query: string, maxResults: number): Promise<RawTrack[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let output: string;
  try {
    output = await ytDlp.execPromise(
      [
        `${prefix}${maxResults}:${query}`,
        '--dump-json',
        '--flat-playlist',
        '--quiet',
        '--no-warnings',
        ...cookieArgs(),
      ],
      {},
      controller.signal
    );
    clearTimeout(timer);
  } catch (e: any) {
    clearTimeout(timer);
    // yt-dlp may exit non-zero but have partial output
    output = e?.stderr ?? '';
    if (!output) {
      console.warn(`[ytDlpSearch] ${prefix} "${query}" failed: ${e?.message ?? 'unknown'}`);
      return [];
    }
  }

  return output
    .trim()
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      try {
        const j = JSON.parse(line);
        const id: string = j.id ?? '';
        if (!id) return null;
        const thumbs: Array<{ url: string }> = j.thumbnails ?? [];
        const thumbnail =
          thumbs.length > 0
            ? thumbs[thumbs.length - 1].url
            : (j.thumbnail as string) ?? '';
        return {
          id,
          title: (j.title as string) ?? 'Unknown',
          creator: (j.uploader ?? j.channel ?? 'Unknown') as string,
          thumbnail,
          url: (j.webpage_url ?? j.url ?? '') as string,
        };
      } catch {
        return null;
      }
    })
    .filter((t): t is RawTrack => t !== null && t.thumbnail.length > 0);
}

/**
 * Search SoundCloud via yt-dlp's scsearch prefix.
 * Returns DiscoverItem-compatible data (without id/createdAt — those are added by the DB layer).
 */
export async function searchSoundCloudTracks(
  query: string,
  maxResults: number = 5
): Promise<Array<Omit<DiscoverItem, 'id' | 'createdAt'>>> {
  const tracks = await runYtDlpSearch('scsearch', query, maxResults);
  return tracks.map((t) => ({
    sourcePlatform: 'SOUNDCLOUD' as const,
    title: t.title,
    creatorName: t.creator,
    thumbnailUrl: t.thumbnail,
    externalUrl: t.url,
    deepLinkUrl: `soundcloud://tracks/${t.id}`,
    searchQuery: query,
    publishedAt: null,
  }));
}

/**
 * Search YouTube via yt-dlp's ytsearch prefix.
 * No API key required.
 */
export async function searchYouTubeTracks(
  query: string,
  maxResults: number = 5
): Promise<Array<Omit<DiscoverItem, 'id' | 'createdAt'>>> {
  const tracks = await runYtDlpSearch('ytsearch', query, maxResults);
  return tracks.map((t) => ({
    sourcePlatform: 'YOUTUBE' as const,
    title: t.title,
    creatorName: t.creator,
    thumbnailUrl: t.thumbnail,
    externalUrl: t.url || `https://www.youtube.com/watch?v=${t.id}`,
    deepLinkUrl: `youtube://watch?v=${t.id}`,
    searchQuery: query,
    publishedAt: null,
  }));
}
