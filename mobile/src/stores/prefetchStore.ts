import { create } from 'zustand';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type { Track } from '@/types/music';
import { getDownloadDir } from '@/stores/storageSettingsStore';
import { getCachedYoutubeResolveUrl } from '@/lib/youtubeResolvePreloadCache';

const NativeDownloader = Platform.OS === 'ios' ? NativeModules.VybeDownloader : null;

/** Only newer native builds expose prefetch + matching `supportedEvents`; older binaries crash on addListener otherwise. */
function nativePrefetchAvailable(): boolean {
  return typeof NativeDownloader?.prefetchAudioBuffers === 'function';
}

type PrefetchEntry = { progress: number; ready: boolean };

interface PrefetchState {
  byTrackId: Record<string, PrefetchEntry>;
  setProgress: (id: string, progress: number) => void;
  setReady: (id: string) => void;
  removeTrack: (id: string) => void;
  clearAll: () => void;
}

export const usePrefetchStore = create<PrefetchState>((set) => ({
  byTrackId: {},
  setProgress: (id, progress) =>
    set((s) => ({
      byTrackId: {
        ...s.byTrackId,
        [id]: { progress, ready: s.byTrackId[id]?.ready ?? false },
      },
    })),
  setReady: (id) =>
    set((s) => ({
      byTrackId: {
        ...s.byTrackId,
        [id]: { progress: 1, ready: true },
      },
    })),
  removeTrack: (id) =>
    set((s) => {
      if (!s.byTrackId[id]) return s;
      const next = { ...s.byTrackId };
      delete next[id];
      return { byTrackId: next };
    }),
  clearAll: () => set({ byTrackId: {} }),
}));

let listenersAttached = false;

/** Subscribe to native prefetch events (idempotent). */
export function ensurePrefetchListeners(): void {
  if (listenersAttached || !NativeDownloader || !nativePrefetchAvailable()) return;
  listenersAttached = true;
  const emitter = new NativeEventEmitter(NativeDownloader);
  emitter.addListener('onPrefetchProgress', (e: { trackId: string; progress: number }) => {
    const p = typeof e.progress === 'number' ? e.progress : 0;
    usePrefetchStore.getState().setProgress(e.trackId, p);
  });
  emitter.addListener('onPrefetchReady', (e: { trackId: string }) => {
    usePrefetchStore.getState().setReady(e.trackId);
  });
  emitter.addListener('onPrefetchError', (e: { trackId: string }) => {
    usePrefetchStore.getState().removeTrack(e.trackId);
  });
}

export function cancelNativePrefetchQueue(): void {
  try {
    NativeDownloader?.cancelPrefetchQueue?.();
  } catch {
    /* noop */
  }
  usePrefetchStore.getState().clearAll();
}

/**
 * Enqueue up to 5 YouTube-backed tracks for native Range prefetch into
 * `yt_<videoId>.m4a.prefetch` beside the eventual full download path.
 */
export async function queueYoutubeAudioPrefetch(tracks: Track[]): Promise<void> {
  if (!nativePrefetchAvailable()) return;
  ensurePrefetchListeners();

  const base = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
  if (!base) return;

  const { dir } = await getDownloadDir();
  const seen = new Set<string>();
  const items: { trackId: string; streamUrl: string; destPath: string }[] = [];

  for (const t of tracks) {
    const vid = t.youtubeMusicId ?? t.youtubeId;
    if (!vid) continue;
    if (seen.has(vid)) continue;
    seen.add(vid);
    items.push({
      trackId: t.id,
      streamUrl: `${base}/api/youtube/audio/${vid}`,
      destPath: `${dir}yt_${vid}.m4a`,
    });
    if (items.length >= 5) break;
  }

  if (items.length === 0) return;

  const st = usePrefetchStore.getState();
  for (const it of items) {
    st.setProgress(it.trackId, 0.02);
  }

  try {
    await NativeDownloader.prefetchAudioBuffers(items);
  } catch (e) {
    console.warn('[Prefetch] prefetchAudioBuffers failed', e);
  }
}

/**
 * Head prefetch for the active YouTube stream + next two queue items so AVPlayer
 * has the first ~128KB in cache before decode (iOS native Range GET).
 */
export async function queueYoutubeHeadPrefetchForPlayback(
  current: Track,
  queue: Track[],
  trackIndex: number,
  primaryStreamUrl: string,
  backendBase: string,
): Promise<void> {
  if (!nativePrefetchAvailable()) return;
  ensurePrefetchListeners();
  const base = backendBase.replace(/\/$/, '');
  if (!base || !primaryStreamUrl.startsWith('http')) return;

  const { dir } = await getDownloadDir();
  const items: { trackId: string; streamUrl: string; destPath: string }[] = [];

  const push = (t: Track, streamUrl: string) => {
    const vid = t.youtubeMusicId ?? t.youtubeId;
    if (!vid || !streamUrl.startsWith('http')) return;
    items.push({
      trackId: t.id,
      streamUrl,
      destPath: `${dir}yt_${vid}.m4a`,
    });
  };

  push(current, primaryStreamUrl);

  for (let i = 1; i <= 2 && trackIndex + i < queue.length; i++) {
    const t = queue[trackIndex + i];
    const vid = t.youtubeMusicId ?? t.youtubeId;
    if (!vid) continue;
    const cached = getCachedYoutubeResolveUrl(vid);
    push(t, cached ?? `${base}/api/youtube/audio/${vid}`);
  }

  if (items.length === 0) return;

  const st = usePrefetchStore.getState();
  for (const it of items) {
    st.setProgress(it.trackId, 0.02);
  }

  try {
    await NativeDownloader.prefetchAudioBuffers(items);
  } catch (e) {
    console.warn('[Prefetch] queueYoutubeHeadPrefetchForPlayback failed', e);
  }
}
