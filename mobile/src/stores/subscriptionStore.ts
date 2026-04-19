import { create } from 'zustand';

interface SubscriptionState {
  tier: 'free' | 'plus';
  skipsRemaining: number;
  showPaywall: boolean;
  paywallTrigger: string | null;
  vipEmail: string | null;
  /** Interstitial ad / upsell sheet (free tier). */
  showAdBreak: boolean;

  setTier: (tier: 'free' | 'plus') => void;
  setSkipsRemaining: (count: number) => void;
  useSkip: () => boolean;
  openPaywall: (trigger: string) => void;
  closePaywall: () => void;
  dismissAd: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tier: __DEV__ ? 'plus' : 'free',
  skipsRemaining: 6,
  showPaywall: false,
  paywallTrigger: null,
  vipEmail: null,
  showAdBreak: false,

  setTier: (tier) => set({ tier }),

  setSkipsRemaining: (count) => set({ skipsRemaining: count }),

  useSkip: () => {
    if (__DEV__) return true;
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

  dismissAd: () => set({ showAdBreak: false }),
}));

/** Cached session email for VIP checks (set from app layout after session load). */
export function setVipEmail(email: string | null) {
  useSubscriptionStore.setState({ vipEmail: email });
}
