import type { Track } from '@/types/music';
import { RADIO_PARADISE_BRAND_LOGO_URL, RADIO_PARADISE_NOW_PLAYING_URL, RADIO_PARADISE_STREAM_URL } from '@/constants/radioParadise';

/**
 * Curated hi-fi / lossless-style relays for the Radio tab.
 * Where a publisher URL is HTML-only or 404 in practice, `streamUrl` is a
 * stable audio relay; `requestedStreamUrl` documents the brief’s canonical URL.
 */
export type GlobalRadioStationId =
  | 'paradise'
  | 'hiphop'
  | 'house'
  | 'lofi'
  | 'country'
  | 'jazz'
  | 'ambient'
  | 'indie';

export type GlobalRadioMetadataSource = 'radioparadise_api' | 'static';

export type GlobalRadioDiLeading = 'default' | 'chill';

export type GlobalRadioFirePulse = 'normal' | 'max';

export interface GlobalRadioStationDef {
  id: GlobalRadioStationId;
  /** Pill label (uppercase in UI). */
  pillLabel: string;
  /** URL actually passed to AVPlayer / ExoPlayer. */
  streamUrl: string;
  /** Original product URL (documentation / future swap). */
  requestedStreamUrl?: string;
  metadataSource: GlobalRadioMetadataSource;
  /** Short tag for lock screen / Dynamic Island subtitle (e.g. `RP PARADISE`). */
  diChannelTag: string;
  /** Now-playing when `metadataSource === 'static'`. */
  staticNowPlaying?: { title: string; artist: string; artwork: string };
  diLeading: GlobalRadioDiLeading;
  firePulse: GlobalRadioFirePulse;
}

const PLACEHOLDER_ART =
  'https://vsh-smedia.radioparadise.com/uploads/RP_Logo_Flat_HCR_Green_1_18a033c355.png';

