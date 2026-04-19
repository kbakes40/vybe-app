import { useEffect, useRef } from 'react';
import { usePlaybackController } from '@/stores/playbackController';
import { useThemeStore } from '@/stores/themeStore';
import { pickArtworkAccentHex } from '@/lib/artworkAccent';

/**
 * When **Sync to Artwork** is enabled in App Preferences, mirrors the dominant
 * color from the current track’s artwork into the global accent (pill, tabs, chrome).
 */
export function ThemeArtworkAccentSync() {
  const sync = useThemeStore((s) => s.syncToArtwork);
  const setAccent = useThemeStore((s) => s.setAccentColor);
  const artwork = usePlaybackController((s) => s.currentTrack?.artwork ?? null);
  const lastAppliedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sync) {
      lastAppliedRef.current = null;
      return;
    }
    const url = artwork?.trim() ?? '';
    if (!url) return;

    let cancelled = false;
    void (async () => {
      const hex = await pickArtworkAccentHex(url);
      if (cancelled || !hex) return;
      if (lastAppliedRef.current === hex) return;
      lastAppliedRef.current = hex;
      setAccent(hex);
    })();

    return () => {
      cancelled = true;
    };
  }, [sync, artwork, setAccent]);

  return null;
}
