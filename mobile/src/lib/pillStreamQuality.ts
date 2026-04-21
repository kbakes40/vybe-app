import type { Track, TrackSource } from '@/types/music';

const LOSSLESS_EXTS = new Set(['wav', 'alac', 'aiff', 'aif']);

/** True FLAC / RP FLAC streams — show `FLAC` on the Island. */
function isFlacStream(track: Track, source: TrackSource | string | undefined): boolean {
  const fmt = (track.fileFormat ?? '').replace(/^\./, '').toLowerCase();
  if (fmt === 'flac') return true;
  const url = (track.audioUrl ?? '').toLowerCase();
  if (url.includes('flac') || url.endsWith('.flac')) return true;
  if (source === 'radio_paradise') return true;
  if (source !== 'global_radio') return false;
  const sid = track.globalRadioStationId;
  return (
    sid === 'paradise' ||
    sid === 'vault_modern' ||
    sid === 'vault_70s' ||
    sid === 'vault_80s'
  );
}

/** Other lossless containers or hi-res vault relay (no `.flac` in URL). */
function isOtherLossless(track: Track, source: TrackSource | string | undefined): boolean {
  const fmt = (track.fileFormat ?? '').replace(/^\./, '').toLowerCase();
  if (LOSSLESS_EXTS.has(fmt)) return true;
  if (source !== 'global_radio') return false;
  return track.globalRadioStationId === 'vault_90s';
}

/**
 * Compact Island: high-contrast `FLAC` / `LOSSLESS` chip when the active stream
 * is lossless-class (file format, FLAC URLs, RP, vault FLAC / hi-res relays).
 */
export function getIslandLosslessTag(
  track: Track | null | undefined,
  source: TrackSource | string | undefined,
): 'FLAC' | 'LOSSLESS' | null {
  if (!track) return null;
  // IA Live Vault — every track here is FLAC by construction, but the
  // vault brand is "LOSSLESS" (concert-archive framing) rather than "FLAC"
  // (engineering framing). Force the copy so the Pill reads as designed.
  if (source === 'archive') return 'LOSSLESS';
  if (isFlacStream(track, source)) return 'FLAC';
  if (isOtherLossless(track, source)) return 'LOSSLESS';
  return null;
}

/**
 * Expanded Island: architectural line — lossless paths read as **ZERO NOISE**;
 * other live radio / premium engaged paths read as **HI-FI** (curated relay tier).
 */
export function getExpandedIslandThemeLabel(
  track: Track | null | undefined,
  source: TrackSource | string | undefined,
  losslessTag: 'FLAC' | 'LOSSLESS' | null,
  isPremium: boolean,
): 'ZERO NOISE' | 'HI-FI' | null {
  if (losslessTag) return 'ZERO NOISE';
  const s = source as string | undefined;
  if (s === 'global_radio' || s === 'radio_paradise' || s === 'archive' || s === 'bandcamp') return 'HI-FI';
  if (track && isPremium && s !== 'youtube' && s !== 'youtube_music') return 'HI-FI';
  return null;
}