export const GLOBAL_RADIO_STATIONS: Record<GlobalRadioStationId, GlobalRadioStationDef> = {
  paradise: {
    id: 'paradise',
    pillLabel: 'PARADISE',
    streamUrl: RADIO_PARADISE_STREAM_URL,
    requestedStreamUrl: RADIO_PARADISE_STREAM_URL,
    metadataSource: 'radioparadise_api',
    diChannelTag: 'RP PARADISE',
    diLeading: 'default',
    firePulse: 'normal',
  },
  hiphop: {
    id: 'hiphop',
    pillLabel: 'HIP HOP',
    /** Live HLS endpoint discovered on thelotradio.com (root `/stream` serves HTML on Vercel). */
    streamUrl: 'https://livepeercdn.studio/hls/85c28sa2o8wppm58/index.m3u8',
    requestedStreamUrl: 'https://thelotradio.com/stream',
    metadataSource: 'static',
    diChannelTag: 'THE LOT',
    staticNowPlaying: {
      title: 'Live broadcast',
      artist: 'The Lot Radio · NYC',
      artwork: PLACEHOLDER_ART,
    },
    diLeading: 'default',
    firePulse: 'max',
  },
  house: {
    id: 'house',
    pillLabel: 'HOUSE',
    /** mixlr.com/defectedradio returns 404; hi-fi MP3 relay until an official stream URL is wired. */
    streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
    requestedStreamUrl: 'https://mixlr.com/defectedradio',
    metadataSource: 'static',
    diChannelTag: 'DEFECTED',
    staticNowPlaying: {
      title: 'Live relay',
      artist: 'Defected · House stream',
      artwork: PLACEHOLDER_ART,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
  lofi: {
    id: 'lofi',
    pillLabel: 'LOFI',
    streamUrl: 'https://lofi.stream.laut.fm/lofi',
    requestedStreamUrl: 'https://lofigirl.com/stream-hires',
    metadataSource: 'static',
    diChannelTag: 'LOFI',
    staticNowPlaying: {
      title: 'Hi‑Fi chill relay',
      artist: 'Lofi Girl · style stream',
      artwork: PLACEHOLDER_ART,
    },
    diLeading: 'chill',
    firePulse: 'normal',
  },
  country: {
    id: 'country',
    pillLabel: 'COUNTRY',
    streamUrl: 'https://country.stream.laut.fm/country',
    requestedStreamUrl: 'https://rootsradio.fm/stream',
    metadataSource: 'static',
    diChannelTag: 'ROOTS',
    staticNowPlaying: {
      title: 'Live relay',
      artist: 'Roots Radio · country stream',
      artwork: PLACEHOLDER_ART,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
  jazz: {
    id: 'jazz',
    pillLabel: 'JAZZ',
    streamUrl: 'https://ice1.somafm.com/sonicuniverse-128-mp3',
    requestedStreamUrl: 'https://somafm.com/sonicuniverse/',
    metadataSource: 'static',
    diChannelTag: 'SONIC UNIVERSE',
    staticNowPlaying: {
      title: 'Jazz fusion relay',
      artist: 'SomaFM · Sonic Universe',
      artwork: PLACEHOLDER_ART,
    },
    diLeading: 'chill',
    firePulse: 'normal',
  },
  ambient: {
    id: 'ambient',
    pillLabel: 'AMBIENT',
    streamUrl: 'https://ice1.somafm.com/dronezone-128-mp3',
    requestedStreamUrl: 'https://somafm.com/dronezone/',
    metadataSource: 'static',
    diChannelTag: 'DRONE ZONE',
    staticNowPlaying: {
      title: 'Deep ambient relay',
      artist: 'SomaFM · Drone Zone',
      artwork: PLACEHOLDER_ART,
    },
    diLeading: 'chill',
    firePulse: 'normal',
  },
  indie: {
    id: 'indie',
    pillLabel: 'INDIE',
    streamUrl: 'https://ice1.somafm.com/indiepop-128-mp3',
    requestedStreamUrl: 'https://somafm.com/indiepop/',
    metadataSource: 'static',
    diChannelTag: 'INDIE POP',
    staticNowPlaying: {
      title: 'Indie pop relay',
      artist: 'SomaFM · Indie Pop Rocks!',
      artwork: PLACEHOLDER_ART,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
};

export const GLOBAL_RADIO_STATION_ORDER: GlobalRadioStationId[] = [
  'paradise',
  'hiphop',
  'house',
  'indie',
  'lofi',
  'jazz',
  'ambient',
  'country',
];

export function getGlobalRadioStation(id: GlobalRadioStationId): GlobalRadioStationDef {
  return GLOBAL_RADIO_STATIONS[id];
}

/** Stable queue id per station (playback + metadata polling). */
export function globalRadioTrackId(id: GlobalRadioStationId): string {
  return `global-radio:${id}`;
}

/**
 * Builds the `Track` passed into `playTrack` for a given station row.
 * For Paradise, title/artist/art are placeholders until the RP poller fills them.
 */
export function buildGlobalRadioTrack(
  id: GlobalRadioStationId,
  rpPreview?: { title: string; artist: string; artwork: string } | null,
): Track {
  const def = GLOBAL_RADIO_STATIONS[id];
  const meta =
    def.metadataSource === 'radioparadise_api'
      ? {
          title: rpPreview?.title?.trim() || 'Radio Paradise',
          artist: rpPreview?.artist?.trim() || def.diChannelTag,
          artwork: (rpPreview?.artwork?.trim() || RADIO_PARADISE_BRAND_LOGO_URL) as string,
        }
      : {
          title: def.staticNowPlaying?.title ?? 'Live',
          artist: def.staticNowPlaying?.artist ?? def.diChannelTag,
          artwork: def.staticNowPlaying?.artwork ?? PLACEHOLDER_ART,
        };

  return {
    id: globalRadioTrackId(id),
    title: meta.title,
    artist: meta.artist,
    artistId: '',
    album: def.pillLabel,
    albumId: def.id,
    artwork: meta.artwork,
    duration: 0,
    isLiked: false,
    audioUrl: def.streamUrl,
    source: 'global_radio',
    globalRadioStationId: id,
    globalRadioMetadataSource: def.metadataSource,
    globalRadioDiTag: def.diChannelTag,
    globalRadioDiLeading: def.diLeading,
    globalRadioFirePulse: def.firePulse,
  };
}

export function isGlobalRadioTrackId(trackId: string | undefined): boolean {
  return !!trackId?.startsWith('global-radio:');
}

export function parseGlobalRadioStationId(trackId: string | undefined): GlobalRadioStationId | null {
  if (!trackId?.startsWith('global-radio:')) return null;
  const rest = trackId.slice('global-radio:'.length) as GlobalRadioStationId;
  return rest in GLOBAL_RADIO_STATIONS ? rest : null;
}

/** Public metadata endpoint for Radio Paradise (Paradise pill only). */
export function getRadioParadiseNowPlayingUrl(): string {
  return RADIO_PARADISE_NOW_PLAYING_URL;
}
