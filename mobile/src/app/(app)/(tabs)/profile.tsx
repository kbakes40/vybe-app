import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Crown, Settings, Smartphone, HelpCircle, ChevronRight } from 'lucide-react-native';
import { authClient } from '@/lib/auth/auth-client';
import { usePlaybackController } from '@/stores/playbackController';
import { tabScreenScrollBottomPad } from '@/constants/miniPlayer';

function MenuItem({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 20 }}
    >
      <View style={{ width: 24, alignItems: 'center', marginRight: 16 }}>{icon}</View>
      <Text style={{ color: '#fff', fontSize: 16, flex: 1 }}>{label}</Text>
      <ChevronRight size={18} color="rgba(255,255,255,0.3)" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const currentTrack = usePlaybackController((s) => s.currentTrack);

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: tabScreenScrollBottomPad(insets.bottom, !!currentTrack) }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', paddingTop: insets.top + 24, paddingBottom: 32 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 24 }}>Account Settings</Text>
          <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 36 }}>V</Text>
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
          <MenuItem icon={<Crown size={20} color="#8B5CF6" />} label="Premium Subscription" onPress={() => router.push('/(app)/upgrade' as never)} />
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 60 }} />
          <MenuItem icon={<Settings size={20} color="rgba(255,255,255,0.6)" />} label="App Preferences" onPress={() => router.push('/(app)/settings' as never)} />
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 60 }} />
          <MenuItem icon={<Smartphone size={20} color="rgba(255,255,255,0.6)" />} label="Connected Devices" onPress={() => router.push('/(app)/accounts' as never)} />
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 60 }} />
          <MenuItem icon={<HelpCircle size={20} color="rgba(255,255,255,0.6)" />} label="Support" onPress={() => {}} />
        </View>

        <View style={{ paddingHorizontal: 20, paddingTop: 40 }}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); authClient.signOut(); }}
            style={{ backgroundColor: '#1A1A1A', borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '600' }}>Sign Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
