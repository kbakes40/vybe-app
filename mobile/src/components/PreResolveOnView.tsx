import React, { useEffect, useRef, useCallback } from 'react';
import { View, Dimensions, type LayoutChangeEvent, type View as RNView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { preResolveYoutubeVideoId } from '@/lib/youtubeResolvePreloadCache';

const POLL_MS = 380;
/** Lower than 0.75 so horizontal peeking cards still warm the resolve cache. */
const VISIBLE_RATIO = 0.42;

function windowOverlapRatio(x: number, y: number, w: number, h: number): number {
  const { width: W, height: H } = Dimensions.get('window');
  const ix0 = Math.max(x, 0);
  const iy0 = Math.max(y, 0);
  const ix1 = Math.min(x + w, W);
  const iy1 = Math.min(y + h, H);
  const iw = Math.max(0, ix1 - ix0);
  const ih = Math.max(0, iy1 - iy0);
  const inter = iw * ih;
  const area = Math.max(w * h, 1);
  return inter / area;
}

/**
 * When ~75% of this view is on screen, pre-resolve the YouTube stream URL in the background.
 */
export function PreResolveOnView({
  youtubeVideoId,
  children,
  style,
}: {
  youtubeVideoId: string | null | undefined;
  children: React.ReactNode;
  style?: React.ComponentProps<typeof View>['style'];
}) {
  const ref = useRef<RNView>(null);
  const fired = useRef(false);
  const layout = useRef({ w: 0, h: 0 });

  const maybeFire = useCallback(() => {
    if (fired.current || !youtubeVideoId) return;
    const { w, h } = layout.current;
    if (w < 8 || h < 8) return;
    ref.current?.measureInWindow((x, y, mw, mh) => {
      const ratio = windowOverlapRatio(x, y, mw, mh);
      if (ratio >= VISIBLE_RATIO) {
        fired.current = true;
        preResolveYoutubeVideoId(youtubeVideoId);
      }
    });
  }, [youtubeVideoId]);

  useFocusEffect(
    useCallback(() => {
      if (!youtubeVideoId) return () => {};
      fired.current = false;
      const id = setInterval(maybeFire, POLL_MS);
      return () => clearInterval(id);
    }, [youtubeVideoId, maybeFire]),
  );

  useEffect(() => {
    if (!youtubeVideoId) return;
    const sub = Dimensions.addEventListener('change', maybeFire);
    return () => sub.remove();
  }, [youtubeVideoId, maybeFire]);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      layout.current = { w: width, h: height };
      maybeFire();
    },
    [maybeFire],
  );

  if (!youtubeVideoId) {
    return <>{children}</>;
  }

  return (
    <View ref={ref} collapsable={false} style={style} onLayout={onLayout}>
      {children}
    </View>
  );
}
