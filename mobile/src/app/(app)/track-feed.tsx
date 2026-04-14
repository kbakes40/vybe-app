import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Play, Cloud } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { usePlaybackController } from '@/stores/playbackController';
import { createMMKVCache, TTL } from '@/lib/mmkv-cache';
import { Track } from '@/types/music';
import { MINI_PLAYER_HEIGHT } from './_layout';

const discoverMMKV = createMMKVCache('vybe-discover');

// Same shapes Discover uses when writing the feeds.
interface PlaylistTrack {
  videoId: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
}
interface SCSearchTrack {
  trackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
  soundcloudUrl: string;
}

type FeedKind = 'ytm' | 'sc';

const META: Record<FeedKind, { title: string; subtitle: string; accent: string; mmkvKey: string }> = {
  ytm: { title: 'From YouTube Music', subtitle: 'Fresh tracks to explore', accent: '#FF0000', mmkvKey: 'ytmTracksFeed' },
  sc:  { title: 'From SoundCloud',   subtitle: 'Underground tracks waiting to be discovered', accent: '#FF5500', mmkvKey: 'scTracksFeed' },
};

export default function TrackFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kind } = useLocalSearchParams<{ kind?: FeedKind }>();
  const playTrack = usePlaybackController(s => s.playTrack);

  const feed = kind === 'sc' ? 'sc' : 'ytm';
  const meta = META[feed];

  const queue: Track[] = useMemo(() => {
    if (feed === 'ytm') {
      const list = discoverMMKV.get<PlaylistTrack[]>(meta.mmkvKey, TTL.GENRE)?.value ?? [];
      return list.map(x => ({
        id: `ytm-${x.videoId}`, title: x.title, artist: x.channelName,
        artistId: '', album: '', albumId: '',
        artwork: x.thumbnailUrl, duration: 0, isLiked: false,
        source: 'youtube_music' as const,
        youtubeMusicId: x.videoId, youtubeId: x.videoId, audioUrl: '',
      }));
    }
    const list = discoverMMKV.get<SCSearchTrack[]>(meta.mmkvKey, TTL.GENRE)?.value ?? [];
    return list.map(x => ({
      id: `sc-${x.trackId}`, title: x.title, artist: x.artist,
      artistId: '', album: '', albumId: '',
      artwork: x.artwork, duration: x.duration, isLiked: false,
      source: 'soundcloud' as const,
      soundcloudUrl: x.soundcloudUrl, audioUrl: '',
    }));
  }, [feed, meta.mmkvKey]);

  const playAll = () => {
    if (queue.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playTrack(queue[0], queue);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <ChevronLeft color="#fff" size={28} />
        </Pressable>
        <View style={{ marginLeft: 12, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 22, height: 22, borderRadius: feed === 'sc' ? 4 : 11, backgroundColor: meta.accent, alignItems: 'center', justifyContent: 'center' }}>
            {feed === 'sc' ? <Cloud size={12} color="#fff" /> : <Text style={{ color: '#fff', fontSize: 12 }}>♪</Text>}
          </View>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginLeft: 10 }}>{meta.title}</Text>
        </View>
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, paddingHorizontal: 20, marginBottom: 16 }}>{meta.subtitle}</Text>

      <Pressable
        onPress={playAll}
        style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: meta.accent, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
      >
        <Play color="#fff" size={18} fill="#fff" />
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', marginLeft: 8 }}>Play All</Text>
      </Pressable>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: MINI_PLAYER_HEIGHT + insets.bottom + 24 }}>
        {queue.map((t, idx) => (
          <Pressable
            key={t.id}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); playTrack(t, queue); }}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 10 }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.4)', width: 28, textAlign: 'center' }}>{idx + 1}</Text>
            <Image source={{ uri: t.artwork }} style={{ width: 48, height: 48, borderRadius: 6, marginRight: 12 }} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{t.title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }} numberOfLines={1}>{t.artist}</Text>
            </View>
          </Pressable>
        ))}
        {queue.length === 0 ? (
          <Text style={{ color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginTop: 40 }}>
            No tracks cached yet — open Discover to load them.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
