import { Platform } from 'react-native';

const IOS_KEY = (process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '').trim();
const ANDROID_KEY = (process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '').trim();

export const PREMIUM_ENTITLEMENT = 'premium';

let configured = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sdk(): any {
  return require('react-native-purchases').default;
}

function platformApiKey(): string {
  return Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
}

/** Real public SDK keys only — never configure with a placeholder (RevenueCat spams invalid-key errors). */
export function hasRevenueCatKey(): boolean {
  return platformApiKey().length > 0;
}

/**
 * Ensures RevenueCat is configured when `EXPO_PUBLIC_REVENUECAT_*_KEY` is set.
 * Safe to call repeatedly; optional `userId` triggers logIn when already configured.
 */
function ensurePurchasesConfigured(userId?: string): void {
  if (!hasRevenueCatKey()) return;
  if (configured) {
    if (userId) {
      sdk().logIn(userId).catch((e: any) => console.warn('[Purchases] logIn:', e.message));
    }
    return;
  }
  const apiKey = platformApiKey();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LOG_LEVEL } = require('react-native-purchases');
  sdk().setLogLevel(LOG_LEVEL.WARN);
  if (userId) {
    sdk().configure({ apiKey, appUserID: userId });
  } else {
    sdk().configure({ apiKey });
  }
  configured = true;
}

/** Call at app entry so nothing touches Purchases before configure (avoids “no singleton” warnings). */
export function bootstrapPurchases(): void {
  if (!hasRevenueCatKey()) {
    if (__DEV__) {
      console.log(
        '[Purchases] RevenueCat skipped — set EXPO_PUBLIC_REVENUECAT_IOS_KEY (public appl_… key) in mobile/.env to enable.'
      );
    }
    return;
  }
  ensurePurchasesConfigured();
}

export function configurePurchases(userId?: string): void {
  if (!hasRevenueCatKey()) return;
  ensurePurchasesConfigured(userId);
}

export function getCustomerInfo(): Promise<any> {
  if (!hasRevenueCatKey()) return Promise.resolve(null);
  ensurePurchasesConfigured();
  return sdk().getCustomerInfo().catch((e: any) => {
    console.warn('[Purchases] getCustomerInfo:', e.message);
    return null;
  });
}

export function isPremiumActive(info: any): boolean {
  if (__DEV__) return true;
  return !!(info?.entitlements?.active?.[PREMIUM_ENTITLEMENT]);
}

export function isLifetimePurchase(info: any): boolean {
  const entitlement = info?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
  return !!entitlement && !entitlement.willRenew;
}

export interface VybePackages {
  monthly: any | null;
  lifetime: any | null;
}

export async function getVybePackages(): Promise<VybePackages> {
  if (!hasRevenueCatKey()) return { monthly: null, lifetime: null };
  ensurePurchasesConfigured();
  try {
    const Purchases = sdk();
    if (!(await Purchases.isConfigured())) {
      return { monthly: null, lifetime: null };
    }
    const offerings = await Purchases.getOfferings();
    const current = offerings?.current;
    if (!current) return { monthly: null, lifetime: null };

    const monthly =
      current.monthly ??
      current.availablePackages?.find((p: any) =>
        p.packageType === 'MONTHLY' ||
        p.identifier?.toLowerCase().includes('monthly')
      ) ?? null;

    const lifetime =
      current.lifetime ??
      current.availablePackages?.find((p: any) =>
        p.packageType === 'LIFETIME' ||
        p.identifier?.toLowerCase().includes('lifetime')
      ) ?? null;

    return { monthly, lifetime };
  } catch (e: any) {
    console.warn('[Purchases] getOfferings:', e.message);
    return { monthly: null, lifetime: null };
  }
}

export function purchasePackage(pkg: any): Promise<any> {
  if (!hasRevenueCatKey()) {
    return Promise.reject(new Error('RevenueCat not configured'));
  }
  ensurePurchasesConfigured();
  return sdk().purchasePackage(pkg).then((result: any) => result.customerInfo);
}

export function restorePurchases(): Promise<any> {
  if (!hasRevenueCatKey()) {
    return Promise.reject(new Error('RevenueCat not configured'));
  }
  ensurePurchasesConfigured();
  return sdk().restorePurchases().then((result: any) => result.customerInfo);
}

// Legacy helpers kept for compatibility
export function getLifetimePackage(): Promise<any> {
  return getVybePackages().then(p => p.lifetime);
}

bootstrapPurchases();
