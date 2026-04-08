import { Platform } from 'react-native';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
export const PREMIUM_ENTITLEMENT = 'premium';

let configured = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sdk(): any {
  return require('react-native-purchases').default;
}

function ensureConfigured(): void {
  if (configured) return;
  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LOG_LEVEL } = require('react-native-purchases');
  sdk().setLogLevel(LOG_LEVEL.WARN);
  sdk().configure({ apiKey });
  configured = true;
}

export function configurePurchases(userId?: string): void {
  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { LOG_LEVEL } = require('react-native-purchases');
  if (configured) {
    if (userId) sdk().logIn(userId).catch((e: any) => console.warn('[Purchases] logIn:', e.message));
    return;
  }
  sdk().setLogLevel(LOG_LEVEL.WARN);
  sdk().configure({ apiKey, appUserID: userId });
  configured = true;
}

export function getCustomerInfo(): Promise<any> {
  ensureConfigured();
  return sdk().getCustomerInfo().catch((e: any) => {
    console.warn('[Purchases] getCustomerInfo:', e.message);
    return null;
  });
}

export function isPremiumActive(info: any): boolean {
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
  ensureConfigured();
  try {
    const offerings = await sdk().getOfferings();
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
  ensureConfigured();
  return sdk().purchasePackage(pkg).then((result: any) => result.customerInfo);
}

export function restorePurchases(): Promise<any> {
  ensureConfigured();
  return sdk().restorePurchases().then((result: any) => result.customerInfo);
}

// Legacy helpers kept for compatibility
export function getLifetimePackage(): Promise<any> {
  return getVybePackages().then(p => p.lifetime);
}
