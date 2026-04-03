/**
 * MusicGen Service
 *
 * Mock catalog service for VYBE Originals - AI-generated music tracks.
 * Uses hardcoded catalog data with real royalty-free audio URLs from FreePD.
 */

import type {
  MusicGenTrack,
  MusicGenCatalog,
  MusicGenMood,
  MusicGenGenre,
  MusicGenAlbum,
  MusicGenFilterParams,
  MusicGenPaginationParams,
  MusicGenPaginatedResponse,
  VYBEMusicGenTrack,
  MusicGenStatus,
} from '../types/musicgen';

/**
 * The VYBE Studio artist info
 */
const VYBE_STUDIO = {
  name: 'VYBE Studio',
  id: 'vybe-studio-ai',
};

/**
 * Mock MusicGen track catalog
 * Uses real audio URLs from Bensound (royalty-free with attribution)
 * All tracks are CC licensed and properly attributed
 */
const mockMusicGenTracks: MusicGenTrack[] = [
  // AI Sessions Vol. 1 - Chill / Lo-fi
  {
    id: 'mg-001',
    title: 'Midnight Thoughts',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 1',
    albumId: 'album-ai-sessions-1',
    duration: 198,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-slowmotion.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-001',
    moodTags: ['chill', 'late_night', 'dreamy'],
    genreTags: ['lo-fi', 'chillhop'],
    isFeatured: true,
    source: 'musicgen',
    bpm: 85,
    description: 'A dreamy lo-fi beat perfect for late night vibes',
    addedAt: '2024-01-15T00:00:00Z',
    generationPrompt: 'lo-fi hip hop, chill, dreamy, vinyl crackle, mellow keys',
  },
  {
    id: 'mg-002',
    title: 'Rainy Window',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 1',
    albumId: 'album-ai-sessions-1',
    duration: 215,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-acousticbreeze.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-002',
    moodTags: ['chill', 'melancholic', 'lofi'],
    genreTags: ['lo-fi', 'ambient'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 72,
    description: 'Soft melodies like raindrops on glass',
    addedAt: '2024-01-16T00:00:00Z',
    generationPrompt: 'rain sounds, lo-fi, melancholic, soft piano, ambient',
  },
  {
    id: 'mg-003',
    title: 'Study Session',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 1',
    albumId: 'album-ai-sessions-1',
    duration: 245,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-relaxing.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-003',
    moodTags: ['focus', 'productivity', 'chill'],
    genreTags: ['lo-fi', 'chillhop'],
    isFeatured: true,
    source: 'musicgen',
    bpm: 90,
    description: 'Focused beats for deep concentration',
    addedAt: '2024-01-17T00:00:00Z',
    generationPrompt: 'lo-fi study beats, focus, calm, minimal, steady rhythm',
  },
  {
    id: 'mg-004',
    title: 'Coffee Shop Morning',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 1',
    albumId: 'album-ai-sessions-1',
    duration: 187,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-sunny.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-004',
    moodTags: ['chill', 'uplifting', 'groovy'],
    genreTags: ['lo-fi', 'jazz'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 95,
    description: 'Warm jazz-infused lo-fi vibes',
    addedAt: '2024-01-18T00:00:00Z',
    generationPrompt: 'lo-fi jazz, coffee shop, warm, acoustic guitar, uplifting',
  },

  // AI Sessions Vol. 2 - Focus / Productivity
  {
    id: 'mg-005',
    title: 'Deep Work',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 2',
    albumId: 'album-ai-sessions-2',
    duration: 312,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-dreams.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-005',
    moodTags: ['focus', 'productivity', 'ambient'],
    genreTags: ['ambient', 'electronic'],
    isFeatured: true,
    source: 'musicgen',
    bpm: 70,
    description: 'Minimal ambient soundscape for deep focus',
    addedAt: '2024-02-01T00:00:00Z',
    generationPrompt: 'ambient, focus, minimal, spatial, clean',
  },
  {
    id: 'mg-006',
    title: 'Flow State',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 2',
    albumId: 'album-ai-sessions-2',
    duration: 267,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-inspire.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-006',
    moodTags: ['focus', 'energetic', 'uplifting'],
    genreTags: ['electronic', 'downtempo'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 100,
    description: 'Rhythmic electronic pulse for productive flow',
    addedAt: '2024-02-02T00:00:00Z',
    generationPrompt: 'electronic, productivity, rhythmic, uplifting, modern',
  },
  {
    id: 'mg-007',
    title: 'Clear Mind',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 2',
    albumId: 'album-ai-sessions-2',
    duration: 289,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-tenderness.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-007',
    moodTags: ['meditative', 'ambient', 'focus'],
    genreTags: ['ambient', 'classical'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 60,
    description: 'Serene soundscape for mental clarity',
    addedAt: '2024-02-03T00:00:00Z',
    generationPrompt: 'ambient, meditation, piano, serene, clarity',
  },
  {
    id: 'mg-008',
    title: 'Code & Create',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 2',
    albumId: 'album-ai-sessions-2',
    duration: 234,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-creativeminds.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-008',
    moodTags: ['focus', 'productivity', 'energetic'],
    genreTags: ['electronic', 'synthwave'],
    isFeatured: true,
    source: 'musicgen',
    bpm: 110,
    description: 'Tech-inspired beats for coding sessions',
    addedAt: '2024-02-04T00:00:00Z',
    generationPrompt: 'synthwave, coding, tech, electronic, rhythmic',
  },

  // AI Sessions Vol. 3 - Ambient / Cinematic
  {
    id: 'mg-009',
    title: 'Horizon Light',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 3',
    albumId: 'album-ai-sessions-3',
    duration: 345,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-epic.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-009',
    moodTags: ['cinematic', 'ethereal', 'uplifting'],
    genreTags: ['cinematic', 'ambient'],
    isFeatured: true,
    source: 'musicgen',
    bpm: 75,
    description: 'Epic ambient journey through soundscapes',
    addedAt: '2024-03-01T00:00:00Z',
    generationPrompt: 'cinematic, epic, ambient, orchestral, ethereal',
  },
  {
    id: 'mg-010',
    title: 'Digital Sunset',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 3',
    albumId: 'album-ai-sessions-3',
    duration: 278,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-betterdays.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-010',
    moodTags: ['ambient', 'dreamy', 'melancholic'],
    genreTags: ['ambient', 'electronic'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 65,
    description: 'Warm textures fading into night',
    addedAt: '2024-03-02T00:00:00Z',
    generationPrompt: 'ambient, sunset, warm, textured, melancholic',
  },
  {
    id: 'mg-011',
    title: 'Starfield',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 3',
    albumId: 'album-ai-sessions-3',
    duration: 298,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-scifi.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-011',
    moodTags: ['ambient', 'ethereal', 'cinematic'],
    genreTags: ['ambient', 'experimental'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 55,
    description: 'Deep space ambient exploration',
    addedAt: '2024-03-03T00:00:00Z',
    generationPrompt: 'space, ambient, deep, ethereal, cosmic',
  },
  {
    id: 'mg-012',
    title: 'Mountain Echo',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'AI Sessions Vol. 3',
    albumId: 'album-ai-sessions-3',
    duration: 267,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-adventure.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-012',
    moodTags: ['cinematic', 'uplifting', 'ethereal'],
    genreTags: ['cinematic', 'world'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 80,
    description: 'Majestic soundscape of distant peaks',
    addedAt: '2024-03-04T00:00:00Z',
    generationPrompt: 'cinematic, mountain, epic, nature, uplifting',
  },

  // Late Night Frequencies - Late Night / Dreamy
  {
    id: 'mg-013',
    title: '3AM Thoughts',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Late Night Frequencies',
    albumId: 'album-late-night',
    duration: 223,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-memories.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-013',
    moodTags: ['late_night', 'dreamy', 'melancholic'],
    genreTags: ['lo-fi', 'ambient'],
    isFeatured: true,
    source: 'musicgen',
    bpm: 78,
    description: 'Introspective late night melodies',
    addedAt: '2024-04-01T00:00:00Z',
    generationPrompt: 'late night, introspective, lo-fi, dreamy, emotional',
  },
  {
    id: 'mg-014',
    title: 'Neon Dreams',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Late Night Frequencies',
    albumId: 'album-late-night',
    duration: 256,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-evolution.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-014',
    moodTags: ['late_night', 'dreamy', 'energetic'],
    genreTags: ['synthwave', 'electronic'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 105,
    description: 'City lights through a rain-soaked window',
    addedAt: '2024-04-02T00:00:00Z',
    generationPrompt: 'synthwave, neon, night, urban, dreamy',
  },
  {
    id: 'mg-015',
    title: 'Moonlit Path',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Late Night Frequencies',
    albumId: 'album-late-night',
    duration: 289,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-birth.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-015',
    moodTags: ['late_night', 'ambient', 'ethereal'],
    genreTags: ['ambient', 'downtempo'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 68,
    description: 'Gentle nocturnal ambient journey',
    addedAt: '2024-04-03T00:00:00Z',
    generationPrompt: 'moonlight, ambient, peaceful, night, ethereal',
  },
  {
    id: 'mg-016',
    title: 'Sleepless',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Late Night Frequencies',
    albumId: 'album-late-night',
    duration: 234,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-ofeliasdream.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-016',
    moodTags: ['late_night', 'melancholic', 'groovy'],
    genreTags: ['downtempo', 'electronic'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 92,
    description: 'Deep grooves for wakeful nights',
    addedAt: '2024-04-04T00:00:00Z',
    generationPrompt: 'downtempo, night, groovy, deep, electronic',
  },

  // Focus Flow - More productivity tracks
  {
    id: 'mg-017',
    title: 'Alpha Waves',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Focus Flow',
    albumId: 'album-focus-flow',
    duration: 312,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-pianomoment.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-017',
    moodTags: ['focus', 'meditative', 'ambient'],
    genreTags: ['ambient', 'electronic'],
    isFeatured: true,
    source: 'musicgen',
    bpm: 62,
    description: 'Brain-syncing frequencies for deep focus',
    addedAt: '2024-05-01T00:00:00Z',
    generationPrompt: 'binaural, focus, ambient, minimal, brain waves',
  },
  {
    id: 'mg-018',
    title: 'Productive Morning',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Focus Flow',
    albumId: 'album-focus-flow',
    duration: 245,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-ukulele.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-018',
    moodTags: ['productivity', 'uplifting', 'energetic'],
    genreTags: ['electronic', 'chillhop'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 98,
    description: 'Energizing beats to start your day',
    addedAt: '2024-05-02T00:00:00Z',
    generationPrompt: 'morning, uplifting, energy, positive, electronic',
  },
  {
    id: 'mg-019',
    title: 'Task Master',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Focus Flow',
    albumId: 'album-focus-flow',
    duration: 278,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-clearday.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-019',
    moodTags: ['focus', 'productivity', 'energetic'],
    genreTags: ['electronic', 'downtempo'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 105,
    description: 'Rhythmic drive for tackling tasks',
    addedAt: '2024-05-03T00:00:00Z',
    generationPrompt: 'productive, rhythmic, electronic, focused, driven',
  },

  // Ambient Horizons
  {
    id: 'mg-020',
    title: 'Ocean Drift',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Ambient Horizons',
    albumId: 'album-ambient-horizons',
    duration: 356,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-summer.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-020',
    moodTags: ['ambient', 'meditative', 'ethereal'],
    genreTags: ['ambient', 'world'],
    isFeatured: true,
    source: 'musicgen',
    bpm: 50,
    description: 'Gentle waves of ambient sound',
    addedAt: '2024-06-01T00:00:00Z',
    generationPrompt: 'ocean, ambient, peaceful, waves, meditative',
  },
  {
    id: 'mg-021',
    title: 'Forest Whispers',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Ambient Horizons',
    albumId: 'album-ambient-horizons',
    duration: 334,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-tomorrow.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-021',
    moodTags: ['ambient', 'meditative', 'chill'],
    genreTags: ['ambient', 'classical'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 58,
    description: 'Nature-inspired ambient textures',
    addedAt: '2024-06-02T00:00:00Z',
    generationPrompt: 'forest, nature, ambient, peaceful, organic',
  },
  {
    id: 'mg-022',
    title: 'Cloud Nine',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Ambient Horizons',
    albumId: 'album-ambient-horizons',
    duration: 298,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-dreams.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-022',
    moodTags: ['ambient', 'dreamy', 'uplifting'],
    genreTags: ['ambient', 'electronic'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 72,
    description: 'Floating through layers of sound',
    addedAt: '2024-06-03T00:00:00Z',
    generationPrompt: 'clouds, floating, ambient, dreamy, light',
  },

  // Cinematic Journeys
  {
    id: 'mg-023',
    title: 'Epic Rise',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Cinematic Journeys',
    albumId: 'album-cinematic',
    duration: 267,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-epic.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-023',
    moodTags: ['cinematic', 'energetic', 'uplifting'],
    genreTags: ['cinematic', 'electronic'],
    isFeatured: true,
    source: 'musicgen',
    bpm: 88,
    description: 'Building tension and triumphant release',
    addedAt: '2024-07-01T00:00:00Z',
    generationPrompt: 'epic, cinematic, rising, triumphant, orchestral',
  },
  {
    id: 'mg-024',
    title: 'Distant Memories',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Cinematic Journeys',
    albumId: 'album-cinematic',
    duration: 289,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-sadday.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-024',
    moodTags: ['cinematic', 'melancholic', 'ethereal'],
    genreTags: ['cinematic', 'classical'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 70,
    description: 'Nostalgic cinematic soundscape',
    addedAt: '2024-07-02T00:00:00Z',
    generationPrompt: 'memories, cinematic, nostalgic, piano, emotional',
  },
  {
    id: 'mg-025',
    title: 'Adventure Awaits',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Cinematic Journeys',
    albumId: 'album-cinematic',
    duration: 245,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-adventure.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-025',
    moodTags: ['cinematic', 'energetic', 'uplifting'],
    genreTags: ['cinematic', 'world'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 95,
    description: 'The call to embark on new journeys',
    addedAt: '2024-07-03T00:00:00Z',
    generationPrompt: 'adventure, epic, cinematic, journey, exciting',
  },

  // Lo-Fi Dreams
  {
    id: 'mg-026',
    title: 'Vinyl Memories',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Lo-Fi Dreams',
    albumId: 'album-lofi-dreams',
    duration: 212,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-jazzyfrenchy.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-026',
    moodTags: ['lofi', 'chill', 'melancholic'],
    genreTags: ['lo-fi', 'chillhop'],
    isFeatured: true,
    source: 'musicgen',
    bpm: 82,
    description: 'Warm crackle of vintage vibes',
    addedAt: '2024-08-01T00:00:00Z',
    generationPrompt: 'lo-fi, vinyl, warm, nostalgic, hip hop',
  },
  {
    id: 'mg-027',
    title: 'Lazy Sunday',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Lo-Fi Dreams',
    albumId: 'album-lofi-dreams',
    duration: 198,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-littleidea.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-027',
    moodTags: ['lofi', 'chill', 'groovy'],
    genreTags: ['lo-fi', 'jazz'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 88,
    description: 'Easy-going beats for relaxed days',
    addedAt: '2024-08-02T00:00:00Z',
    generationPrompt: 'lo-fi, sunday, relaxed, jazz, chill',
  },
  {
    id: 'mg-028',
    title: 'Bedroom Producer',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Lo-Fi Dreams',
    albumId: 'album-lofi-dreams',
    duration: 234,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-cute.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-028',
    moodTags: ['lofi', 'chill', 'groovy'],
    genreTags: ['lo-fi', 'chillhop'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 85,
    description: 'Home studio vibes',
    addedAt: '2024-08-03T00:00:00Z',
    generationPrompt: 'bedroom, lo-fi, producer, beats, guitar',
  },
  {
    id: 'mg-029',
    title: 'Analog Warmth',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Lo-Fi Dreams',
    albumId: 'album-lofi-dreams',
    duration: 267,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-anewbeginning.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-029',
    moodTags: ['lofi', 'chill', 'dreamy'],
    genreTags: ['lo-fi', 'electronic'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 78,
    description: 'Warm analog textures and soft beats',
    addedAt: '2024-08-04T00:00:00Z',
    generationPrompt: 'analog, warm, lo-fi, tape, dreamy',
  },
  {
    id: 'mg-030',
    title: 'Night Drive',
    artist: VYBE_STUDIO.name,
    artistId: VYBE_STUDIO.id,
    album: 'Lo-Fi Dreams',
    albumId: 'album-lofi-dreams',
    duration: 245,
    audioUrl: 'https://www.bensound.com/bensound-music/bensound-retrosoul.mp3',
    artworkUrl: '/api/musicgen/artwork/mg-030',
    moodTags: ['lofi', 'late_night', 'chill'],
    genreTags: ['lo-fi', 'synthwave'],
    isFeatured: false,
    source: 'musicgen',
    bpm: 92,
    description: 'Cruising through city lights',
    addedAt: '2024-08-05T00:00:00Z',
    generationPrompt: 'night drive, lo-fi, city, synthwave, chill',
  },
];

/**
 * In-memory catalog cache
 */
let catalogCache: MusicGenCatalog | null = null;
let lastCatalogUpdate: Date | null = null;

/**
 * Calculate mood counts from a list of tracks
 */
function calculateMoodCounts(tracks: MusicGenTrack[]): Record<MusicGenMood, number> {
  const counts: Record<MusicGenMood, number> = {
    chill: 0,
    lofi: 0,
    focus: 0,
    productivity: 0,
    ambient: 0,
    cinematic: 0,
    late_night: 0,
    dreamy: 0,
    energetic: 0,
    uplifting: 0,
    melancholic: 0,
    ethereal: 0,
    groovy: 0,
    meditative: 0,
  };

  for (const track of tracks) {
    for (const mood of track.moodTags) {
      counts[mood]++;
    }
  }

  return counts;
}

/**
 * Calculate genre counts from a list of tracks
 */
function calculateGenreCounts(tracks: MusicGenTrack[]): Record<MusicGenGenre, number> {
  const counts: Record<MusicGenGenre, number> = {
    electronic: 0,
    ambient: 0,
    'lo-fi': 0,
    chillhop: 0,
    synthwave: 0,
    downtempo: 0,
    cinematic: 0,
    jazz: 0,
    classical: 0,
    world: 0,
    experimental: 0,
  };

  for (const track of tracks) {
    for (const genre of track.genreTags) {
      counts[genre]++;
    }
  }

  return counts;
}

/**
 * Calculate album counts from a list of tracks
 */
function calculateAlbumCounts(tracks: MusicGenTrack[]): Record<MusicGenAlbum, number> {
  const counts: Record<MusicGenAlbum, number> = {
    'AI Sessions Vol. 1': 0,
    'AI Sessions Vol. 2': 0,
    'AI Sessions Vol. 3': 0,
    'Late Night Frequencies': 0,
    'Focus Flow': 0,
    'Ambient Horizons': 0,
    'Cinematic Journeys': 0,
    'Lo-Fi Dreams': 0,
  };

  for (const track of tracks) {
    counts[track.album]++;
  }

  return counts;
}

/**
 * Convert a MusicGen track to VYBE format
 */
export function toVYBEFormat(track: MusicGenTrack): VYBEMusicGenTrack {
  return {
    id: `musicgen-${track.id}`,
    title: track.title,
    artist: track.artist,
    artistId: track.artistId,
    album: track.album,
    albumId: track.albumId,
    artwork: track.artworkUrl,
    duration: track.duration,
    isLiked: false,
    source: 'musicgen',
    musicgenId: track.id,
    audioUrl: track.audioUrl,
    downloadable: true,
    downloadUrl: track.audioUrl,
    genres: track.genreTags,
    moods: track.moodTags,
    isFeatured: track.isFeatured,
    bpm: track.bpm,
    description: track.description,
  };
}

/**
 * Get the full MusicGen catalog
 */
export async function getMusicGenCatalog(): Promise<MusicGenCatalog> {
  // Check cache (5 minute TTL)
  if (catalogCache && lastCatalogUpdate) {
    const cacheAge = Date.now() - lastCatalogUpdate.getTime();
    if (cacheAge < 5 * 60 * 1000) {
      return catalogCache;
    }
  }

  const featuredTracks = mockMusicGenTracks.filter((t) => t.isFeatured);

  const catalog: MusicGenCatalog = {
    tracks: mockMusicGenTracks,
    featuredTracks,
    totalTracks: mockMusicGenTracks.length,
    moodCounts: calculateMoodCounts(mockMusicGenTracks),
    genreCounts: calculateGenreCounts(mockMusicGenTracks),
    albumCounts: calculateAlbumCounts(mockMusicGenTracks),
    lastUpdated: new Date().toISOString(),
    version: '1.0.0',
  };

  // Update cache
  catalogCache = catalog;
  lastCatalogUpdate = new Date();

  return catalog;
}

/**
 * Get a single track by ID
 */
export async function getTrack(trackId: string): Promise<MusicGenTrack | null> {
  // Handle both full ID (musicgen-mg-001) and short ID (mg-001)
  const normalizedId = trackId.startsWith('musicgen-')
    ? trackId.replace('musicgen-', '')
    : trackId;

  return mockMusicGenTracks.find((track) => track.id === normalizedId) || null;
}

/**
 * Get tracks filtered by mood
 */
export async function getTracksByMood(mood: MusicGenMood): Promise<MusicGenTrack[]> {
  return mockMusicGenTracks.filter((track) => track.moodTags.includes(mood));
}

/**
 * Get tracks filtered by genre
 */
export async function getTracksByGenre(genre: MusicGenGenre): Promise<MusicGenTrack[]> {
  return mockMusicGenTracks.filter((track) => track.genreTags.includes(genre));
}

/**
 * Get featured tracks
 */
export async function getFeaturedTracks(): Promise<MusicGenTrack[]> {
  return mockMusicGenTracks.filter((track) => track.isFeatured);
}

/**
 * Get paginated tracks with optional filters
 */
export async function getTracks(
  filters: MusicGenFilterParams = {},
  pagination: MusicGenPaginationParams = {}
): Promise<MusicGenPaginatedResponse> {
  let tracks = [...mockMusicGenTracks];

  // Apply filters
  if (filters.mood) {
    tracks = tracks.filter((t) => t.moodTags.includes(filters.mood!));
  }

  if (filters.genre) {
    tracks = tracks.filter((t) => t.genreTags.includes(filters.genre!));
  }

  if (filters.album) {
    tracks = tracks.filter((t) => t.album === filters.album);
  }

  if (filters.featured !== undefined) {
    tracks = tracks.filter((t) => t.isFeatured === filters.featured);
  }

  // Apply sorting
  const sortBy = pagination.sortBy || 'title';
  const sortOrder = pagination.sortOrder || 'asc';

  tracks.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'duration':
        comparison = a.duration - b.duration;
        break;
      case 'addedAt':
        comparison = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
        break;
      case 'bpm':
        comparison = (a.bpm || 0) - (b.bpm || 0);
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Apply pagination
  const page = pagination.page || 1;
  const limit = Math.min(pagination.limit || 20, 100); // Max 100 per page
  const total = tracks.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;

  const paginatedTracks = tracks.slice(offset, offset + limit);

  // Convert to VYBE format
  const vybeTracks = paginatedTracks.map(toVYBEFormat);

  return {
    tracks: vybeTracks,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/**
 * Generate placeholder SVG artwork for a track
 */
export function generateArtworkSvg(trackId: string, title: string, moods: MusicGenMood[] = []): string {
  // Color schemes based on mood
  const moodColorSchemes: Record<MusicGenMood, { bg: string; fg: string; accent: string }> = {
    chill: { bg: '#1a365d', fg: '#63b3ed', accent: '#2b6cb0' },
    lofi: { bg: '#2d3748', fg: '#ed8936', accent: '#4a5568' },
    focus: { bg: '#234e52', fg: '#38b2ac', accent: '#285e61' },
    productivity: { bg: '#2f855a', fg: '#68d391', accent: '#276749' },
    ambient: { bg: '#2c5282', fg: '#90cdf4', accent: '#3182ce' },
    cinematic: { bg: '#1a202c', fg: '#f6e05e', accent: '#2d3748' },
    late_night: { bg: '#1a1a2e', fg: '#9f7aea', accent: '#322659' },
    dreamy: { bg: '#553c9a', fg: '#d6bcfa', accent: '#6b46c1' },
    energetic: { bg: '#c53030', fg: '#feb2b2', accent: '#9b2c2c' },
    uplifting: { bg: '#d69e2e', fg: '#faf089', accent: '#b7791f' },
    melancholic: { bg: '#2a4365', fg: '#a3bffa', accent: '#3c366b' },
    ethereal: { bg: '#319795', fg: '#b2f5ea', accent: '#285e61' },
    groovy: { bg: '#702459', fg: '#f687b3', accent: '#97266d' },
    meditative: { bg: '#2c7a7b', fg: '#81e6d9', accent: '#234e52' },
  };

  // Get color scheme based on first mood, default to chill
  const primaryMood = moods[0] || 'chill';
  const colors = moodColorSchemes[primaryMood];

  // Get initials from title
  const initials = title
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <defs>
    <linearGradient id="grad-${trackId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colors.bg};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colors.accent};stop-opacity:1" />
    </linearGradient>
    <filter id="glow-${trackId}">
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="shadow-${trackId}">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.3"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="500" height="500" fill="url(#grad-${trackId})"/>

  <!-- Abstract waveform decoration -->
  <g opacity="0.15">
    <circle cx="120" cy="400" r="180" fill="${colors.fg}"/>
    <circle cx="380" cy="100" r="150" fill="${colors.fg}"/>
  </g>

  <!-- Central circular element -->
  <circle cx="250" cy="200" r="100" fill="${colors.accent}" opacity="0.5"/>
  <circle cx="250" cy="200" r="75" fill="${colors.bg}" opacity="0.8"/>
  <circle cx="250" cy="200" r="50" fill="${colors.fg}" opacity="0.9"/>

  <!-- Track initials -->
  <text x="250" y="215" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="${colors.bg}" text-anchor="middle" filter="url(#glow-${trackId})">${initials}</text>

  <!-- VYBE Studio branding -->
  <text x="250" y="340" font-family="Arial, sans-serif" font-size="20" font-weight="600" fill="${colors.fg}" text-anchor="middle" opacity="0.95">VYBE Studio</text>
  <text x="250" y="365" font-family="Arial, sans-serif" font-size="14" fill="${colors.fg}" text-anchor="middle" opacity="0.7">AI Generated</text>

  <!-- Waveform visualization at bottom -->
  <g opacity="0.4" transform="translate(0, 10)">
    <rect x="80" y="410" width="6" height="35" rx="3" fill="${colors.fg}"/>
    <rect x="100" y="400" width="6" height="55" rx="3" fill="${colors.fg}"/>
    <rect x="120" y="415" width="6" height="30" rx="3" fill="${colors.fg}"/>
    <rect x="140" y="395" width="6" height="60" rx="3" fill="${colors.fg}"/>
    <rect x="160" y="405" width="6" height="50" rx="3" fill="${colors.fg}"/>
    <rect x="180" y="385" width="6" height="70" rx="3" fill="${colors.fg}"/>
    <rect x="200" y="410" width="6" height="35" rx="3" fill="${colors.fg}"/>
    <rect x="220" y="390" width="6" height="65" rx="3" fill="${colors.fg}"/>
    <rect x="240" y="375" width="6" height="80" rx="3" fill="${colors.fg}"/>
    <rect x="260" y="390" width="6" height="65" rx="3" fill="${colors.fg}"/>
    <rect x="280" y="410" width="6" height="35" rx="3" fill="${colors.fg}"/>
    <rect x="300" y="385" width="6" height="70" rx="3" fill="${colors.fg}"/>
    <rect x="320" y="405" width="6" height="50" rx="3" fill="${colors.fg}"/>
    <rect x="340" y="395" width="6" height="60" rx="3" fill="${colors.fg}"/>
    <rect x="360" y="415" width="6" height="30" rx="3" fill="${colors.fg}"/>
    <rect x="380" y="400" width="6" height="55" rx="3" fill="${colors.fg}"/>
    <rect x="400" y="410" width="6" height="35" rx="3" fill="${colors.fg}"/>
  </g>
</svg>`;
}

/**
 * Get service status
 */
export async function getStatus(): Promise<MusicGenStatus> {
  const catalog = await getMusicGenCatalog();
  return {
    available: true,
    version: catalog.version,
    totalTracks: catalog.totalTracks,
    lastUpdated: catalog.lastUpdated,
  };
}

/**
 * Get all available moods
 */
export function getAvailableMoods(): MusicGenMood[] {
  return [
    'chill',
    'lofi',
    'focus',
    'productivity',
    'ambient',
    'cinematic',
    'late_night',
    'dreamy',
    'energetic',
    'uplifting',
    'melancholic',
    'ethereal',
    'groovy',
    'meditative',
  ];
}

/**
 * Get all available genres
 */
export function getAvailableGenres(): MusicGenGenre[] {
  return [
    'electronic',
    'ambient',
    'lo-fi',
    'chillhop',
    'synthwave',
    'downtempo',
    'cinematic',
    'jazz',
    'classical',
    'world',
    'experimental',
  ];
}

/**
 * Get all available albums
 */
export function getAvailableAlbums(): MusicGenAlbum[] {
  return [
    'AI Sessions Vol. 1',
    'AI Sessions Vol. 2',
    'AI Sessions Vol. 3',
    'Late Night Frequencies',
    'Focus Flow',
    'Ambient Horizons',
    'Cinematic Journeys',
    'Lo-Fi Dreams',
  ];
}
