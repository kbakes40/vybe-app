import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import {
  ChevronLeft,
  Check,
  Plus,
  LogOut,
  Trash2,
  Mail,
  UserRound,
  Apple,
} from 'lucide-react-native';
import { authClient } from '@/lib/auth/auth-client';
import { useVybePopup } from '@/components/VybePopup';

// Mock accounts data
const MOCK_ACCOUNTS: Array<{ id: string; name: string; email: string; image: string; isCurrent: boolean }> = [];

interface AccountItemProps {
  account: typeof MOCK_ACCOUNTS[0];
  onPress: () => void;
  onRemove: () => void;
}

function AccountItem({ account, onPress, onRemove }: AccountItemProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="flex-row items-center py-4 px-5"
      style={({ pressed }) => ({
        backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent',
      })}
    >
      <Image
        source={{ uri: account.image }}
        style={{ width: 50, height: 50, borderRadius: 25 }}
        contentFit="cover"
      />
      <View className="flex-1 ml-4">
        <Text className="text-white font-semibold text-base">{account.name}</Text>
        <Text className="text-white/50 text-sm mt-0.5">{account.email}</Text>
      </View>
      {account.isCurrent ? (
        <View className="w-6 h-6 rounded-full bg-[#8B5CF6] items-center justify-center">
          <Check size={14} color="#fff" strokeWidth={3} />
        </View>
      ) : (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onRemove();
          }}
          className="w-8 h-8 items-center justify-center"
          hitSlop={8}
        >
          <Trash2 size={18} color="rgba(255,255,255,0.4)" />
        </Pressable>
      )}
    </Pressable>
  );
}

interface LoginOptionButtonProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
}

/**
 * A horizontal pill-style login/continue button with a left-aligned icon
 * slot sized to match Apple's and Google's own guidelines. Label is
 * visually centered across the whole row — the icon is absolutely
 * positioned so the text doesn't shift when icons differ in width.
 */
function LoginOptionButton({
  icon,
  label,
  onPress,
  backgroundColor = 'rgba(255,255,255,0.08)',
  textColor = '#fff',
  borderColor,
}: LoginOptionButtonProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 52,
        borderRadius: 14,
        marginBottom: 10,
        paddingHorizontal: 16,
        backgroundColor,
        borderWidth: borderColor ? 1 : 0,
        borderColor,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ position: 'absolute', left: 18 }}>{icon}</View>
      <Text
        style={{
          color: textColor,
          fontWeight: '600',
          fontSize: 15,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Brand glyph components ────────────────────────────────────────────────
// Inline SVG-free marks so we don't pull in another asset. Matches the
// Apple HIG "Continue with Apple" mark color and Google's "G" color block.

function AppleGlyph({ color = '#000' }: { color?: string }) {
  // lucide-react-native ships an Apple icon that already matches the
  // HIG-approved silhouette when filled.
  return <Apple size={20} color={color} fill={color} />;
}

function GoogleGlyph() {
  // Google's multi-color "G" mark inside a white circle. The four wedges
  // are absolutely positioned inside a 20x20 square so the mark reads
  // correctly without needing an SVG file.
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: '900',
          color: '#4285F4',
          lineHeight: 20,
          includeFontPadding: false,
        }}
      >
        G
      </Text>
    </View>
  );
}

