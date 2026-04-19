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

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  // Paywalls disabled: every user is treated as 'plus' regardless of build mode
  // or real subscription state. useSkip is unconditional; openPaywall is a no-op
  // so any stale caller can't surface the overlay. Flip `PAYWALLS_DISABLED` to
  // false (and restore the original branches below) to re-enable gating.
  tier: 'plus',
  skipsRemaining: 6,
  showPaywall: false,
  paywallTrigger: null,
  vipEmail: null,
  showAdBreak: false,

  setTier: (tier) => set({ tier }),

  setSkipsRemaining: (count) => set({ skipsRemaining: count }),

  useSkip: () => true,

  // Intentional no-ops while paywalls are disabled — keep the method signatures
  // so existing callers (UI gates, skip-limit hooks, etc.) don't throw.
  openPaywall: (_trigger) => {},

  closePaywall: () => set({ showPaywall: false, paywallTrigger: null }),

  dismissAd: () => set({ showAdBreak: false }),
}));

/** Cached session email for VIP checks (set from app layout after session load). */
export function setVipEmail(email: string | null) {
  useSubscriptionStore.setState({ vipEmail: email });
}
