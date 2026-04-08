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
}

function LoginOptionButton({ icon, label, onPress, backgroundColor = 'rgba(255,255,255,0.1)' }: LoginOptionButtonProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      className="flex-row items-center justify-center py-4 px-6 rounded-full mb-3"
      style={({ pressed }) => ({
        backgroundColor: pressed ? 'rgba(255,255,255,0.15)' : backgroundColor,
      })}
    >
      {icon}
      <Text className="text-white font-semibold text-base ml-3">{label}</Text>
    </Pressable>
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
                icon={
                  <View className="w-5 h-5">
                    <Text style={{ fontSize: 20 }}>&#xF8FF;</Text>
                  </View>
                }
                label="Continue with Apple"
                onPress={() => handleAddAccount('apple')}
                backgroundColor="#fff"
              />

              <LoginOptionButton
                icon={
                  <View className="w-5 h-5 items-center justify-center">
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        backgroundColor: '#4285F4',
                      }}
                    />
                  </View>
                }
                label="Continue with Google"
                onPress={() => handleAddAccount('google')}
              />

              <LoginOptionButton
                icon={
                  <View className="w-5 h-5 rounded bg-white/20 items-center justify-center">
                    <Text className="text-white text-xs">@</Text>
                  </View>
                }
                label="Continue with Email"
                onPress={() => handleAddAccount('email')}
              />

              <LoginOptionButton
                icon={
                  <View className="w-5 h-5 rounded bg-white/10 items-center justify-center">
                    <Text className="text-white/60 text-xs">?</Text>
                  </View>
                }
                label="Continue as Guest"
                onPress={() => handleAddAccount('guest')}
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
