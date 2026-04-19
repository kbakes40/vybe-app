import { create } from 'zustand';

export type DavinciLogLevel = 'info' | 'warn' | 'error';

export interface DavinciLine {
  id: string;
  ts: number;
  message: string;
  level: DavinciLogLevel;
}

const MAX_LINES = 280;

type DavinciState = {
  visible: boolean;
  lines: DavinciLine[];
  open: () => void;
  close: () => void;
  push: (message: string, level?: DavinciLogLevel) => void;
  clear: () => void;
};

export const useDavinciDynamicsStore = create<DavinciState>((set) => ({
  visible: false,
  lines: [],
  open: () => set({ visible: true }),
  close: () => set({ visible: false }),
  push: (message, level = 'info') => {
    const line: DavinciLine = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      ts: Date.now(),
      message,
      level,
    };
    set((s) => ({ lines: [...s.lines, line].slice(-MAX_LINES) }));
  },
  clear: () => set({ lines: [] }),
}));
