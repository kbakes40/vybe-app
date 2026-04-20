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
  /** Jazz hub sub-relays (SomaFM) — picked from Radio tab list, same JAZZ pill. */
  | 'jazz_secret'
  | 'jazz_beat'
  | 'ambient'
  | 'indie'
  /** Decades Vault — lossless / hi-res era relays */
  | 'vault_70s'
  | 'vault_80s'
  | 'vault_90s'
  | 'vault_00s'
  | 'vault_modern'
  /** Pill hub — Worldwide / NTS / FIP / HÖR relays (see {@link GLOBAL_EXPANSION_STATION_ORDER}). */
  | 'global_hub'
  /** Global expansion row (Worldwide, NTS, …) */
  | 'worldwide_fm'
  | 'nts_live'
  | 'fip_radio'
  | 'hor_berlin';

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
  /** Square brand / station art for pills before live metadata resolves. */
  brandArtworkUrl: string;
  /** Now-playing when `metadataSource === 'static'`. */
  staticNowPlaying?: { title: string; artist: string; artwork: string };
  diLeading: GlobalRadioDiLeading;
  firePulse: GlobalRadioFirePulse;
  /** Shown as MPNowPlaying album / Island secondary line (e.g. `VAULT: 80S`). */
  islandAlbum?: string;
  /** RADIO_UNITY_V6 — Island genre line (e.g. `GENRE: HOUSE`). Overrides `islandAlbum` when set. */
  genreIslandLine?: string;
  /** Preferred buffer target (ms) before starting playback after load (FLAC vault). */
  bufferAheadMs?: number;
  bufferTimeoutMs?: number;
}

const SOMA_GS = 'https://api.somafm.com/logos/256/groovesalad256.png';
const SOMA_SU = 'https://api.somafm.com/logos/256/sonicuniverse256.png';
const SOMA_SA = 'https://api.somafm.com/logos/256/secretagent256.png';
const SOMA_BB = 'https://api.somafm.com/logos/256/beatblender256.png';
const SOMA_DZ = 'https://api.somafm.com/logos/256/dronezone256.png';
const SOMA_IP = 'https://api.somafm.com/logos/256/indiepop256.png';
const LAUT_LOFI = 'https://assets.laut.fm/2589a089fedf5732fc8eb21f943aa73f?t=_120x120';
const LAUT_COUNTRY = 'https://assets.laut.fm/133a2795e4ec2c7650af425eea0ea06e?t=_120x120';
const HIP_HOP_BRAND =
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80&auto=format&fit=crop';

const VAULT_70S_ART =
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&q=80&auto=format&fit=crop';
const VAULT_80S_ART =
  'https://images.unsplash.com/photo-1533174072541-98a2e8880717?w=600&q=80&auto=format&fit=crop';
const VAULT_90S_ART =
  'https://images.unsplash.com/photo-1525362081669-2fd973ac5a41?w=600&q=80&auto=format&fit=crop';
const VAULT_00S_ART =
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80&auto=format&fit=crop';

const WWFM_BRAND =
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&q=80&auto=format&fit=crop';
const NTS_BRAND =
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&q=80&auto=format&fit=crop';
const FIP_BRAND =
  'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600&q=80&auto=format&fit=crop';
const HOR_BRAND =
  'https://images.unsplash.com/photo-1571266028240-d221bcaba8e3?w=600&q=80&auto=format&fit=crop';

