import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Crown, Settings, Smartphone, HelpCircle } from 'lucide-react-native';
import { Image } from 'expo-image';
import { authClient } from '@/lib/auth/auth-client';
import { clearSessionBearerToken } from '@/lib/auth/sessionBearer';
import { tabScreenContentContainerPaddingBottom } from '@/constants/Layout';
import { OLED_BLACK, MACHINED_CYAN, NAV_BAR_PURPLE } from '@/constants/machinedTheme';
import { ListDisclosureMark } from '@/components/account/ListDisclosureMark';

async function bulletproofSignOut(replace: (path: string) => void) {
  console.log('[signOut:profile] starting…');
  try {
    await authClient.signOut();
  } catch (e) {
    console.warn('[signOut:profile] backend failed:', e);
  }
  try {
    await clearSessionBearerToken();
  } catch (e) {
    console.warn('[signOut:profile] bearer clear failed:', e);
  }
  try {
    const SecureStore = await import('expo-secure-store');
    const KEYS = [
      'vybe.session_data',
      'vybe.session-token',
      'vybe.cookie',
      'vybe_api_session_bearer',
      'better-auth.session_data',
      'better-auth.session-token',
      'better-auth.cookie',
    ];
    await Promise.all(KEYS.map((k) => SecureStore.deleteItemAsync(k).catch(() => undefined)));
  } catch (e) {
    console.warn('[signOut:profile] secure-store purge failed:', e);
  }
  try {
    replace('/sign-in');
  } catch (e) {
    console.warn('[signOut:profile] nav failed:', e);
  }
}

function MenuItem({
  icon,
  label,
  onPress,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.menuRow,
        isLast && styles.menuRowLast,
        pressed && { backgroundColor: 'rgba(255,255,255,0.04)' },
      ]}
    >
      <View style={styles.menuRowInner}>
        <View style={styles.menuIcon}>{icon}</View>
        <Text style={styles.menuLabel} numberOfLines={2}>
          {label}
        </Text>
        <View style={styles.menuMark}>
          <ListDisclosureMark />
        </View>
      </View>
    </Pressable>
  );
}

export default function ProfileTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const avatarUrl = session?.user?.image ?? null;
  const displayName =
    session?.user?.name?.trim() ||
    session?.user?.email?.split('@')[0] ||
    'Vybe Listener';

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabScreenContentContainerPaddingBottom(insets.bottom) }}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustContentInsets={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top + 20 }]}>
          <Text style={styles.kicker}>ACCOUNT</Text>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarGlyph}>V</Text>
            </View>
          )}
          <Text style={styles.displayName} numberOfLines={1}>
            {displayName}
          </Text>
        </View>

        <View style={styles.menuCard}>
          <MenuItem
            icon={<Crown size={20} color={NAV_BAR_PURPLE} strokeWidth={2} />}
            label="Your Plan"
            onPress={() => router.push('/(app)/your-plan' as never)}
          />
          <MenuItem
            icon={<Settings size={20} color={NAV_BAR_PURPLE} strokeWidth={2} />}
            label="App Preferences"
            onPress={() => router.push('/(app)/settings' as never)}
          />
          <MenuItem
            icon={<Smartphone size={20} color={NAV_BAR_PURPLE} strokeWidth={2} />}
            label="Connected Devices"
            onPress={() => router.push('/(app)/accounts' as never)}
          />
          <MenuItem
            icon={<HelpCircle size={20} color={NAV_BAR_PURPLE} strokeWidth={2} />}
            label="Support"
            onPress={() => {}}
            isLast
          />
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 36 }}>
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              Alert.alert(
                'Sign Out',
                'Are you sure you want to sign out?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign Out',
                    style: 'destructive',
                    onPress: () => {
                      void bulletproofSignOut((p) => router.replace(p as never));
                    },
                  },
                ],
                { cancelable: true },
              );
            }}
            style={styles.signOutBtn}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: OLED_BLACK,
  },
  hero: {
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  kicker: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 3.5,
    marginBottom: 18,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: MACHINED_CYAN,
  },
  avatarPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarGlyph: {
    color: NAV_BAR_PURPLE,
    fontSize: 34,
    fontWeight: '900',
    ...Platform.select({ ios: { fontFamily: 'Georgia' }, default: {} }),
  },
  displayName: {
    marginTop: 14,
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  menuCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,255,255,0.22)',
    overflow: 'hidden',
    backgroundColor: OLED_BLACK,
    alignSelf: 'stretch',
  },
  menuRow: {
    paddingVertical: 14,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  menuRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    minHeight: 48,
    width: '100%',
  },
  menuRowLast: {
    borderBottomWidth: 0,
  },
  menuIcon: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  menuLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    minWidth: 0,
    marginRight: 10,
    letterSpacing: -0.2,
  },
  menuMark: {
    width: 24,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,255,255,0.35)',
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: OLED_BLACK,
  },
  signOutText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 16,
    fontWeight: '700',
  },
});