export default function AccountsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const [accounts, setAccounts] = useState(MOCK_ACCOUNTS);
  const [showAddOptions, setShowAddOptions] = useState(false);

  const handleSwitchAccount = (accountId: string) => {
    setAccounts(prev => prev.map(acc => ({
      ...acc,
      isCurrent: acc.id === accountId,
    })));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleRemoveAccount = (accountId: string) => {
    const account = accounts.find(a => a.id === accountId);
    showVybePopup({
      title: 'Remove Account',
      message: `Are you sure you want to remove ${account?.name}?`,
      type: 'confirm',
      actions: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setAccounts(prev => prev.filter(a => a.id !== accountId));
          },
        },
      ]
    });
  };

  const handleSignOutAll = async () => {
    showVybePopup({
      title: 'Sign Out All',
      message: 'Are you sure you want to sign out of all accounts?',
      type: 'warning',
      actions: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out All',
          style: 'destructive',
          onPress: async () => {
            try {
              await authClient.signOut();
              router.replace('/sign-in');
            } catch (error) {
              console.error('Sign out error:', error);
            }
          },
        },
      ]
    });
  };

  const handleAddAccount = (method: string) => {
    setShowAddOptions(false);
    // Navigate to sign-in with the selected method
    router.push('/sign-in' as never);
  };

  return (
    <View className="flex-1 bg-[#0A0A0A]">
      {/* Header */}
      <LinearGradient
        colors={['#1a1a2e', '#0A0A0A']}
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center px-4 py-3">
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            className="w-10 h-10 items-center justify-center -ml-2"
          >
            <ChevronLeft size={28} color="#fff" />
          </Pressable>
          <Text className="text-white text-xl font-bold flex-1 text-center mr-8">
            Accounts
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Accounts List */}
        <View className="mt-4">
          <Text className="text-white/50 text-xs uppercase tracking-wider px-5 mb-3 font-medium">
            Signed In Accounts
          </Text>
          <View className="bg-[#1A1A1A] mx-4 rounded-xl overflow-hidden">
            {accounts.map((account, index) => (
              <View key={account.id}>
                <AccountItem
                  account={account}
                  onPress={() => handleSwitchAccount(account.id)}
                  onRemove={() => handleRemoveAccount(account.id)}
                />
                {index < accounts.length - 1 && (
                  <View className="h-px bg-white/10 ml-20" />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Add Account Section */}
        <View className="mt-8 px-4">
          {!showAddOptions ? (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowAddOptions(true);
              }}
              className="flex-row items-center justify-center py-4 bg-[#1A1A1A] rounded-xl"
            >
              <Plus size={22} color="#8B5CF6" />
              <Text className="text-[#8B5CF6] font-semibold text-base ml-2">
                Add Account
              </Text>
            </Pressable>
          ) : (
            <View className="bg-[#1A1A1A] rounded-xl p-5">
              <Text className="text-white font-semibold text-lg text-center mb-6">
                Add Another Account
              </Text>

              <LoginOptionButton
                icon={<AppleGlyph color="#000" />}
                label="Continue with Apple"
                onPress={() => handleAddAccount('apple')}
                backgroundColor="#fff"
                textColor="#000"
              />

              <LoginOptionButton
                icon={<GoogleGlyph />}
                label="Continue with Google"
                onPress={() => handleAddAccount('google')}
                backgroundColor="#fff"
                textColor="#000"
              />

              <LoginOptionButton
                icon={<Mail size={20} color="#fff" />}
                label="Continue with Email"
                onPress={() => handleAddAccount('email')}
                backgroundColor="rgba(255,255,255,0.08)"
                borderColor="rgba(255,255,255,0.12)"
              />

              <LoginOptionButton
                icon={<UserRound size={20} color="rgba(255,255,255,0.7)" />}
                label="Continue as Guest"
                onPress={() => handleAddAccount('guest')}
                backgroundColor="transparent"
                borderColor="rgba(255,255,255,0.15)"
                textColor="rgba(255,255,255,0.85)"
              />

              <Pressable
                onPress={() => setShowAddOptions(false)}
                className="py-3 mt-2"
              >
                <Text className="text-white/50 text-center">Cancel</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Sign Out All */}
        <View className="mt-8 px-4">
          <Pressable
            onPress={handleSignOutAll}
            className="flex-row items-center justify-center py-4 bg-[#1A1A1A] rounded-xl"
          >
            <LogOut size={20} color="#EF4444" />
            <Text className="text-[#EF4444] font-semibold text-base ml-2">
              Sign Out of All Accounts
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
