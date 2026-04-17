import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { usePlaybackController } from '@/stores/playbackController';
import { tabScreenScrollBottomPad } from '@/constants/miniPlayer';
import { UserPlus, MessageCircle } from 'lucide-react-native';

interface AlertItem {
  id: string;
  name: string;
  action: string;
  time: string;
}

const MOCK_ALERTS: AlertItem[] = [
  { id: '1', name: 'CeCe Winans', action: 'released a new Vybe.', time: '2h ago' },
  { id: '2', name: 'Kirk Franklin', action: 'shared a playlist.', time: '3h ago' },
  { id: '3', name: 'David II', action: 'liked your playlist.', time: '5h ago' },
];

const MOCK_SHARED: AlertItem[] = [
  { id: 's1', name: 'The Woods', action: 'added 3 new tracks to Acoustic Soul.', time: '1h ago' },
  { id: 's2', name: 'Deep House Focus', action: 'liked by 12 others.', time: '2h ago' },
  { id: 's3', name: 'Indie Anthems', action: 'got liked by 21 others.', time: '4h ago' },
];

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12 }}>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{title}</Text>
      {subtitle ? <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 2 }}>{subtitle}</Text> : null}
    </View>
  );
}

function ActivityRow({ item }: { item: AlertItem }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '700' }}>{item.name.charAt(0)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 14 }}>
          <Text style={{ fontWeight: '700' }}>{item.name}</Text>{' '}{item.action}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 }}>{item.time}</Text>
      </View>
    </View>
  );
}

export default function SocialScreen() {
  const insets = useSafeAreaInsets();
  const currentTrack = usePlaybackController((s) => s.currentTrack);

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>Vybe Activity</Text>
        <Pressable
          onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center' }}
        >
          <UserPlus size={18} color="rgba(255,255,255,0.6)" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: tabScreenScrollBottomPad(insets.bottom, !!currentTrack) }} showsVerticalScrollIndicator={false}>
        <SectionHeader title="Vybe Alerts" subtitle="New & Noteworthy" />
        {MOCK_ALERTS.map(item => <ActivityRow key={item.id} item={item} />)}

        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 20, marginTop: 8 }} />

        <SectionHeader title="Shared Playlists" subtitle="Activity Feed" />
        {MOCK_SHARED.map(item => <ActivityRow key={item.id} item={item} />)}

        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 20, marginTop: 8 }} />

        <SectionHeader title="Social Interactions" />
        <View style={{ paddingHorizontal: 20, paddingVertical: 16, alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#1A1A1A', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <MessageCircle size={28} color="rgba(255,255,255,0.3)" />
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, textAlign: 'center' }}>
            Connect with friends to see{'\n'}social activity here
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
