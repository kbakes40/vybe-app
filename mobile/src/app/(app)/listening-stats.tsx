import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Music2, Headphones } from 'lucide-react-native';
import { VybeIcon } from '@/components/VybeIcon';
import { usePlaybackController } from '@/stores/playbackController';
import { useRecentsStore } from '@/stores/recentsStore';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { useUserPlaylistStore } from '@/stores/userPlaylistStore';
import { Track } from '@/types/music';

type StatsTab = 'tracks' | 'artists' | 'genres';

function formatMinutes(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

function TabButton({ label, isActive, onPress }: { label: string; isActive: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: isActive ? '#8B5CF6' : 'transparent' }}
    >
      <Text style={{ color: isActive ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SourceBar({ label, color, pct, icon }: { label: string; color: string; pct: number; icon: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {icon}
          <Text style={{ color: '#fff', fontWeight: '500', marginLeft: 10 }}>{label}</Text>
        </View>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{pct}%</Text>
      </View>
      <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color, borderRadius: 3 }} />
      </View>
    </View>
  );
}

export default function ListeningStatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatsTab>('tracks');

  const recentTracks = useRecentsStore(s => s.recentTracks);
  const downloads = useDownloadsStore(s => s.downloads);
  const likedTrackIds = usePlaybackController(s => s.likedTracks);
  const playlists = useUserPlaylistStore(s => s.playlists);

  // Overview numbers
  const totalSeconds = useMemo(
    () => recentTracks.reduce((sum, t) => sum + (t.duration ?? 0), 0),
    [recentTracks]
  );
  const uniqueArtistCount = useMemo(
    () => new Set(recentTracks.map(t => t.artist).filter(Boolean)).size,
    [recentTracks]
  );

  // Top tracks — most recent (recents are ordered newest first)
  const topTracks = recentTracks.slice(0, 20);

  // Top artists — ranked by how many tracks from them appear in recents + downloads
  const topArtists = useMemo(() => {
    const allTracks: Track[] = [...recentTracks, ...downloads];
    const map = new Map<string, { name: string; artwork?: string; count: number }>();
    for (const t of allTracks) {
      if (!t.artist) continue;
      const existing = map.get(t.artist);
      if (existing) {
        existing.count++;
        if (!existing.artwork && t.artwork) existing.artwork = t.artwork;
      } else {
        map.set(t.artist, { name: t.artist, artwork: t.artwork, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 15);
  }, [recentTracks, downloads]);

  // Top genres — from all tracks
  const topGenres = useMemo(() => {
    const allTracks: Track[] = [...recentTracks, ...downloads];
    const map = new Map<string, number>();
    for (const t of allTracks) {
      for (const g of t.genreTags ?? []) {
        map.set(g, (map.get(g) ?? 0) + 1);
      }
    }
    const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, n]) => s + n, 0);
    return entries.slice(0, 8).map(([name, count]) => ({
      name,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  }, [recentTracks, downloads]);

  // Source breakdown across recents + downloads
  const sourceSplit = useMemo(() => {
    const allTracks: Track[] = [...recentTracks, ...downloads];
    if (allTracks.length === 0) return null;
    const map: Record<string, number> = {};
    for (const t of allTracks) {
      const src = t.source ?? 'vybe';
      map[src] = (map[src] ?? 0) + 1;
    }
    const total = allTracks.length;
    return {
      vybe: Math.round(((map['vybe'] ?? 0) / total) * 100),
      soundcloud: Math.round(((map['soundcloud'] ?? 0) / total) * 100),
      youtube: Math.round(((map['youtube'] ?? 0) / total) * 100),
      youtube_music: Math.round(((map['youtube_music'] ?? 0) / total) * 100),
    };
  }, [recentTracks, downloads]);

  const hasData = recentTracks.length > 0 || downloads.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <LinearGradient colors={['#1a1a2e', '#0A0A0A']} style={{ paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 }}
          >
            <ChevronLeft size={28} color="#fff" />
          </Pressable>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', flex: 1, textAlign: 'center', marginRight: 32 }}>
            Listening Stats
          </Text>
        </View>
      </LinearGradient>

      {!hasData ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Headphones size={56} color="rgba(255,255,255,0.15)" />
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 17, fontWeight: '600', marginTop: 20 }}>
            No listening data yet
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 14, marginTop: 8, textAlign: 'center', lineHeight: 20 }}>
            Play some music and your stats will appear here
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Overview */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 24 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>
                {totalSeconds > 0 ? formatMinutes(totalSeconds) : '—'}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 4 }}>
                total listened
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>
                {uniqueArtistCount}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 4 }}>
                unique artists
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>
                {recentTracks.length}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 4 }}>
                tracks played
              </Text>
            </View>
          </View>

          {/* Library summary */}
          <View style={{ flexDirection: 'row', marginHorizontal: 16, marginBottom: 24, gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, padding: 14 }}>
              <Text style={{ color: '#8B5CF6', fontSize: 22, fontWeight: '800' }}>{downloads.length}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>downloaded</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, padding: 14 }}>
              <Text style={{ color: '#EC4899', fontSize: 22, fontWeight: '800' }}>{likedTrackIds.size}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>liked songs</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, padding: 14 }}>
              <Text style={{ color: '#3B82F6', fontSize: 22, fontWeight: '800' }}>{playlists.length}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 }}>playlists</Text>
            </View>
          </View>

          {/* Tabs */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', marginHorizontal: 16 }}>
            <TabButton label="Tracks" isActive={activeTab === 'tracks'} onPress={() => setActiveTab('tracks')} />
            <TabButton label="Artists" isActive={activeTab === 'artists'} onPress={() => setActiveTab('artists')} />
            <TabButton label="Genres" isActive={activeTab === 'genres'} onPress={() => setActiveTab('genres')} />
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            {/* Tracks tab */}
            {activeTab === 'tracks' && (
              <View>
                {topTracks.length === 0 ? (
                  <Text style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 32 }}>
                    No tracks played yet
                  </Text>
                ) : (
                  topTracks.map((track, i) => (
                    <View key={`${track.id}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 15, fontWeight: '700', width: 28 }}>
                        {i + 1}
                      </Text>
                      {track.artwork ? (
                        <Image source={{ uri: track.artwork }} style={{ width: 46, height: 46, borderRadius: 6 }} contentFit="cover" />
                      ) : (
                        <View style={{ width: 46, height: 46, borderRadius: 6, backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center' }}>
                          <Music2 size={20} color="rgba(255,255,255,0.3)" />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: '#fff', fontWeight: '500' }} numberOfLines={1}>{track.title}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }} numberOfLines={1}>{track.artist}</Text>
                      </View>
                      {track.duration ? (
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                          {formatMinutes(track.duration)}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Artists tab */}
            {activeTab === 'artists' && (
              <View>
                {topArtists.length === 0 ? (
                  <Text style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 32 }}>
                    No artist data yet
                  </Text>
                ) : (
                  topArtists.map((artist, i) => (
                    <View key={artist.name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 15, fontWeight: '700', width: 28 }}>
                        {i + 1}
                      </Text>
                      {artist.artwork ? (
                        <Image source={{ uri: artist.artwork }} style={{ width: 46, height: 46, borderRadius: 23 }} contentFit="cover" />
                      ) : (
                        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#282828', alignItems: 'center', justifyContent: 'center' }}>
                          <Music2 size={20} color="rgba(255,255,255,0.3)" />
                        </View>
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={{ color: '#fff', fontWeight: '500' }} numberOfLines={1}>{artist.name}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>
                          {artist.count} {artist.count === 1 ? 'track' : 'tracks'}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Genres tab */}
            {activeTab === 'genres' && (
              <View style={{ paddingTop: 8 }}>
                {topGenres.length === 0 ? (
                  <Text style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 32 }}>
                    No genre data yet
                  </Text>
                ) : (
                  topGenres.map(g => (
                    <View key={g.name} style={{ marginBottom: 16 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <Text style={{ color: '#fff', fontWeight: '500' }}>{g.name}</Text>
                        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>{g.pct}%</Text>
                      </View>
                      <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                        <View style={{ width: `${g.pct}%`, height: '100%', backgroundColor: '#8B5CF6', borderRadius: 3 }} />
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>

          {/* Source breakdown */}
          {sourceSplit && (
            <View style={{ marginTop: 24, marginHorizontal: 16 }}>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
                By Source
              </Text>
              <View style={{ backgroundColor: '#1A1A1A', borderRadius: 14, padding: 16 }}>
                {sourceSplit.vybe > 0 && (
                  <SourceBar
                    label="VYBE"
                    color="#8B5CF6"
                    pct={sourceSplit.vybe}
                    icon={<VybeIcon size={22} variant="primary" />}
                  />
                )}
                {sourceSplit.soundcloud > 0 && (
                  <SourceBar
                    label="SoundCloud"
                    color="#FF5500"
                    pct={sourceSplit.soundcloud}
                    icon={
                      <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: '#FF5500', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 8, fontWeight: '900' }}>SC</Text>
                      </View>
                    }
                  />
                )}
                {sourceSplit.youtube > 0 && (
                  <SourceBar
                    label="YouTube"
                    color="#FF0000"
                    pct={sourceSplit.youtube}
                    icon={
                      <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>▶</Text>
                      </View>
                    }
                  />
                )}
                {sourceSplit.youtube_music > 0 && (
                  <SourceBar
                    label="YouTube Music"
                    color="#FF0000"
                    pct={sourceSplit.youtube_music}
                    icon={
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900' }}>♪</Text>
                      </View>
                    }
                  />
                )}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
