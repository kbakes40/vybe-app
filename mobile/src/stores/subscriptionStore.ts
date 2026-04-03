import { create } from 'zustand';

interface SubscriptionState {
  tier: 'free' | 'plus';
  skipsRemaining: number;
  showPaywall: boolean;
  paywallTrigger: string | null;

  setTier: (tier: 'free' | 'plus') => void;
  setSkipsRemaining: (count: number) => void;
  useSkip: () => boolean;
  openPaywall: (trigger: string) => void;
  closePaywall: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tier: 'free',
  skipsRemaining: 6,
  showPaywall: false,
  paywallTrigger: null,

  setTier: (tier) => set({ tier }),

  setSkipsRemaining: (count) => set({ skipsRemaining: count }),

  useSkip: () => {
    const { tier, skipsRemaining, openPaywall } = get();
    if (tier === 'plus') return true;
    if (skipsRemaining <= 0) {
      openPaywall('skip_limit');
      return false;
    }
    set({ skipsRemaining: skipsRemaining - 1 });
    return true;
  },

  openPaywall: (trigger) => set({ showPaywall: true, paywallTrigger: trigger }),

  closePaywall: () => set({ showPaywall: false, paywallTrigger: null }),
}));
