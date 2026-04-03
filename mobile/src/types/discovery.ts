export type TempoRange = 'slow' | 'mid' | 'fast';
export type EnergyLevel = 'low' | 'medium' | 'high';
export type RhythmType = 'boom_bap' | 'lo_fi' | 'trap' | 'house' | 'jazz_swing' | 'ambient' | 'other';
export type MoodTag = 'late_night' | 'chill' | 'focus' | 'hype' | 'soulful' | 'experimental' | 'melancholic' | 'uplifting';
export type EraFeel = 'old_soul' | 'modern' | 'future' | 'timeless';
export type TrackSource = 'vybe' | 'soundcloud' | 'youtube_music';

export interface TasteProfile {
  preferredTempoMin: number;
  preferredTempoMax: number;
  preferredEnergy: number;
  moodWeights: Record<string, number>;
  rhythmWeights: Record<string, number>;
  genreWeights: Record<string, number>;
  eraWeights: Record<string, number>;
  timePatterns: Record<string, { energy?: number; moods?: string[] }>;
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
  matchReason?: string;
  similarityScore?: number;
}

export interface DiscoverySection {
  id: string;
  title: string;
  subtitle?: string;
  tracks: DiscoveryTrack[];
}

export type SignalType = 'play' | 'complete' | 'skip' | 'save' | 'replay' | 'unlike';

export interface ListeningSignal {
  trackId: string;
  signalType: SignalType;
  listenDuration?: number;
  trackDuration?: number;
  skipPosition?: number;
}
