import { useEffect, useCallback } from 'react';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import {
  configurePurchases,
  getCustomerInfo,
  isPremiumActive,
} from '@/lib/purchases';

const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');

// ── Hardcoded VIP whitelist (instant, no network) ─────────────────────────────
const VIP_EMAILS = new Set([
  'kevin.baker88@gmail.com',
  'kevin.baker88@me.com',
  'baker8804@icloud.com',
  'aaron.d.mrhs@gmail.com',
]);

// ── Remote VIP check (falls back gracefully) ──────────────────────────────────
async function checkRemoteVip(email: string): Promise<boolean> {
  if (!BACKEND_URL || !email) return false;
  try {
    const res = await fetch(
      `${BACKEND_URL}/api/vip/check?email=${encodeURIComponent(email)}`,
    );
    if (!res.ok) return false;
    const json = await res.json();
    return !!(json?.data?.isVip);
  } catch {
    return false;
  }
}

// ── Check order: hardcoded VIP → remote VIP → RevenueCat ──────────────────────
async function resolveSubscription(
  email: string | undefined,
  userId: string | undefined,
): Promise<'free' | 'plus'> {
  if (__DEV__) return 'plus';

  // 1. Hardcoded VIP — instant, no network
  if (email && VIP_EMAILS.has(email.toLowerCase())) {
    console.log('[Subscription] VIP (hardcoded):', email);
    return 'plus';
  }

  // 2. Remote VIP table
  if (email) {
    const isRemoteVip = await checkRemoteVip(email);
    if (isRemoteVip) {
      console.log('[Subscription] VIP (remote):', email);
      return 'plus';
    }
  }

  // 3. RevenueCat entitlement
  try {
    configurePurchases(userId);
    const info = await getCustomerInfo();
    if (info && isPremiumActive(info)) {
      console.log('[Subscription] Premium via RevenueCat');
      return 'plus';
    }
  } catch (e) {
    console.warn('[Subscription] RevenueCat check failed:', e);
  }

  return 'free';
}

/**
 * Hook that checks VIP whitelist first, then RevenueCat, and syncs
 * the result to the Zustand subscription store.
 *
 * Call once in a top-level component after the user is authenticated.
 *
 * Returns { isPro, refresh } so callers can force a re-check after
 * a purchase completes.
 */
export function useSubscription(user: { id?: string; email?: string } | null) {
  const tier = useSubscriptionStore(s => s.tier);
  const setTier = useSubscriptionStore(s => s.setTier);

  const refresh = useCallback(async () => {
    const resolved = await resolveSubscription(user?.email, user?.id);
    setTier(resolved);
  }, [user?.email, user?.id, setTier]);

  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user, refresh]);

  return {
    isPro: tier === 'plus',
    tier,
    refresh,
  };
}
