import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { authClient } from '@/lib/auth/auth-client';
import { getPostAuthDestination } from '@/lib/auth/postAuthDestination';

/**
 * Cold-start entry: picks sign-in vs app vs onboarding so we never default
 * to the wrong stack screen (which caused repeat onboarding / thrash).
 */
export default function BootIndex() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const routedForKey = useRef<string | null>(null);
  const routeKey = isPending ? 'pending' : session?.user?.id ?? 'signed-out';

  useEffect(() => {
    if (isPending) return;
    if (routedForKey.current === routeKey) return;

    if (!session?.user) {
      routedForKey.current = routeKey;
      router.replace('/sign-in');
      return;
    }

    let cancelled = false;
    void getPostAuthDestination().then((dest) => {
      if (cancelled) return;
      if (routedForKey.current === routeKey) return;
      routedForKey.current = routeKey;
      router.replace(dest);
    });

    return () => {
      cancelled = true;
    };
  }, [isPending, routeKey, router, session?.user]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#67E8F9" />
    </View>
  );
}
