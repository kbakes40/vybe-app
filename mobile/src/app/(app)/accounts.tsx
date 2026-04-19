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
import { clearSessionBearerToken } from '@/lib/auth/sessionBearer';
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
  // Canonical Apple logo glyph (no visible join seams / artifacts).
  return (
    <IconBadge bg="#000">
      <Svg width={22} height={22} viewBox="0 0 170 170">
        <Path
          fill="#fff"
          d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.197-2.12-9.973-3.17-14.34-3.17-4.58 0-9.492 1.05-14.746 3.17-5.262 2.13-9.501 3.24-12.742 3.35-4.929.21-9.842-1.96-14.746-6.52-3.13-2.73-7.045-7.41-11.735-14.04-5.032-7.08-9.169-15.29-12.41-24.65-3.471-10.11-5.211-19.9-5.211-29.378 0-10.857 2.346-20.221 7.045-28.068 3.693-6.303 8.606-11.275 14.755-14.925 6.149-3.65 12.794-5.51 19.948-5.629 3.915 0 9.049 1.211 15.429 3.591 6.362 2.388 10.447 3.599 12.235 3.599 1.337 0 5.875-1.416 13.57-4.239 7.275-2.618 13.415-3.702 18.445-3.275 13.627 1.1 23.862 6.473 30.674 16.153-12.185 7.384-18.212 17.731-18.093 31.002.109 10.338 3.858 18.94 11.215 25.774 3.333 3.164 7.055 5.609 11.195 7.347-.898 2.604-1.846 5.098-2.847 7.493zM119.31 7.31c0 8.103-2.96 15.67-8.86 22.67-7.12 8.321-15.732 13.129-25.071 12.369a25.207 25.207 0 0 1-.188-3.07c0-7.778 3.386-16.1 9.399-22.905 3.002-3.446 6.82-6.311 11.45-8.597 4.62-2.252 8.99-3.497 13.1-3.71.12 1.083.17 2.166.17 3.24z"
        />
      </Svg>
    </IconBadge>
  );
}

function GoogleGlyph() {
  // Google "G" logo — four canonical brand colors on white (padded viewBox
  // so the G doesn't crowd the badge edge).
  return (
    <IconBadge bg="#fff">
      <Svg width={22} height={22} viewBox="0 0 48 48">
        <Path
          fill="#4285F4"
          d="M47.532 24.552c0-1.634-.138-3.204-.395-4.711H24.48v8.918h12.928c-.558 2.998-2.253 5.54-4.806 7.245v6.025h7.773c4.547-4.188 7.157-10.358 7.157-17.477z"
        />
        <Path
          fill="#34A853"
          d="M24.48 48c6.48 0 11.918-2.148 15.89-5.83l-7.772-6.025c-2.155 1.444-4.912 2.296-8.118 2.296-6.245 0-11.535-4.216-13.427-9.88H3.07v6.225C7.007 42.63 14.875 48 24.48 48z"
        />
        <Path
          fill="#FBBC05"
          d="M11.053 28.561a14.364 14.364 0 0 1 0-9.12V13.216H3.07a23.97 23.97 0 0 0 0 21.568l7.983-6.223z"
        />
        <Path
          fill="#EA4335"
          d="M24.48 9.48c3.523 0 6.684 1.21 9.171 3.585l6.882-6.882C36.393 2.35 30.955 0 24.48 0 14.875 0 7.007 5.37 3.07 13.216l7.983 6.225c1.892-5.664 7.182-9.96 13.427-9.96z"
        />
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
            await authClient.signOut();
            await clearSessionBearerToken();
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
