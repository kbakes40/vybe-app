import React from 'react';
import {
  View,
  Text,
  Pressable,
  Switch,
  Dimensions,
  ScrollView,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { VybeIcon } from '@/components/VybeIcon';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  SlideInDown,
  SlideOutDown,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import {
  UserPlus,
  Crown,
  Sparkles,
  BarChart3,
  Clock,
  Bell,
  Settings,
  X,
} from 'lucide-react-native';
import { useSubscriptionStore } from '@/stores/subscriptionStore';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ProfileMenuOverlayProps {
  visible: boolean;
  onClose: () => void;
  userName?: string;
  userImage?: string;
  userEmail?: string;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  badgeColor?: string;
  showDot?: boolean;
  onPress: () => void;
}

function MenuItem({ icon, label, badge, badgeColor = '#666', showDot, onPress }: MenuItemProps) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      className="flex-row items-center py-3.5 px-5"
      style={({ pressed }) => ({
        backgroundColor: pressed ? 'rgba(255,255,255,0.1)' : 'transparent',
      })}
    >
      <View className="w-8">{icon}</View>
      <Text className="text-white text-base font-medium flex-1 ml-3">{label}</Text>
      {badge ? (
        <View
          className="px-2.5 py-1 rounded-full"
          style={{ backgroundColor: badgeColor }}
        >
          <Text className="text-white text-xs font-semibold">{badge}</Text>
        </View>
      ) : null}
      {showDot ? (
        <View className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
      ) : null}
    </Pressable>
  );
}

export function ProfileMenuOverlay({
  visible,
  onClose,
  userName = '',
  userImage = '',
  userEmail = '',
}: ProfileMenuOverlayProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tier = useSubscriptionStore(s => s.tier);
  const [activityEnabled, setActivityEnabled] = React.useState(true);
  const [hasUpdates, setHasUpdates] = React.useState(true);

  const handleNavigate = (route: string) => {
    onClose();
    setTimeout(() => {
      router.push(route as never);
    }, 300);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Backdrop */}
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Menu Content */}
      <Animated.View
        entering={SlideInDown.springify().damping(20)}
        exiting={SlideOutDown.springify().damping(20)}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: '#121212',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingBottom: insets.bottom + 20,
          maxHeight: SCREEN_HEIGHT * 0.85,
        }}
      >
        {/* Handle bar */}
        <View className="items-center py-3">
          <View className="w-10 h-1 rounded-full bg-white/30" />
        </View>

        {/* Close button */}
        <Pressable
          onPress={onClose}
          className="absolute top-4 right-4 w-8 h-8 items-center justify-center"
          hitSlop={12}
        >
          <X size={20} color="rgba(255,255,255,0.6)" />
        </Pressable>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Profile Header */}
          <View className="flex-row items-center px-5 py-4">
            <VybeIcon size={80} backgroundColor="#2D1B69" />
            <View className="flex-1 ml-4">
              <Text className="text-white text-xl font-bold">{userName}</Text>
              <Pressable
                onPress={() => handleNavigate('/(app)/profile')}
                hitSlop={8}
              >
                <Text className="text-white/60 text-sm mt-1">View profile</Text>
              </Pressable>
            </View>
            <View className="items-center">
              <Text className="text-white/50 text-xs mb-1">Activity</Text>
              <Switch
                value={activityEnabled}
                onValueChange={setActivityEnabled}
                trackColor={{ false: '#3E3E3E', true: '#8B5CF6' }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {/* Divider */}
          <View className="h-px bg-white/10 mx-5 my-2" />

          {/* Menu Items */}
          <View className="pt-2">
            <MenuItem
              icon={<UserPlus size={22} color="#fff" />}
              label="Add account"
              onPress={() => handleNavigate('/(app)/accounts')}
            />
            <MenuItem
              icon={<Crown size={22} color={tier === 'plus' ? '#8B5CF6' : '#fff'} />}
              label="Your plan"
              badge={tier === 'plus' ? 'VYBE Plus' : 'Free'}
              badgeColor={tier === 'plus' ? '#8B5CF6' : '#666'}
              onPress={() => handleNavigate('/(app)/your-plan')}
            />
            <MenuItem
              icon={<Sparkles size={22} color="#fff" />}
              label="What's new"
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
            />
            <MenuItem
              icon={<BarChart3 size={22} color="#fff" />}
              label="Listening stats"
              onPress={() => handleNavigate('/(app)/listening-stats')}
            />
            <MenuItem
              icon={<Clock size={22} color="#fff" />}
              label="Recents"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            />
            <MenuItem
              icon={<Bell size={22} color="#fff" />}
              label="Your updates"
              showDot={hasUpdates}
              onPress={() => {
                setHasUpdates(false);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            />
            <MenuItem
              icon={<Settings size={22} color="#fff" />}
              label="Settings and privacy"
              onPress={() => handleNavigate('/(app)/settings')}
            />
          </View>

          {/* Bottom spacing */}
          <View className="h-6" />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
