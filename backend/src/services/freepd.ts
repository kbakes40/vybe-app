/**
 * FreePD Service
 *
 * Provides functions to fetch, normalize, and manage FreePD music catalog.
 * Since FreePD doesn't have a public API, this uses mock data for now.
 */

import type {
  FreePDTrack,
  FreePDCatalog,
  FreePDImportResult,
  FreePDSearchParams,
  FreePDPaginationParams,
  FreePDPaginatedResponse,
  FreePDGenre,
  FreePDMood,
  FreePDInstrumentProfile,
  VYBEFreePDTrack,
} from '../types/freepd';

/**
 * Mock FreePD track data
 * In production, this would be fetched from FreePD website or a cached database
 */
const mockFreePDTracks: FreePDTrack[] = [
  {
    id: 'fpd-001',
    title: 'Epic Cinematic Adventure',
    artist: 'Kevin MacLeod',
    artistId: 'freepd-artist-kevin-macleod',
    genre: 'epic',
    duration: 185,
    moods: ['energetic', 'uplifting', 'intense'],
    instrumentProfile: 'orchestral',
    artworkUrl: '/api/freepd/artwork/fpd-001',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    sourceUrl: 'https://freepd.com/epic.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-01-15T00:00:00Z',
    bpm: 120,
    tags: ['cinematic', 'trailer', 'action', 'orchestral'],
  },
  {
    id: 'fpd-002',
    title: 'Peaceful Morning',
    artist: 'Alexander Nakarada',
    artistId: 'freepd-artist-alexander-nakarada',
    genre: 'ambient',
    duration: 245,
    moods: ['calm', 'peaceful', 'uplifting'],
    instrumentProfile: 'acoustic',
    artworkUrl: '/api/freepd/artwork/fpd-002',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    sourceUrl: 'https://freepd.com/ambient.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-02-10T00:00:00Z',
    bpm: 72,
    tags: ['relaxing', 'meditation', 'nature', 'acoustic'],
  },
  {
    id: 'fpd-003',
    title: 'Upbeat Corporate',
    artist: 'Scott Buckley',
    artistId: 'freepd-artist-scott-buckley',
    genre: 'corporate',
    duration: 156,
    moods: ['happy', 'energetic', 'uplifting'],
    instrumentProfile: 'acoustic',
    artworkUrl: '/api/freepd/artwork/fpd-003',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    sourceUrl: 'https://freepd.com/corporate.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-03-05T00:00:00Z',
    bpm: 128,
    tags: ['business', 'presentation', 'positive', 'corporate'],
  },
  {
    id: 'fpd-004',
    title: 'Dark Suspense',
    artist: 'Kevin MacLeod',
    artistId: 'freepd-artist-kevin-macleod',
    genre: 'horror',
    duration: 198,
    moods: ['dark', 'mysterious', 'intense'],
    instrumentProfile: 'orchestral',
    artworkUrl: '/api/freepd/artwork/fpd-004',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    sourceUrl: 'https://freepd.com/horror.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-01-20T00:00:00Z',
    bpm: 90,
    tags: ['suspense', 'thriller', 'scary', 'cinematic'],
  },
  {
    id: 'fpd-005',
    title: 'Electronic Dreams',
    artist: 'Purrple Cat',
    artistId: 'freepd-artist-purrple-cat',
    genre: 'electronic',
    duration: 212,
    moods: ['energetic', 'uplifting', 'happy'],
    instrumentProfile: 'electronic',
    artworkUrl: '/api/freepd/artwork/fpd-005',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
    sourceUrl: 'https://freepd.com/electronic.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-04-01T00:00:00Z',
    bpm: 140,
    tags: ['edm', 'synthwave', 'retro', 'futuristic'],
  },
  {
    id: 'fpd-006',
    title: 'Romantic Piano',
    artist: 'Scott Buckley',
    artistId: 'freepd-artist-scott-buckley',
    genre: 'romantic',
    duration: 267,
    moods: ['calm', 'peaceful', 'sad'],
    instrumentProfile: 'piano',
    artworkUrl: '/api/freepd/artwork/fpd-006',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
    sourceUrl: 'https://freepd.com/romantic.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-02-14T00:00:00Z',
    bpm: 60,
    tags: ['piano', 'emotional', 'love', 'classical'],
  },
  {
    id: 'fpd-007',
    title: 'World Adventure',
    artist: 'Alexander Nakarada',
    artistId: 'freepd-artist-alexander-nakarada',
    genre: 'world',
    duration: 234,
    moods: ['energetic', 'uplifting', 'playful'],
    instrumentProfile: 'acoustic',
    artworkUrl: '/api/freepd/artwork/fpd-007',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3',
    sourceUrl: 'https://freepd.com/world.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-03-15T00:00:00Z',
    bpm: 110,
    tags: ['travel', 'cultural', 'ethnic', 'adventure'],
  },
  {
    id: 'fpd-008',
    title: 'Comedy Cartoon',
    artist: 'Kevin MacLeod',
    artistId: 'freepd-artist-kevin-macleod',
    genre: 'comedy',
    duration: 145,
    moods: ['happy', 'playful', 'energetic'],
    instrumentProfile: 'acoustic',
    artworkUrl: '/api/freepd/artwork/fpd-008',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    sourceUrl: 'https://freepd.com/comedy.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-01-25T00:00:00Z',
    bpm: 135,
    tags: ['funny', 'cartoon', 'kids', 'lighthearted'],
  },
  {
    id: 'fpd-009',
    title: 'Action Hero',
    artist: 'Alexander Nakarada',
    artistId: 'freepd-artist-alexander-nakarada',
    genre: 'action',
    duration: 178,
    moods: ['intense', 'energetic', 'uplifting'],
    instrumentProfile: 'hybrid',
    artworkUrl: '/api/freepd/artwork/fpd-009',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
    sourceUrl: 'https://freepd.com/action.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-04-10T00:00:00Z',
    bpm: 145,
    tags: ['sports', 'gaming', 'trailer', 'powerful'],
  },
  {
    id: 'fpd-010',
    title: 'Dramatic Tension',
    artist: 'Scott Buckley',
    artistId: 'freepd-artist-scott-buckley',
    genre: 'dramatic',
    duration: 223,
    moods: ['intense', 'dark', 'mysterious'],
    instrumentProfile: 'orchestral',
    artworkUrl: '/api/freepd/artwork/fpd-010',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3',
    sourceUrl: 'https://freepd.com/dramatic.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-02-28T00:00:00Z',
    bpm: 85,
    tags: ['film', 'documentary', 'emotional', 'cinematic'],
  },
  {
    id: 'fpd-011',
    title: 'Upbeat Happy',
    artist: 'Purrple Cat',
    artistId: 'freepd-artist-purrple-cat',
    genre: 'upbeat',
    duration: 167,
    moods: ['happy', 'energetic', 'playful'],
    instrumentProfile: 'acoustic',
    artworkUrl: '/api/freepd/artwork/fpd-011',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3',
    sourceUrl: 'https://freepd.com/upbeat.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-03-20T00:00:00Z',
    bpm: 125,
    tags: ['cheerful', 'bright', 'positive', 'summer'],
  },
  {
    id: 'fpd-012',
    title: 'Holiday Cheer',
    artist: 'Kevin MacLeod',
    artistId: 'freepd-artist-kevin-macleod',
    genre: 'holiday',
    duration: 189,
    moods: ['happy', 'uplifting', 'playful'],
    instrumentProfile: 'orchestral',
    artworkUrl: '/api/freepd/artwork/fpd-012',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3',
    sourceUrl: 'https://freepd.com/holiday.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-01-01T00:00:00Z',
    bpm: 100,
    tags: ['christmas', 'festive', 'celebration', 'winter'],
  },
  {
    id: 'fpd-013',
    title: 'Children Play',
    artist: 'Purrple Cat',
    artistId: 'freepd-artist-purrple-cat',
    genre: 'children',
    duration: 134,
    moods: ['happy', 'playful', 'uplifting'],
    instrumentProfile: 'acoustic',
    artworkUrl: '/api/freepd/artwork/fpd-013',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3',
    sourceUrl: 'https://freepd.com/children.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-04-05T00:00:00Z',
    bpm: 115,
    tags: ['kids', 'fun', 'cute', 'family'],
  },
  {
    id: 'fpd-014',
    title: 'Acoustic Guitar Journey',
    artist: 'Scott Buckley',
    artistId: 'freepd-artist-scott-buckley',
    genre: 'other',
    duration: 256,
    moods: ['calm', 'peaceful', 'uplifting'],
    instrumentProfile: 'guitar',
    artworkUrl: '/api/freepd/artwork/fpd-014',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3',
    sourceUrl: 'https://freepd.com/other.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-03-10T00:00:00Z',
    bpm: 80,
    tags: ['guitar', 'folk', 'indie', 'chill'],
  },
  {
    id: 'fpd-015',
    title: 'Deep Space Ambient',
    artist: 'Alexander Nakarada',
    artistId: 'freepd-artist-alexander-nakarada',
    genre: 'ambient',
    duration: 312,
    moods: ['calm', 'mysterious', 'peaceful'],
    instrumentProfile: 'electronic',
    artworkUrl: '/api/freepd/artwork/fpd-015',
    audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3',
    sourceUrl: 'https://freepd.com/ambient.php',
    downloadable: true,
    source: 'freepd',
    addedAt: '2024-02-20T00:00:00Z',
    bpm: 65,
    tags: ['space', 'sci-fi', 'atmospheric', 'drone'],
  },
];

