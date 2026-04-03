import { create } from 'zustand';
import { api } from '@/lib/api/api';

export interface TasteDNADimension {
  name: string;
  value: number;
  label: string;
}

export interface TasteDNAData {
  dimensions: TasteDNADimension[];
  topRhythms: { name: string; weight: number }[];
  topMoods: { name: string; weight: number }[];
  topEras: { name: string; weight: number }[];
  recentShifts: { label: string; direction: 'up' | 'down' }[];
  totalListens: number;
  totalCompletions: number;
  listeningSince: string | null;
}

// Mock data for when backend is unavailable
const mockTasteDNAData: TasteDNAData = {
  dimensions: [
    { name: 'Energy', value: 0.72, label: 'High' },
    { name: 'Tempo', value: 0.58, label: 'Mid-Fast' },
    { name: 'Mood', value: 0.65, label: 'Uplifting' },
    { name: 'Vocals', value: 0.45, label: 'Balanced' },
    { name: 'Acoustic', value: 0.32, label: 'Electronic' },
    { name: 'Complexity', value: 0.68, label: 'Intricate' },
  ],
  topRhythms: [
    { name: 'Four-on-the-floor', weight: 0.82 },
    { name: 'Syncopated', weight: 0.65 },
    { name: 'Breakbeat', weight: 0.48 },
    { name: 'Downtempo', weight: 0.35 },
  ],
  topMoods: [
    { name: 'Energetic', weight: 0.78 },
    { name: 'Dreamy', weight: 0.62 },
    { name: 'Nostalgic', weight: 0.55 },
    { name: 'Dark', weight: 0.42 },
    { name: 'Euphoric', weight: 0.38 },
  ],
  topEras: [
    { name: '2010s', weight: 0.45 },
    { name: '2020s', weight: 0.35 },
    { name: '2000s', weight: 0.15 },
    { name: '1990s', weight: 0.05 },
  ],
  recentShifts: [
    { label: 'More electronic', direction: 'up' },
    { label: 'Higher energy', direction: 'up' },
    { label: 'Less acoustic', direction: 'down' },
  ],
  totalListens: 847,
  totalCompletions: 623,
  listeningSince: '2024-06-15T00:00:00Z',
};

interface TasteDNAState {
  data: TasteDNAData | null;
  isLoading: boolean;
  error: string | null;

  fetchTasteDNA: () => Promise<void>;
}

export const useTasteDNAStore = create<TasteDNAState>((set) => ({
  data: null,
  isLoading: false,
  error: null,

  fetchTasteDNA: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get<TasteDNAData>('/api/discovery/taste-dna');
      if (data) {
        set({ data, isLoading: false });
        return;
      }
    } catch (error) {
      console.log('[TasteDNA] Backend unavailable, using mock data:', error);
    }

    // Fallback to mock data
    set({ data: mockTasteDNAData, isLoading: false });
  },
}));
