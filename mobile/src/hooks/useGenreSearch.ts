import { useCallback, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { api } from '@/lib/api/api';
import type { Track } from '@/types/music';
import {
  genreCache,
  hydrateGenreFromDisk,
  tryCommitGenreCache,
  genreQueries,
  isGenreCacheFresh,
  setLastSelectedGenre,
  type GenreCacheEntry,
} from '@/lib/genreSearchCache';
import { cancelNativePrefetchQueue, queueYoutubeAudioPrefetch } from '@/stores/prefetchStore';
import { preResolveYoutubeVideoId } from '@/lib/youtubeResolvePreloadCache';
import { preResolveSoundcloudStreamUrl } from '@/lib/soundcloudStreamPreloadCache';

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

/** One retry after a short backoff — helps when Railway returns transient 502s. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 500));
    return await fn();
  }
}

/** YouTube search hit — prefer `artwork`; tolerate legacy `eraArtwork` / `thumbnailUrl`. */
type PlaylistHit = {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl?: string;
  artwork?: string;
  eraArtwork?: string;
};

type SCHit = {
  trackId: string;
  title: string;
  artist: string;
  artwork?: string;
  eraArtwork?: string;
  duration: number;
  soundcloudUrl: string;
};

function pickYtArtwork(t: PlaylistHit): string {
  return t.artwork || t.thumbnailUrl || t.eraArtwork || '';
}

function pickScArtwork(t: SCHit): string {
  return t.artwork || t.eraArtwork || '';
}

export type GenreSearchLoading = { music: boolean; video: boolean; waves: boolean };

export function useGenreSearch(genre: string | null) {
  const [ytMusic, setYtMusic] = useState<Track[]>([]);
  const [youtube, setYoutube] = useState<Track[]>([]);
  const [soundcloud, setSoundcloud] = useState<Track[]>([]);
  const [loading, setLoading] = useState<GenreSearchLoading>({
    music: false,
    video: false,
    waves: false,
  });

  const activeGenreRef = useRef<string | null>(null);

  const warmVideoIds = useCallback((ids: string[]) => {
    const backendBase = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
    ids.slice(0, 4).forEach((id) => {
      fetch(`${backendBase}/api/youtube/warm/${id}`).catch(() => {});
    });
  }, []);

  const fetchParallel = useCallback(
    (g: string, opts: { keepStaleVisible: boolean }) => {
      activeGenreRef.current = g;
      cancelNativePrefetchQueue();

      const partial: Partial<GenreCacheEntry> = {};
      const queries = genreQueries(g);

      if (!opts.keepStaleVisible) {
        setYtMusic([]);
        setYoutube([]);
        setSoundcloud([]);
      }

      setLoading({ music: true, video: true, waves: true });

      withRetry(() =>
        withTimeout(
          api.get<PlaylistHit[]>(`/api/youtube/search?q=${encodeURIComponent(queries.ytMusic)}&maxResults=15`),
          25000,
        ),
      )
        .then((res) => {
          if (activeGenreRef.current !== g) return;
          const mapped: Track[] = (res ?? []).map((t) => ({
            id: `ytm-${t.videoId}`,
            title: t.title,
            artist: t.channelName,
            artwork: pickYtArtwork(t),
            source: 'youtube_music' as const,
            youtubeMusicId: t.videoId,
            audioUrl: '',
            artistId: '',
            album: '',
            albumId: '',
            isLiked: false,
            duration: 0,
          }));
          partial.ytMusic = mapped;
          setYtMusic(mapped);
          warmVideoIds(mapped.map((x) => x.youtubeMusicId!).filter(Boolean));
          void queueYoutubeAudioPrefetch(mapped);
          mapped.slice(0, 4).forEach((tr) => {
            const id = tr.youtubeMusicId ?? tr.youtubeId;
            if (id) preResolveYoutubeVideoId(id);
          });
        })
        .catch(() => {
          partial.ytMusic = [];
          if (activeGenreRef.current === g) setYtMusic([]);
        })
        .finally(() => {
          if (activeGenreRef.current !== g) return;
          setLoading((s) => ({ ...s, music: false }));
          tryCommitGenreCache(g, partial);
        });

      withRetry(() =>
        withTimeout(
          api.get<PlaylistHit[]>(`/api/youtube/search?q=${encodeURIComponent(queries.youtube)}&maxResults=12`),
          25000,
        ),
      )
        .then((res) => {
          if (activeGenreRef.current !== g) return;
          const mapped: Track[] = (res ?? []).map((t) => ({
            id: `yt-${t.videoId}`,
            title: t.title,
            artist: t.channelName,
            artwork: pickYtArtwork(t),
            source: 'youtube' as const,
            youtubeId: t.videoId,
            audioUrl: '',
            artistId: '',
            album: '',
            albumId: '',
            isLiked: false,
            duration: 0,
          }));
          partial.youtube = mapped;
          setYoutube(mapped);
          void queueYoutubeAudioPrefetch(mapped);
          mapped.slice(0, 4).forEach((tr) => {
            const id = tr.youtubeId ?? tr.youtubeMusicId;
            if (id) preResolveYoutubeVideoId(id);
          });
        })
        .catch(() => {
          partial.youtube = [];
          if (activeGenreRef.current === g) setYoutube([]);
        })
        .finally(() => {
          if (activeGenreRef.current !== g) return;
          setLoading((s) => ({ ...s, video: false }));
          tryCommitGenreCache(g, partial);
        });

      withRetry(() =>
        withTimeout(
          api.get<SCHit[]>(`/api/soundcloud/search?q=${encodeURIComponent(queries.soundcloud)}&maxResults=15`),
          25000,
        ),
      )
        .then((res) => {
          if (activeGenreRef.current !== g) return;
          const mapped: Track[] = (res ?? []).map((t) => ({
            id: `sc-${t.trackId}`,
            title: t.title,
            artist: t.artist,
            artwork: pickScArtwork(t),
            source: 'soundcloud' as const,
            soundcloudUrl: t.soundcloudUrl,
            audioUrl: '',
            artistId: '',
            album: '',
            albumId: '',
            isLiked: false,
            duration: t.duration,
          }));
          partial.soundcloud = mapped;
          setSoundcloud(mapped);
          mapped.slice(0, 4).forEach((tr) => {
            if (tr.soundcloudUrl) preResolveSoundcloudStreamUrl(tr.soundcloudUrl);
          });
          mapped.slice(0, 8).forEach((tr) => {
            if (tr.artwork) void Image.prefetch(tr.artwork);
          });
        })
        .catch(() => {
          partial.soundcloud = [];
          if (activeGenreRef.current === g) setSoundcloud([]);
        })
        .finally(() => {
          if (activeGenreRef.current !== g) return;
          setLoading((s) => ({ ...s, waves: false }));
          tryCommitGenreCache(g, partial);
        });
    },
    [warmVideoIds],
  );

  useEffect(() => {
    if (!genre) {
      activeGenreRef.current = null;
      setYtMusic([]);
      setYoutube([]);
      setSoundcloud([]);
      setLoading({ music: false, video: false, waves: false });
      return;
    }

    activeGenreRef.current = genre;
    setLastSelectedGenre(genre);

    const mem = genreCache.get(genre);
    const disk = mem ?? hydrateGenreFromDisk(genre);
    const fresh = disk && isGenreCacheFresh(disk);
    const hasRows =
      !!disk &&
      (disk.ytMusic.length > 0 || disk.youtube.length > 0 || disk.soundcloud.length > 0);

    if (fresh && disk) {
      setYtMusic(disk.ytMusic);
      setYoutube(disk.youtube);
      setSoundcloud(disk.soundcloud);
      setLoading({ music: false, video: false, waves: false });
      void queueYoutubeAudioPrefetch([...disk.ytMusic, ...disk.youtube]);
      disk.soundcloud.slice(0, 4).forEach((tr) => {
        if (tr.soundcloudUrl) preResolveSoundcloudStreamUrl(tr.soundcloudUrl);
      });
      return;
    }

    if (disk && hasRows && !fresh) {
      setYtMusic(disk.ytMusic);
      setYoutube(disk.youtube);
      setSoundcloud(disk.soundcloud);
      disk.soundcloud.slice(0, 4).forEach((tr) => {
        if (tr.soundcloudUrl) preResolveSoundcloudStreamUrl(tr.soundcloudUrl);
      });
      fetchParallel(genre, { keepStaleVisible: true });
      return;
    }

    fetchParallel(genre, { keepStaleVisible: false });
  }, [genre, fetchParallel]);

  return { ytMusic, youtube, soundcloud, loading };
}