/**
 * In-memory catalog cache
 * In production, this would be stored in a database
 */
let catalogCache: FreePDCatalog | null = null;
let lastCatalogUpdate: Date | null = null;

/**
 * Calculate genre counts from a list of tracks
 */
function calculateGenreCounts(tracks: FreePDTrack[]): Record<FreePDGenre, number> {
  const counts: Record<FreePDGenre, number> = {
    epic: 0,
    upbeat: 0,
    romantic: 0,
    horror: 0,
    world: 0,
    comedy: 0,
    electronic: 0,
    ambient: 0,
    action: 0,
    dramatic: 0,
    corporate: 0,
    children: 0,
    holiday: 0,
    other: 0,
  };

  for (const track of tracks) {
    counts[track.genre]++;
  }

  return counts;
}

/**
 * Normalize a track title by cleaning up formatting
 */
export function normalizeTrackTitle(title: string): string {
  return title
    .trim()
    // Replace underscores with spaces
    .replace(/_/g, ' ')
    // Remove file extensions
    .replace(/\.(mp3|wav|ogg|flac)$/i, '')
    // Capitalize words
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Set default values for a track
 */
export function setTrackDefaults(partial: Partial<FreePDTrack>): FreePDTrack {
  const id = partial.id || `fpd-${Date.now()}`;
  return {
    id,
    title: partial.title || 'Unknown Track',
    artist: partial.artist || 'Unknown Artist',
    artistId: partial.artistId || `freepd-artist-unknown`,
    genre: partial.genre || 'other',
    duration: partial.duration || 180, // Default 3 minutes
    moods: partial.moods || ['calm'],
    instrumentProfile: partial.instrumentProfile || 'acoustic',
    artworkUrl: partial.artworkUrl || `/api/freepd/artwork/${id}`,
    audioUrl: partial.audioUrl || '',
    sourceUrl: partial.sourceUrl || 'https://freepd.com',
    downloadable: true,
    source: 'freepd',
    addedAt: partial.addedAt || new Date().toISOString(),
    bpm: partial.bpm,
    tags: partial.tags || [],
  };
}

/**
 * Calculate duration from audio file
 * Placeholder for now - returns estimated duration
 */
export function calculateDuration(_audioUrl: string): number {
  // In production, this would fetch the audio file and calculate actual duration
  // For now, return a placeholder value based on typical track lengths
  return Math.floor(Math.random() * 180) + 120; // 2-5 minutes
}

/**
 * Generate artwork placeholder URL for a track
 */
export function generateArtworkUrl(trackId: string): string {
  return `/api/freepd/artwork/${trackId}`;
}

/**
 * Fetch the FreePD catalog
 * Currently returns mock data; in production would scrape/fetch from FreePD
 */
export async function fetchFreePDCatalog(): Promise<FreePDCatalog> {
  // Check cache (5 minute TTL)
  if (catalogCache && lastCatalogUpdate) {
    const cacheAge = Date.now() - lastCatalogUpdate.getTime();
    if (cacheAge < 5 * 60 * 1000) {
      return catalogCache;
    }
  }

  // In production, this would:
  // 1. Fetch the FreePD website pages
  // 2. Parse the HTML to extract track information
  // 3. Download metadata for each track
  // 4. Store in database

  const catalog: FreePDCatalog = {
    tracks: mockFreePDTracks,
    totalTracks: mockFreePDTracks.length,
    genreCounts: calculateGenreCounts(mockFreePDTracks),
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
export async function getFreePDTrack(trackId: string): Promise<FreePDTrack | null> {
  const catalog = await fetchFreePDCatalog();
  return catalog.tracks.find((track) => track.id === trackId) || null;
}

/**
 * Get paginated tracks with optional filters
 */
export async function getFreePDTracks(
  params: FreePDSearchParams & FreePDPaginationParams = {}
): Promise<FreePDPaginatedResponse> {
  const catalog = await fetchFreePDCatalog();
  let tracks = [...catalog.tracks];

  // Apply filters
  if (params.genre) {
    tracks = tracks.filter((t) => t.genre === params.genre);
  }

  if (params.moods && params.moods.length > 0) {
    tracks = tracks.filter((t) => t.moods.some((m) => params.moods?.includes(m)));
  }

  if (params.instrumentProfile) {
    tracks = tracks.filter((t) => t.instrumentProfile === params.instrumentProfile);
  }

  if (params.minDuration !== undefined) {
    tracks = tracks.filter((t) => t.duration >= params.minDuration!);
  }

  if (params.maxDuration !== undefined) {
    tracks = tracks.filter((t) => t.duration <= params.maxDuration!);
  }

  if (params.minBpm !== undefined) {
    tracks = tracks.filter((t) => t.bpm !== undefined && t.bpm >= params.minBpm!);
  }

  if (params.maxBpm !== undefined) {
    tracks = tracks.filter((t) => t.bpm !== undefined && t.bpm <= params.maxBpm!);
  }

  if (params.tags && params.tags.length > 0) {
    tracks = tracks.filter((t) => t.tags.some((tag) => params.tags?.includes(tag)));
  }

  if (params.query) {
    const query = params.query.toLowerCase();
    tracks = tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        t.artist.toLowerCase().includes(query) ||
        t.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  }

  // Apply sorting
  const sortBy = params.sortBy || 'title';
  const sortOrder = params.sortOrder || 'asc';

  tracks.sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'artist':
        comparison = a.artist.localeCompare(b.artist);
        break;
      case 'duration':
        comparison = a.duration - b.duration;
        break;
      case 'addedAt':
        comparison = new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Apply pagination
  const page = params.page || 1;
  const limit = Math.min(params.limit || 20, 100); // Max 100 per page
  const total = tracks.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;

  const paginatedTracks = tracks.slice(offset, offset + limit);

  return {
    tracks: paginatedTracks,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/**
 * Search FreePD tracks
 */
export async function searchFreePDTracks(
  query: string,
  filters: FreePDSearchParams = {}
): Promise<FreePDPaginatedResponse> {
  return getFreePDTracks({ ...filters, query });
}

/**
 * Refresh the FreePD catalog
 * In production, this would scrape/fetch fresh data from FreePD
 */
export async function refreshFreePDCatalog(): Promise<FreePDImportResult> {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  try {
    // Clear cache to force refresh
    catalogCache = null;
    lastCatalogUpdate = null;

    // Fetch fresh catalog
    const catalog = await fetchFreePDCatalog();

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    return {
      success: true,
      tracksImported: catalog.totalTracks,
      tracksUpdated: 0,
      tracksFailed: 0,
      errors: [],
      startedAt,
      completedAt,
      durationMs,
    };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    return {
      success: false,
      tracksImported: 0,
      tracksUpdated: 0,
      tracksFailed: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      startedAt,
      completedAt,
      durationMs,
    };
  }
}

/**
 * Convert a FreePD track to VYBE format
 */
export function toVYBEFormat(track: FreePDTrack): VYBEFreePDTrack {
  return {
    id: `freepd-${track.id}`,
    title: track.title,
    artist: track.artist,
    artistId: track.artistId,
    album: `FreePD ${track.genre.charAt(0).toUpperCase() + track.genre.slice(1)}`,
    albumId: `freepd-${track.genre}`,
    artwork: track.artworkUrl,
    duration: track.duration,
    isLiked: false,
    source: 'freepd',
    freepdId: track.id,
    freepdUrl: track.sourceUrl,
    audioUrl: track.audioUrl,
    downloadable: true,
    downloadUrl: track.audioUrl,
    genre: track.genre,
    moods: track.moods,
  };
}

/**
 * Generate a placeholder SVG artwork for a track
 */
export function generatePlaceholderArtwork(
  trackId: string,
  genre: FreePDGenre = 'other',
  title: string = 'Track'
): string {
  // Color schemes for different genres
  const colorSchemes: Record<FreePDGenre, { bg: string; fg: string; accent: string }> = {
    epic: { bg: '#1a1a2e', fg: '#e94560', accent: '#16213e' },
    upbeat: { bg: '#f9ed69', fg: '#f08a5d', accent: '#b83b5e' },
    romantic: { bg: '#f8b500', fg: '#ff006e', accent: '#8338ec' },
    horror: { bg: '#1a1a2e', fg: '#950740', accent: '#6a040f' },
    world: { bg: '#2d6a4f', fg: '#95d5b2', accent: '#1b4332' },
    comedy: { bg: '#ffd166', fg: '#ef476f', accent: '#06d6a0' },
    electronic: { bg: '#240046', fg: '#7b2cbf', accent: '#e0aaff' },
    ambient: { bg: '#023e8a', fg: '#48cae4', accent: '#0077b6' },
    action: { bg: '#d62828', fg: '#f77f00', accent: '#003049' },
    dramatic: { bg: '#2b2d42', fg: '#8d99ae', accent: '#ef233c' },
    corporate: { bg: '#003049', fg: '#669bbc', accent: '#c1121f' },
    children: { bg: '#ffafcc', fg: '#a2d2ff', accent: '#bde0fe' },
    holiday: { bg: '#0b3d0b', fg: '#ff0000', accent: '#ffd700' },
    other: { bg: '#4a4e69', fg: '#9a8c98', accent: '#c9ada7' },
  };

  const colors = colorSchemes[genre] || colorSchemes.other;
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
      <feGaussianBlur stdDeviation="3.5" result="coloredBlur"/>
      <feMerge>
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="500" height="500" fill="url(#grad-${trackId})"/>
  <circle cx="250" cy="200" r="80" fill="${colors.fg}" opacity="0.3"/>
  <circle cx="250" cy="200" r="60" fill="${colors.fg}" opacity="0.5"/>
  <circle cx="250" cy="200" r="40" fill="${colors.fg}" opacity="0.8"/>
  <text x="250" y="210" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle" filter="url(#glow-${trackId})">${initials}</text>
  <text x="250" y="350" font-family="Arial, sans-serif" font-size="24" fill="${colors.fg}" text-anchor="middle" opacity="0.9">FreePD</text>
  <text x="250" y="380" font-family="Arial, sans-serif" font-size="16" fill="${colors.fg}" text-anchor="middle" opacity="0.7">${genre.toUpperCase()}</text>
  <g opacity="0.3">
    <rect x="100" y="420" width="8" height="40" fill="${colors.fg}"/>
    <rect x="120" y="400" width="8" height="60" fill="${colors.fg}"/>
    <rect x="140" y="430" width="8" height="30" fill="${colors.fg}"/>
    <rect x="160" y="410" width="8" height="50" fill="${colors.fg}"/>
    <rect x="180" y="390" width="8" height="70" fill="${colors.fg}"/>
    <rect x="200" y="420" width="8" height="40" fill="${colors.fg}"/>
    <rect x="220" y="400" width="8" height="60" fill="${colors.fg}"/>
    <rect x="240" y="380" width="8" height="80" fill="${colors.fg}"/>
    <rect x="260" y="400" width="8" height="60" fill="${colors.fg}"/>
    <rect x="280" y="420" width="8" height="40" fill="${colors.fg}"/>
    <rect x="300" y="390" width="8" height="70" fill="${colors.fg}"/>
    <rect x="320" y="410" width="8" height="50" fill="${colors.fg}"/>
    <rect x="340" y="430" width="8" height="30" fill="${colors.fg}"/>
    <rect x="360" y="400" width="8" height="60" fill="${colors.fg}"/>
    <rect x="380" y="420" width="8" height="40" fill="${colors.fg}"/>
  </g>
</svg>`;
}

/**
 * Get all available genres
 */
export function getAvailableGenres(): FreePDGenre[] {
  return [
    'epic',
    'upbeat',
    'romantic',
    'horror',
    'world',
    'comedy',
    'electronic',
    'ambient',
    'action',
    'dramatic',
    'corporate',
    'children',
    'holiday',
    'other',
  ];
}

/**
 * Get all available moods
 */
export function getAvailableMoods(): FreePDMood[] {
  return [
    'happy',
    'sad',
    'energetic',
    'calm',
    'intense',
    'mysterious',
    'uplifting',
    'dark',
    'playful',
    'peaceful',
  ];
}

/**
 * Get all available instrument profiles
 */
export function getAvailableInstrumentProfiles(): FreePDInstrumentProfile[] {
  return ['orchestral', 'electronic', 'acoustic', 'hybrid', 'piano', 'guitar'];
}
