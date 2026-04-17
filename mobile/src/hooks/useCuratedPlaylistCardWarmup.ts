import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Dimensions, type LayoutChangeEvent, type View as RNView } from 'react-native';
import { getCachedYoutubeResolveUrl } from '@/lib/youtubeResolvePreloadCache';
import { reportPlaylistCardVisibility, windowOverlapRatio } from '@/lib/curatedPlaylistWarmup';

const POLL_MS = 420;

/**
 * Visibility-based playlist warming (top-N reconcile in curatedPlaylistWarmup) + "first track ready" polling.
 */
export function useCuratedPlaylistCardWarmup(
  playlistId: string,
  playlistName: string,
  trackVideoIds: string[],
) {
  const ref = useRef<RNView>(null);
  const layout = useRef({ w: 0, h: 0 });
  const firstVideoId = trackVideoIds[0] ?? '';

  const [isReady, setIsReady] = useState(() =>
    !!firstVideoId && !!getCachedYoutubeResolveUrl(firstVideoId),
  );

  const tick = useCallback(() => {
    if (!playlistId) return;
    const { w, h } = layout.current;
    if (w < 8 || h < 8) return;
    ref.current?.measureInWindow((x, y, mw, mh) => {
      const ratio = windowOverlapRatio(x, y, mw, mh);
      reportPlaylistCardVisibility(playlistId, playlistName, trackVideoIds, ratio);
    });
  }, [playlistId, playlistName, trackVideoIds]);

  useEffect(() => {
    if (!playlistId) return;
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [playlistId, tick]);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', tick);
    return () => sub.remove();
  }, [tick]);

  useEffect(() => {
    if (!firstVideoId) return;
    if (getCachedYoutubeResolveUrl(firstVideoId)) {
      setIsReady(true);
      return;
    }
    const id = setInterval(() => {
      if (getCachedYoutubeResolveUrl(firstVideoId)) {
        setIsReady(true);
        clearInterval(id);
      }
    }, 380);
    return () => clearInterval(id);
  }, [firstVideoId]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      layout.current = { w: width, h: height };
      tick();
    },
    [tick],
  );

  const videoIdsKey = useMemo(() => trackVideoIds.join(','), [trackVideoIds]);

  useEffect(() => {
    setIsReady(!!firstVideoId && !!getCachedYoutubeResolveUrl(firstVideoId));
  }, [playlistId, firstVideoId, videoIdsKey]);

  return { ref, onLayout, isReady, firstVideoId };
}
