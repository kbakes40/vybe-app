import type { Track } from '@/types/music';

/**
 * Home “Decades Vault” + easter-egg playlist IDs.
 */
export const DECADES_VAULT_CARDS: {
  name: string;
  playlistId: string;
  subtitle: string;
  seedVideoId: string;
}[] = [
  {
    name: '70s Analog',
    playlistId: 'OLAK5uy_nNJT7AbBdhV752pwUKXiyYRs6aEiUyh5Y',
    subtitle: 'Warm tape & studio soul',
    seedVideoId: '7E8-1t-qh4U',
  },
  {
    name: '80s Neon',
    playlistId: 'RDCLAK5uy_lMzHW51iFg1Kx0d_2EHpzbOgCrwtu8cgI',
    subtitle: 'Synth nights & chrome highs',
    seedVideoId: 'Zi_XLOBDo_Y',
  },
  {
    name: '90s G-Funk',
    playlistId: 'RDCLAK5uy_nQkPLhMF6chdzKSlWdX8NHMrLVpdci-eU',
    subtitle: 'Attitude & low-end sunshine',
    seedVideoId: 'FrLequ6dUdM',
  },
  {
    name: '00s Platinum',
    playlistId: 'OLAK5uy_k8MpasYgwAswSjuvZN5ilDMNPxT5R-mHk',
    subtitle: 'Y2K charts & ringtone royalty',
    seedVideoId: 'uzlHFKhd1Jo',
  },
];

/** Curated picks for social “Attach from Decades Vault” search (YouTube ids + artwork). */
export type DecadesVaultFeedTrackRef = {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
};

export const DECADES_VAULT_FEED_TRACKS: DecadesVaultFeedTrackRef[] = [
  {
    trackId: '2EwViQxSJJQ',
    title: 'Heartless',
    artist: 'Kanye West',
    artwork: 'https://img.youtube.com/vi/2EwViQxSJJQ/hqdefault.jpg',
  },
  ...DECADES_VAULT_CARDS.map((c) => ({
    trackId: c.seedVideoId,
    title: c.name,
    artist: c.subtitle,
    artwork: `https://img.youtube.com/vi/${c.seedVideoId}/hqdefault.jpg`,
  })),
];

export const DECADES_70S_PLAYLIST_ID = DECADES_VAULT_CARDS[0]!.playlistId;
export const DECADES_90S_PLAYLIST_ID = DECADES_VAULT_CARDS[2]!.playlistId;

export const MAINSTREET_TEES_US_URL = 'https://mainstreetteesus.com';

/** Easter egg row #7 in 70s Analog — MainStreet Tees on Etsy. */
export const MAINSTREET_TEES_ETSY_URL = 'https://www.etsy.com/shop/MainStreetTeesUS';

export function buildMainstreetThreadsVaultTrack(playlistAlbumId: string): Track {
  return {
    id: 'vybe-vault-mainstreet-threads',
    title: 'THREADS OF THE VAULT',
    artist: 'MainStreetTeesUS',
    artistId: '',
    album: 'The Decades Vault',
    albumId: playlistAlbumId,
    /** Stable favicon — row still reads clearly as promo, not a broken album tile. */
    artwork: 'https://www.etsy.com/favicon.ico',
    duration: 0,
    isLiked: false,
    source: 'vybe',
    audioUrl: '',
    externalHandoffUrl: MAINSTREET_TEES_ETSY_URL,
  };
}
