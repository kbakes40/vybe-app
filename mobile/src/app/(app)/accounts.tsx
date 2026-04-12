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
} from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
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

function LoginRow({
  icon,
  label,
  onPress,
  textColor = '#fff',
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  textColor?: string;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 11,
            backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent',
          }}
        >
          {icon}
          <Text
            style={{
              color: textColor,
              fontWeight: '600',
              fontSize: 16,
              marginLeft: 13,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Icon badge components ─────────────────────────────────────────────────

function IconBadge({ bg, children }: { bg: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </View>
  );
}

function AppleGlyph() {
  return (
    <IconBadge bg="#000">
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path
          fill="#fff"
          d="M18.71 19.5c-.83 1.57-1.71 3.1-3.43 3.13-1.68.04-2.32-.85-4.26-.85-1.95 0-2.61.81-4.24.85-1.69.04-2.48-1.58-3.32-3.14C1.72 16.33.39 10.33 2.1 6.31c.86-2 2.8-3.27 4.87-3.31 1.62-.04 3.13.9 4.11.9.98 0 2.8-1.22 4.57-1.06.74.03 2.79.28 4.11 2.06-.1.06-2.39 1.37-2.43 4.11-.04 3.55 2.47 5.14 2.59 5.2-.1.34-.64 2.21-1.22 5.05zM13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.71.85-1.85 1.51-2.97 1.42-.11-1.15.48-2.35 1.07-3.11z"
        />
      </Svg>
    </IconBadge>
  );
}

function GoogleGlyph() {
  return (
    <IconBadge bg="#fff">
      <Svg width={22} height={22} viewBox="0 0 48 48">
        <Path fill="#EA4335" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
        <Path fill="#FBBC05" d="M4 24c0-3.217.805-6.252 2.224-8.891L2.043 11.76A19.911 19.911 0 0 0 4 24c0 3.101.67 6.041 1.87 8.692l4.197-3.233A11.94 11.94 0 0 1 8 24H4z" />
        <Path fill="#34A853" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
        <Path fill="#4285F4" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
      </Svg>
    </IconBadge>
  );
}

function EmailGlyph() {
  return (
    <IconBadge bg="#3B82F6">
      <Mail size={20} color="#fff" strokeWidth={2} />
    </IconBadge>
  );
}

function GuestGlyph() {
  return (
    <IconBadge bg="#3A3A3C">
      <UserRound size={20} color="rgba(255,255,255,0.85)" strokeWidth={2} />
    </IconBadge>
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
            <View style={{ backgroundColor: '#1C1C1E', borderRadius: 16, overflow: 'hidden' }}>
              <Text style={{ color: '#fff', fontWeight: '500', fontSize: 15, textAlign: 'center', paddingTop: 18, paddingBottom: 14 }}>
                Add Another Account
              </Text>

              <View style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.12)' }} />

              <LoginRow icon={<AppleGlyph />} label="Sign In with Apple" onPress={() => handleAddAccount('apple')} />
              <View style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 73 }} />
              <LoginRow icon={<GoogleGlyph />} label="Sign In with Google" onPress={() => handleAddAccount('google')} />
              <View style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 73 }} />
              <LoginRow icon={<EmailGlyph />} label="Sign In with Email" onPress={() => handleAddAccount('email')} />
              <View style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 73 }} />
              <LoginRow icon={<GuestGlyph />} label="Continue as Guest" onPress={() => handleAddAccount('guest')} />

              <View style={{ height: 0.5, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 2 }} />

              <Pressable
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowAddOptions(false);
                }}
              >
                {({ pressed }) => (
                  <View style={{
                    paddingHorizontal: 16,
                    paddingVertical: 18,
                    alignItems: 'center',
                    backgroundColor: pressed ? 'rgba(255,255,255,0.05)' : 'transparent',
                  }}>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '600' }}>
                      Cancel
                    </Text>
                  </View>
                )}
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
