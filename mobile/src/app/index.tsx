import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { authClient } from '@/lib/auth/auth-client';
import { getPostAuthDestination } from '@/lib/auth/postAuthDestination';

/**
 * Cold-start entry — routes based on auth state. `setTimeout(… , 0)` defers
 * the navigation so the current `index` mount commits before `router.replace`
 * fires (prevents Expo Router thrash / boot loop).
 */
export default function BootIndex() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const routedForKey = useRef<string | null>(null);
  const routeKey = isPending ? 'pending' : session?.user?.id ?? 'signed-out';

  /**
   * RELEASE_UI_LOCK — Better Auth's `isPending` can hang indefinitely on
   * cold start (network blip, backend auth timeout). Escape hatch: if
   * we're still pending after 2s, assume signed-out and route to /sign-in
   * so the UI never sits on the black placeholder forever.
   */
  useEffect(() => {
    if (!isPending) return;
    const t = setTimeout(() => {
      if (routedForKey.current) return;
      routedForKey.current = 'timeout-fallback';
      router.replace('/sign-in');
    }, 2000);
    return () => clearTimeout(t);
  }, [isPending, router]);

  useEffect(() => {
    if (isPending) return;
    if (routedForKey.current === routeKey) return;

    if (!session?.user) {
      routedForKey.current = routeKey;
      setTimeout(() => router.replace('/sign-in'), 0);
      return;
    }

    let cancelled = false;
    void getPostAuthDestination()
      .then((dest) => {
        if (cancelled) return;
        if (routedForKey.current === routeKey) return;
        routedForKey.current = routeKey;
        setTimeout(() => router.replace(dest), 0);
      })
      .catch((e) => {
        console.warn('[BootIndex] getPostAuthDestination failed — defaulting to tabs', e);
        if (cancelled) return;
        if (routedForKey.current === routeKey) return;
        routedForKey.current = routeKey;
        setTimeout(() => router.replace('/(app)/(tabs)/discover'), 0);
      });

    return () => {
      cancelled = true;
    };
  }, [isPending, routeKey, router, session?.user]);

  return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
}
