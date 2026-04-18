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
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
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
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { VybePlusWordmark } from '@/components/VybePlusWordmark';

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
  /** Custom badge node (e.g. Vybe+ capsule) — takes precedence over `badge` text. */
  badgeSlot?: React.ReactNode;
  showDot?: boolean;
  onPress: () => void;
}

function MenuItem({ icon, label, badge, badgeColor = '#666', badgeSlot, showDot, onPress }: MenuItemProps) {
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
      {badgeSlot ? (
        badgeSlot
      ) : badge ? (
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

  // Animation values
  const sheetTranslateY = useSharedValue(SCREEN_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  // Store pending navigation route so we can navigate after modal closes
  const pendingRoute = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 200 });
      sheetTranslateY.value = withSpring(0, { damping: 20, stiffness: 200 });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 200 });
      sheetTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 250 });

      // Navigate after close animation
      if (pendingRoute.current) {
        const route = pendingRoute.current;
        pendingRoute.current = null;
        setTimeout(() => {
          router.push(route as never);
        }, 260);
      }
    }
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  const handleNavigate = (route: string) => {
    pendingRoute.current = route;
    onClose();
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
        style={[
          { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)' },
          backdropStyle,
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: '#121212',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingBottom: insets.bottom + 20,
            maxHeight: SCREEN_HEIGHT * 0.85,
          },
          sheetStyle,
        ]}
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
            <ProfileAvatar size={80} allowUpload />
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
              badgeSlot={tier === 'plus' ? <VybePlusWordmark variant="badgeCapsule" /> : undefined}
              badge={tier === 'plus' ? undefined : 'Free'}
              badgeColor="#666"
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
