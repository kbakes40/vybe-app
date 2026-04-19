import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/lib/api/api';
import type { Track } from '@/types/music';

type PlaylistTrack = {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
};

function toTrack(t: PlaylistTrack): Track {
  return {
    id: `fire-${t.videoId}`,
    title: t.title,
    artist: t.channelName,
    artistId: `ch-${t.videoId}`,
    album: 'Your Fire Mix',
    albumId: 'fire-mix',
    artwork: t.thumbnailUrl,
    duration: 0,
    isLiked: false,
    source: 'youtube_music',
    youtubeMusicId: t.videoId,
    audioUrl: '',
  };
}

interface FireMixState {
  genreLabels: string[];
  tracks: Track[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  lastBuiltAt: number;
  /** Kicks off API fetches without blocking navigation. */
  buildFromGenres: (labels: string[]) => void;
  clear: () => void;
}

export const useFireMixStore = create<FireMixState>()(
  persist(
    (set) => ({
      genreLabels: [],
      tracks: [],
      status: 'idle',
      lastBuiltAt: 0,

      buildFromGenres: (labels: string[]) => {
        const cleaned = [...new Set(labels.map((s) => s.trim()).filter(Boolean))];
        if (cleaned.length === 0) return;

        set({ status: 'loading', genreLabels: cleaned });

        void (async () => {
          try {
            const perGenre = await Promise.all(
              cleaned.map((g) =>
                api
                  .get<PlaylistTrack[]>(
                    `/api/youtube/search?q=${encodeURIComponent(`${g} music mix`)}&maxResults=10`,
                  )
                  .catch(() => [] as PlaylistTrack[]),
              ),
            );

            const seen = new Set<string>();
            const merged: Track[] = [];
            const roundRobin = Math.max(...perGenre.map((a) => a.length), 0);
            for (let i = 0; i < roundRobin; i++) {
              for (const arr of perGenre) {
                const row = arr[i];
                if (!row || seen.has(row.videoId)) continue;
                seen.add(row.videoId);
                merged.push(toTrack(row));
                if (merged.length >= 24) break;
              }
              if (merged.length >= 24) break;
            }

            set({
              tracks: merged,
              status: merged.length > 0 ? 'ready' : 'error',
              lastBuiltAt: Date.now(),
            });
          } catch {
            set({ status: 'error', lastBuiltAt: Date.now() });
          }
        })();
      },

      clear: () => set({ genreLabels: [], tracks: [], status: 'idle', lastBuiltAt: 0 }),
    }),
    {
      name: 'vybe-fire-mix',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        genreLabels: s.genreLabels,
        tracks: s.tracks,
        status: s.status,
        lastBuiltAt: s.lastBuiltAt,
      }),
    },
  ),
);
