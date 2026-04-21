import { create } from 'zustand';
import {
  clearSubsonicSession,
  hasCredentials,
  pingServer,
  type PingResult,
} from '@/lib/subsonic/subsonicClient';

export type SubsonicStatus =
  | { kind: 'unknown' }
  | { kind: 'unconfigured' }
  | { kind: 'connecting' }
  | { kind: 'connected'; version: string; checkedAt: number }
  | { kind: 'offline'; reason: Exclude<PingResult & { ok: false }, { ok: true }>['reason']; message?: string; checkedAt: number };

interface SubsonicState {
  status: SubsonicStatus;
  /** Increment when user saves or clears on-device Navidrome credentials (refetch rails). */
  credentialsRevision: number;
  testConnection: () => Promise<void>;
  notifyNavidromeConfigChanged: () => void;
}

export const useSubsonicStore = create<SubsonicState>((set, get) => ({
  status: hasCredentials() ? { kind: 'unknown' } : { kind: 'unconfigured' },
  credentialsRevision: 0,

  notifyNavidromeConfigChanged: () => {
    clearSubsonicSession();
    set({
      credentialsRevision: get().credentialsRevision + 1,
      status: hasCredentials() ? { kind: 'unknown' } : { kind: 'unconfigured' },
    });
  },

  testConnection: async () => {
    if (!hasCredentials()) {
      set({ status: { kind: 'unconfigured' } });
      return;
    }
    if (get().status.kind === 'connecting') return;
    set({ status: { kind: 'connecting' } });
    const result = await pingServer();
    if (result.ok) {
      console.log(`[VAULT_STATUS]: ONLINE · Subsonic v${result.version}`);
      set({ status: { kind: 'connected', version: result.version, checkedAt: Date.now() } });
    } else if (result.reason === 'no-credentials') {
      console.log('[VAULT_STATUS]: UNCONFIGURED · add server in Library / Discover or set EXPO_PUBLIC_NAVIDROME_*');
      set({ status: { kind: 'unconfigured' } });
    } else {
      const detail = [result.reason, result.status, result.message].filter(Boolean).join(' · ');
      console.log(`[VAULT_STATUS]: OFFLINE · ${detail}`);
      set({
        status: {
          kind: 'offline',
          reason: result.reason,
          message: result.message,
          checkedAt: Date.now(),
        },
      });
    }
  },
}));
