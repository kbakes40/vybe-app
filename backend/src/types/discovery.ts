export type TempoRange = 'slow' | 'mid' | 'fast';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type RhythmType = 'boom_bap' | 'lo_fi' | 'trap' | 'house' | 'jazz_swing' | 'ambient' | 'other';
export type InstrumentProfile = 'drums_forward' | 'bass_heavy' | 'melodic' | 'atmospheric';
export type MoodTag = 'late_night' | 'chill' | 'focus' | 'hype' | 'soulful' | 'experimental' | 'melancholic' | 'uplifting';
export type EraFeel = 'old_soul' | 'modern' | 'future' | 'timeless';
export type TrackSource = 'vybe' | 'soundcloud' | 'youtube_music';

export interface TrackFeatures {
  tempo?: number;
  tempoRange?: TempoRange;
  energy?: number;
  energyLevel?: EnergyLevel;
  rhythmType?: RhythmType;
  instrumentProfile?: InstrumentProfile;
  moodTags?: MoodTag[];
  eraFeel?: EraFeel;
}

export interface TasteProfileData {
  preferredTempoMin: number;
  preferredTempoMax: number;
  preferredEnergy: number;
  moodWeights: Record<string, number>;
  rhythmWeights: Record<string, number>;
  genreWeights: Record<string, number>;
  eraWeights: Record<string, number>;
  timePatterns: Record<string, { energy?: number; moods?: string[] }>;
}

export interface ListeningSignalInput {
  trackId: string;
  signalType: 'play' | 'complete' | 'skip' | 'save' | 'replay' | 'unlike';
  listenDuration?: number;
  trackDuration?: number;
  skipPosition?: number;
}

export interface DiscoverySection {
  id: string;
  title: string;
  subtitle?: string;
  tracks: DiscoveryTrack[];
}

export interface DiscoveryTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  source: TrackSource;
  soundcloudUrl?: string;
  youtubeMusicId?: string;
  youtubeId?: string;
  matchReason?: string; // "Similar beat to X" or "Based on your late night listening"
  similarityScore?: number;
}

export interface SimilarityMatch {
  trackId: string;
  score: number;
  reasons: string[];
}

export interface TrackMetadataInput extends TrackFeatures {
  source: string;
  sourceId?: string;
}

// Beat Match Radio types
export interface BeatMatchRadioSettings {
  moodLevel: number; // 0-1: 0=chill, 1=hype
  tempoLevel: number; // 0-1: 0=slow, 1=fast
  discoveryLevel: number; // 0-1: 0=safe, 1=adventurous
}

export interface BeatMatchRadioState {
  queue: DiscoveryTrack[];
  seedTracks: DiscoveryTrack[];
  settings: BeatMatchRadioSettings;
  lastUpdated: string;
  queuePosition: number;
}

export interface BeatMatchRadioResponse {
  nowPlaying: DiscoveryTrack | null;
  upNext: DiscoveryTrack[];
  seedTracks: DiscoveryTrack[];
  settings: BeatMatchRadioSettings;
}

// Taste DNA types
export interface TasteDNADimension {
  name: string;
  value: number; // 0-1
  label: string; // human readable label like "Medium", "High"
}

export interface TasteDNAResponse {
  dimensions: TasteDNADimension[];
  topRhythms: { name: string; weight: number }[];
  topMoods: { name: string; weight: number }[];
  topEras: { name: string; weight: number }[];
  recentShifts: { label: string; direction: 'up' | 'down' }[];
  totalListens: number;
  totalCompletions: number;
  listeningSince: string | null;
}
