import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openNowPlayingSheet } from '@/lib/openNowPlayingSheet';
import { Airplay } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { usePlaybackController } from '@/stores/playbackController';

/**
 * Floating AirPlay pill — appears in the top-right of every screen whenever
 * AirPlay is connected AND there is a current track. Tapping it opens the
 * full Now Playing screen. This is the "stay on your current screen while
 * AirPlay plays in the background" affordance (mirrors Spotify's behavior).
 */
export function AirPlayPill() {
  const insets = useSafeAreaInsets();
  const isAirPlayConnected = usePlaybackController(s => s.isAirPlayConnected);
  const currentTrack = usePlaybackController(s => s.currentTrack);

  if (!isAirPlayConnected || !currentTrack) return null;

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        openNowPlayingSheet();
      }}
      style={{
        position: 'absolute',
        top: insets.top + 6,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(20,20,20,0.92)',
        borderRadius: 22,
        paddingLeft: 4,
        paddingRight: 12,
        paddingVertical: 4,
        maxWidth: 240,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        zIndex: 250000,
        elevation: 250000,
      }}
    >
      {currentTrack.artwork ? (
        <Image
          source={{ uri: currentTrack.artwork }}
          style={{ width: 32, height: 32, borderRadius: 16 }}
          contentFit="cover"
        />
      ) : (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#2a2a2a' }} />
      )}
      <View style={{ marginLeft: 8, flexShrink: 1 }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
          {currentTrack.title}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
          <Airplay size={10} color="#4FC3F7" />
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10, marginLeft: 4 }} numberOfLines={1}>
            AirPlay
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