export const GLOBAL_RADIO_STATIONS: Record<GlobalRadioStationId, GlobalRadioStationDef> = {
  paradise: {
    id: 'paradise',
    pillLabel: 'PARADISE',
    streamUrl: RADIO_PARADISE_STREAM_URL,
    requestedStreamUrl: RADIO_PARADISE_STREAM_URL,
    metadataSource: 'radioparadise_api',
    diChannelTag: 'RP PARADISE',
    brandArtworkUrl: RADIO_PARADISE_BRAND_LOGO_URL,
    genreIslandLine: 'GENRE: PARADISE',
    diLeading: 'default',
    firePulse: 'normal',
  },
  hiphop: {
    id: 'hiphop',
    pillLabel: 'HIP HOP',
    /** The Lot’s live HLS (same endpoint surfaced on thelotradio.com). */
    streamUrl: 'https://livepeercdn.studio/hls/85c28sa2o8wppm58/index.m3u8',
    requestedStreamUrl: 'https://thelotradio.com/stream',
    metadataSource: 'static',
    diChannelTag: 'THE LOT',
    genreIslandLine: 'GENRE: HIP HOP',
    brandArtworkUrl: HIP_HOP_BRAND,
    staticNowPlaying: {
      title: 'Live broadcast',
      artist: 'The Lot Radio · NYC',
      artwork: HIP_HOP_BRAND,
    },
    diLeading: 'default',
    firePulse: 'max',
  },
  house: {
    id: 'house',
    pillLabel: 'HOUSE',
    /**
     * Mixlr profile URL is the brief’s canonical mapping; Mixlr returns 404 today.
     * Playback uses a stable house relay until a direct Defected/Mixlr audio URL is wired.
     */
    streamUrl: 'https://ice1.somafm.com/groovesalad-128-mp3',
    requestedStreamUrl: 'https://mixlr.com/defectedradio',
    metadataSource: 'static',
    diChannelTag: 'DEFECTED',
    genreIslandLine: 'GENRE: HOUSE',
    brandArtworkUrl: SOMA_GS,
    staticNowPlaying: {
      title: 'Defected Radio (stream bridge)',
      artist: 'House relay · hi-fi stream',
      artwork: SOMA_GS,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
  lofi: {
    id: 'lofi',
    pillLabel: 'LOFI',
    streamUrl: 'https://lofi.stream.laut.fm/lofi',
    /** Product URL (stream-hires returns 404 on web); relay matches Lofi Girl–style feed. */
    requestedStreamUrl: 'https://lofigirl.com/stream-hires',
    metadataSource: 'static',
    diChannelTag: 'LOFI',
    genreIslandLine: 'GENRE: LOFI',
    brandArtworkUrl: LAUT_LOFI,
    staticNowPlaying: {
      title: 'Hi‑Fi chill relay',
      artist: 'Lofi Girl · style stream',
      artwork: LAUT_LOFI,
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
    brandArtworkUrl: LAUT_COUNTRY,
    staticNowPlaying: {
      title: 'Live relay',
      artist: 'Roots Radio · country stream',
      artwork: LAUT_COUNTRY,
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
    genreIslandLine: 'GENRE: JAZZ',
    brandArtworkUrl: SOMA_SU,
    staticNowPlaying: {
      title: 'Jazz fusion relay',
      artist: 'SomaFM · Sonic Universe',
      artwork: SOMA_SU,
    },
    diLeading: 'chill',
    firePulse: 'normal',
  },
  jazz_secret: {
    id: 'jazz_secret',
    pillLabel: 'JAZZ',
    streamUrl: 'https://ice1.somafm.com/secretagent-128-mp3',
    requestedStreamUrl: 'https://somafm.com/secretagent/',
    metadataSource: 'static',
    diChannelTag: 'SECRET AGENT',
    genreIslandLine: 'GENRE: JAZZ',
    brandArtworkUrl: SOMA_SA,
    staticNowPlaying: {
      title: 'Lounge relay',
      artist: 'SomaFM · Secret Agent',
      artwork: SOMA_SA,
    },
    diLeading: 'chill',
    firePulse: 'normal',
  },
  jazz_beat: {
    id: 'jazz_beat',
    pillLabel: 'JAZZ',
    streamUrl: 'https://ice1.somafm.com/beatblender-128-mp3',
    requestedStreamUrl: 'https://somafm.com/beatblender/',
    metadataSource: 'static',
    diChannelTag: 'BEAT BLENDER',
    genreIslandLine: 'GENRE: JAZZ',
    brandArtworkUrl: SOMA_BB,
    staticNowPlaying: {
      title: 'Mid-tempo relay',
      artist: 'SomaFM · Beat Blender',
      artwork: SOMA_BB,
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
    brandArtworkUrl: SOMA_DZ,
    staticNowPlaying: {
      title: 'Deep ambient relay',
      artist: 'SomaFM · Drone Zone',
      artwork: SOMA_DZ,
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
    genreIslandLine: 'GENRE: INDIE',
    brandArtworkUrl: SOMA_IP,
    staticNowPlaying: {
      title: 'Indie pop relay',
      artist: 'SomaFM · Indie Pop Rocks!',
      artwork: SOMA_IP,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
  vault_70s: {
    id: 'vault_70s',
    pillLabel: '70S',
    streamUrl: 'https://stream.biasradio.com/70s-flac',
    requestedStreamUrl: 'https://stream.biasradio.com/70s-flac',
    metadataSource: 'static',
    diChannelTag: 'BIAS 70S',
    brandArtworkUrl: VAULT_70S_ART,
    islandAlbum: 'VAULT: 70S',
    genreIslandLine: 'GENRE: 70S',
    bufferAheadMs: 5000,
    bufferTimeoutMs: 22000,
    staticNowPlaying: {
      title: 'Decades Vault · 70s',
      artist: 'Bias Radio · lossless relay',
      artwork: VAULT_70S_ART,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
  vault_80s: {
    id: 'vault_80s',
    pillLabel: '80S',
    streamUrl: 'https://stream.radioclub80.ro/80s-flac',
    requestedStreamUrl: 'https://stream.radioclub80.ro/80s-flac',
    metadataSource: 'static',
    diChannelTag: 'RC80',
    brandArtworkUrl: VAULT_80S_ART,
    islandAlbum: 'VAULT: 80S',
    genreIslandLine: 'GENRE: 80S',
    bufferAheadMs: 5000,
    bufferTimeoutMs: 22000,
    staticNowPlaying: {
      title: 'Decades Vault · 80s',
      artist: 'Radio Club 80 · lossless relay',
      artwork: VAULT_80S_ART,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
  vault_90s: {
    id: 'vault_90s',
    pillLabel: '90S',
    streamUrl: 'https://stream.thecheese.co.nz/90s-hires',
    requestedStreamUrl: 'https://stream.thecheese.co.nz/90s-hires',
    metadataSource: 'static',
    diChannelTag: 'THE CHEESE',
    brandArtworkUrl: VAULT_90S_ART,
    islandAlbum: 'VAULT: 90S',
    genreIslandLine: 'GENRE: 90S',
    bufferAheadMs: 5000,
    bufferTimeoutMs: 22000,
    staticNowPlaying: {
      title: 'Decades Vault · 90s',
      artist: 'The Cheese · hi-res relay',
      artwork: VAULT_90S_ART,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
  vault_00s: {
    id: 'vault_00s',
    pillLabel: '00S',
    streamUrl: 'https://stream.decadesradio.uk/00s-high',
    requestedStreamUrl: 'https://stream.decadesradio.uk/00s-high',
    metadataSource: 'static',
    diChannelTag: 'DECADES UK',
    brandArtworkUrl: VAULT_00S_ART,
    islandAlbum: 'VAULT: 00S',
    genreIslandLine: 'GENRE: 00S',
    bufferAheadMs: 5000,
    bufferTimeoutMs: 22000,
    staticNowPlaying: {
      title: 'Decades Vault · 00s',
      artist: 'Decades Radio UK · hi-bitrate relay',
      artwork: VAULT_00S_ART,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
  vault_modern: {
    id: 'vault_modern',
    pillLabel: 'MODERN',
    streamUrl: RADIO_PARADISE_STREAM_URL,
    requestedStreamUrl: RADIO_PARADISE_STREAM_URL,
    metadataSource: 'radioparadise_api',
    diChannelTag: 'RP MAIN',
    brandArtworkUrl: RADIO_PARADISE_BRAND_LOGO_URL,
    islandAlbum: 'VAULT: MODERN',
    staticNowPlaying: {
      title: 'Radio Paradise',
      artist: 'RP Main Mix · FLAC',
      artwork: RADIO_PARADISE_BRAND_LOGO_URL,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
  worldwide_fm: {
    id: 'worldwide_fm',
    pillLabel: 'WORLDWIDE FM',
    streamUrl: 'https://worldwidefm.out.airtime.pro/worldwidefm_a',
    requestedStreamUrl: 'https://www.worldwidefm.net/',
    metadataSource: 'static',
    diChannelTag: 'WORLDWIDE FM',
    brandArtworkUrl: WWFM_BRAND,
    islandAlbum: 'GLOBAL · WWFM',
    staticNowPlaying: {
      title: 'Live from London',
      artist: 'Worldwide FM',
      artwork: WWFM_BRAND,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
  nts_live: {
    id: 'nts_live',
    pillLabel: 'NTS LIVE',
    streamUrl: 'https://stream-relay-geo.ntslive.net/stream',
    requestedStreamUrl: 'https://www.nts.live/',
    metadataSource: 'static',
    diChannelTag: 'NTS RADIO',
    brandArtworkUrl: NTS_BRAND,
    islandAlbum: 'GLOBAL · NTS',
    staticNowPlaying: {
      title: 'NTS Live relay',
      artist: 'NTS Radio',
      artwork: NTS_BRAND,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
  fip_radio: {
    id: 'fip_radio',
    pillLabel: 'FIP',
    streamUrl: 'https://icecast.radiofrance.fr/fip-midfi.mp3',
    requestedStreamUrl: 'https://www.radiofrance.fr/fip',
    metadataSource: 'static',
    diChannelTag: 'FIP',
    brandArtworkUrl: FIP_BRAND,
    islandAlbum: 'GLOBAL · FIP',
    staticNowPlaying: {
      title: 'FIP world music',
      artist: 'Radio France · FIP',
      artwork: FIP_BRAND,
    },
    diLeading: 'chill',
    firePulse: 'normal',
  },
  hor_berlin: {
    id: 'hor_berlin',
    pillLabel: 'HÖR',
    /** Berlin techno relay — swap when an official HÖR HLS endpoint is licensed. */
    streamUrl: 'https://streams.fluxfm.de/TECHO/mp3-128/streams.fluxfm.de/',
    requestedStreamUrl: 'https://hoer.live/',
    metadataSource: 'static',
    diChannelTag: 'HÖR BERLIN',
    brandArtworkUrl: HOR_BRAND,
    islandAlbum: 'GLOBAL · HÖR',
    staticNowPlaying: {
      title: 'Techno relay (Berlin)',
      artist: 'HÖR-style stream · FluxFM Techno',
      artwork: HOR_BRAND,
    },
    diLeading: 'default',
    firePulse: 'max',
  },
  /** Top-row GLOBAL pill — default relay Worldwide FM; list switches {@link GLOBAL_EXPANSION_STATION_ORDER}. */
  global_hub: {
    id: 'global_hub',
    pillLabel: 'GLOBAL',
    streamUrl: 'https://worldwidefm.out.airtime.pro/worldwidefm_a',
    requestedStreamUrl: 'https://www.worldwidefm.net/',
    metadataSource: 'static',
    diChannelTag: 'VYBE GLOBAL',
    brandArtworkUrl: WWFM_BRAND,
    genreIslandLine: 'GENRE: GLOBAL',
    staticNowPlaying: {
      title: 'Global relays',
      artist: 'Worldwide · NTS · FIP · HÖR',
      artwork: WWFM_BRAND,
    },
    diLeading: 'default',
    firePulse: 'normal',
  },
};

/** RADIO_UNITY_V6 — single geometric pill row (GLOBAL hub → Paradise → Decades shortcuts). */
export const GLOBAL_RADIO_STATION_ORDER: GlobalRadioStationId[] = [
  'global_hub',
  'paradise',
  'hiphop',
  'house',
  'indie',
  'lofi',
  'jazz',
  'country',
  'ambient',
  'vault_70s',
  'vault_80s',
  'vault_90s',
  'vault_00s',
];

/** Sub-streams under the JAZZ pill (RadioUnityStationList + `jazzRelayId` in radio tab). */
export const JAZZ_SUB_STATION_ORDER: GlobalRadioStationId[] = ['jazz', 'jazz_secret', 'jazz_beat'];

export type GlobalRadioStreamBridgeKey = 'RP_MAIN';

/**
 * Stream bridge entrypoint — PARADISE pill must call `play('RP_MAIN')` → RP main mix.
 * Resolves to the `paradise` station id used by {@link buildGlobalRadioTrack}.
 */
export function play(streamKey: GlobalRadioStreamBridgeKey): GlobalRadioStationId {
  if (streamKey !== 'RP_MAIN') {
    throw new Error(`GlobalRadioClient.play: unsupported key ${String(streamKey)}`);
  }
  return 'paradise';
}

/** Stations listed under the Era row when “GLOBAL” is selected. */
export const GLOBAL_EXPANSION_STATION_ORDER: GlobalRadioStationId[] = [
  'worldwide_fm',
  'nts_live',
  'fip_radio',
  'hor_berlin',
];

export type DecadesEraTab = 'global' | 'vault_70s' | 'vault_80s' | 'vault_90s' | 'vault_00s' | 'vault_modern';

export const DECADES_ERA_ORDER: DecadesEraTab[] = [
  'global',
  'vault_70s',
  'vault_80s',
  'vault_90s',
  'vault_00s',
  'vault_modern',
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
  /** Live tab / poll snapshot for static relays (title, artist, album art). */
  staticLive?: { title: string; artist: string; artwork: string } | null,
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
          title: staticLive?.title?.trim() || def.staticNowPlaying?.title || 'Live',
          artist: staticLive?.artist?.trim() || def.staticNowPlaying?.artist || def.diChannelTag,
          artwork:
            staticLive?.artwork?.trim() ||
            def.staticNowPlaying?.artwork ||
            def.brandArtworkUrl,
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
    globalRadioIslandAlbum: def.genreIslandLine ?? def.islandAlbum,
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
