/**
 * Radio Paradise playback URL (128k AAC).
 * The `/flac` mount serves `application/ogg` (Icecast); many mobile decoders
 * (expo-av / AVPlayer / ExoPlayer) fail to start it even though desktop players work.
 */
export const RADIO_PARADISE_STREAM_URL = 'https://stream.radioparadise.com/aac-128';

/** Canonical lossless stream (Ogg FLAC) — product reference / requestedStreamUrl only. */
export const RADIO_PARADISE_LOSSLESS_STREAM_URL = 'https://stream.radioparadise.com/flac';

export const RADIO_PARADISE_NOW_PLAYING_URL = 'https://api.radioparadise.com/api/now_playing';

/** Stable station id for queue / metadata polling. */
export const RADIO_PARADISE_STATION_ID = 'radio-paradise-main';

/**
 * Official RP mark (PNG) — Dynamic Island / tab branding when we want the
 * station logo instead of rotating album art.
 */
export const RADIO_PARADISE_BRAND_LOGO_URL =
  'https://vsh-smedia.radioparadise.com/uploads/RP_Logo_Flat_HCR_Green_1_18a033c355.png';
