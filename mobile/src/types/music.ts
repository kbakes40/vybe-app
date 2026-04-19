export type TrackSource =
  | 'vybe'
  | 'youtube'
  | 'youtube_music'
  | 'soundcloud'
  | 'freepd'
  | 'radio_paradise'
  /** Internet radio / hi-fi relays (see `GlobalRadioClient`). */
  | 'global_radio';

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  album: string;
  albumId: string;
  artwork: string;
  duration: number; // seconds
  isLiked: boolean;
  audioUrl?: string; // URL to stream audio (for VYBE tracks)
  source?: TrackSource; // Track source
  youtubeId?: string; // YouTube video ID (for YouTube tracks)
  youtubeMusicId?: string; // YouTube Music video ID (for YouTube Music tracks)
  youtubeMusicUrl?: string; // YouTube Music URL (for deep linking)
  soundcloudId?: string; // SoundCloud track ID (for SoundCloud tracks)
  soundcloudUrl?: string; // SoundCloud track URL (for embedding)
  tags?: string[]; // Tags for categorization and recommendations
  isUnderground?: boolean; // Whether this is an underground/indie artist
  // Offline download support
  downloadable?: boolean; // Whether artist enabled official downloads
  downloadUrl?: string | null; // Official SoundCloud download URL
  isDownloaded?: boolean; // Whether track is available offline
  localFilePath?: string; // Path to downloaded/imported file
  importedAt?: number; // Timestamp when file was imported
  isUserImported?: boolean; // Whether user imported this file manually
  fileSize?: number; // File size in bytes
  fileFormat?: string; // Audio format (mp3, flac, wav, etc.)
  // External source handoff (for SoundCloud search)
  externalSource?: 'SOUNDCLOUD'; // External platform identifier
  externalSearchQuery?: string; // Search query for external handoff (e.g., "artist title")
  // License and attribution
  licenseName?: string; // Name of the license (e.g., "CC0", "CC BY")
  licenseUrl?: string; // URL to the license
  attributionRequired?: boolean; // Whether attribution is required
  attributionText?: string; // Text to use for attribution
  // Streaming and download options
  isDownloadable?: boolean; // Whether track can be downloaded
  isStreamable?: boolean; // Whether track can be streamed
  qualityOptions?: ('Standard' | 'High' | 'Lossless')[]; // Available quality options
  // Metadata
  genreTags?: string[]; // Genre tags
  moodTags?: string[]; // Mood tags
  bpm?: number; // Beats per minute
  musicalKey?: string; // Musical key (e.g., "C major", "A minor")
  releaseYear?: number; // Year the track was released
  /** When set, tap opens this URL (e.g. vault promo) instead of starting playback. */
  externalHandoffUrl?: string;

  /** `global_radio` — station key from `GlobalRadioClient`. */
  globalRadioStationId?: string;
  globalRadioMetadataSource?: 'radioparadise_api' | 'static';
  /** Short channel tag for lock screen / Dynamic Island (e.g. `RP PARADISE`). */
  globalRadioDiTag?: string;
  globalRadioDiLeading?: 'default' | 'chill';
  /** HIP HOP: max-frequency Fire shell pulse in soul actions. */
  globalRadioFirePulse?: 'normal' | 'max';
  /** MPNowPlaying / Dynamic Island album line (e.g. `VAULT: 80S`, `GLOBAL · NTS`). */
  globalRadioIslandAlbum?: string;
}

export interface RelatedTrack extends Track {
  tags: string[];
  isUnderground: boolean;
}

export interface MixDefinition {
  id: string;
  name: string;
  description: string;
  coverImage: string;
  tags: string[];
  trackCount: number;
  duration: number;
  category: 'era' | 'mood' | 'activity';
}

export interface Tag {
  id: string;
  name: string;
  category: 'genre' | 'mood' | 'style' | 'era';
}

export interface Artist {
  id: string;
  name: string;
  image: string;
  followers: number;
  isVerified: boolean;
  genres: string[];
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId: string;
  artwork: string;
  releaseYear: number;
  trackCount: number;
  tracks: string[]; // track IDs
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  artwork: string;
  creator: string;
  trackCount: number;
  duration: number; // total seconds
  tracks: string[]; // track IDs
  isPersonalized?: boolean;
  gradientColors?: [string, string];
}

export interface Category {
  id: string;
  name: string;
  gradientColors: [string, string];
}

export type RepeatMode = 'off' | 'all' | 'one';
