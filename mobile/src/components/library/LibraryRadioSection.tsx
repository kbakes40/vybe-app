/**
 * Library → Radio section.
 *
 * Renders each live station (Radio-Browser) as a full-width hero card that
 * matches the Liked Songs / Global Radio anatomy stacked above:
 *   [72pt artwork] [Title + subtitle] [54pt play button]
 *
 * Previously a horizontal 120pt rail; the hero stack reads as a first-class
 * "Radio" category in the library home instead of a rail you scroll past.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AudioWaveform,
  Guitar,
  Headphones,
  Heart,
  Mic2,
  Piano,
  Play,
  Radio,
  Speaker,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getTopStations,
  readTopStationsCache,
  type RadioStation,
} from '@/lib/radioBrowserService';
import { usePlaybackController } from '@/stores/playbackController';
import type { Track } from '@/types/music';
import { DOCK_CYAN } from '@/constants/machinedTheme';
import { GenreSaxophoneIcon } from '@/components/genre/GenreSaxophoneIcon';
import { GenreBroadcastTowerIcon } from '@/components/genre/GenreBroadcastTowerIcon';
import {
  buildGlobalRadioTrack,
  GLOBAL_RADIO_STATIONS,
  GLOBAL_RADIO_STATION_ORDER,
  GLOBAL_EXPANSION_STATION_ORDER,
  type GlobalRadioStationId,
} from '@/lib/GlobalRadioClient';

type IconComp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/**
 * Tag → icon map. Radio-Browser `tags` is a comma-joined string; the first
 * match in this table wins. Order matters — more specific genres appear
 * before broader umbrellas (e.g. `lofi` before `ambient`).
 */
const TAG_ICON_TABLE: Array<{ patterns: string[]; Icon: IconComp }> = [
  { patterns: ['jazz', 'smooth jazz', 'bebop', 'swing'], Icon: GenreSaxophoneIcon },
  { patterns: ['classical', 'orchestral', 'opera', 'baroque'], Icon: Piano },
  { patterns: ['hip hop', 'hip-hop', 'hiphop', 'rap', 'trap'], Icon: Mic2 },
  { patterns: ['r&b', 'rnb', 'soul', 'blues', 'motown', 'funk'], Icon: Heart },
  { patterns: ['rock', 'metal', 'punk', 'grunge', 'alternative'], Icon: Guitar },
  { patterns: ['country', 'folk', 'bluegrass', 'americana'], Icon: Guitar },
  { patterns: ['lofi', 'lo-fi', 'lo fi', 'chillhop'], Icon: Headphones },
  { patterns: ['ambient', 'chill', 'chillout', 'downtempo', 'meditation'], Icon: Headphones },
  { patterns: ['electronic', 'edm', 'techno', 'house', 'trance', 'dance', 'dubstep', 'drum and bass', 'dnb'], Icon: Speaker },
  { patterns: ['pop', 'top 40', 'top40', 'charts', 'hits'], Icon: AudioWaveform },
  { patterns: ['news', 'talk', 'sports', 'politics'], Icon: Mic2 },
  { patterns: ['latin', 'salsa', 'reggaeton', 'bachata', 'cumbia'], Icon: AudioWaveform },
  { patterns: ['reggae', 'dub', 'ska'], Icon: AudioWaveform },
  { patterns: ['christian', 'gospel', 'worship'], Icon: Radio },
];

function pickStationIcon(tags: string[]): IconComp {
  if (tags.length === 0) return GenreBroadcastTowerIcon;
  const haystack = tags.map((t) => t.toLowerCase());
  for (const row of TAG_ICON_TABLE) {
    for (const pat of row.patterns) {
      if (haystack.some((t) => t.includes(pat))) return row.Icon;
    }
  }
  return GenreBroadcastTowerIcon;
}

/**
 * Stations that are *meta-pills* or known-dead relays — never render these as
 * library cards. `global_hub` is the "GLOBAL" meta-pill on the Radio screen
 * (it points at the same dead `worldwidefm.out.airtime.pro` host and errors
 * -1003); `worldwide_fm` shares that same dead origin. Both are excluded so
 * taps in the library reliably produce playback instead of an error state.
 */
const CURATED_SKIP = new Set<GlobalRadioStationId>(['global_hub', 'worldwide_fm']);

/**
 * Curated Global-Radio stations that appear ABOVE the public Radio-Browser
 * list. Combines the main pill order (paradise, hip-hop, house, …) with the
 * GLOBAL expansion relays (NTS, FIP, HÖR). Deduped + filtered via
 * {@link CURATED_SKIP}.
 */
const CURATED_ORDER: GlobalRadioStationId[] = Array.from(
  new Set<GlobalRadioStationId>([
    ...GLOBAL_RADIO_STATION_ORDER,
    ...GLOBAL_EXPANSION_STATION_ORDER,
  ]),
).filter((id) => !CURATED_SKIP.has(id));

/** Library-friendly title case for each curated station. */
const CURATED_TITLE: Record<GlobalRadioStationId, string> = {
  paradise: 'Radio Paradise',
  hiphop: 'Hip-Hop',
  house: 'House',
  lofi: 'Lofi',
  country: 'Country',
  jazz: 'Jazz',
  jazz_secret: 'Jazz · Secret Agent',
  jazz_beat: 'Jazz · Beat Blender',
  ambient: 'Ambient',
  indie: 'Indie',
  vault_70s: '70s Vault',
  vault_80s: '80s Vault',
  vault_90s: '90s Vault',
  vault_00s: '00s Vault',
  vault_modern: 'Modern Vault',
  global_hub: 'Global Hub',
  worldwide_fm: 'Worldwide FM',
  nts_live: 'NTS Live',
  fip_radio: 'FIP',
  hor_berlin: 'HÖR Berlin',
};

/** Icon per curated station id — keeps each card visually distinct. */
function pickCuratedIcon(id: GlobalRadioStationId): IconComp {
  switch (id) {
    case 'paradise':
      return AudioWaveform;
    case 'hiphop':
      return Mic2;
    case 'house':
      return Speaker;
    case 'lofi':
      return Headphones;
    case 'country':
      return Guitar;
    case 'jazz':
    case 'jazz_secret':
    case 'jazz_beat':
      return GenreSaxophoneIcon;
    case 'ambient':
      return Headphones;
    case 'indie':
      return Guitar;
    case 'vault_70s':
    case 'vault_80s':
    case 'vault_90s':
    case 'vault_00s':
    case 'vault_modern':
      return Radio;
    case 'worldwide_fm':
    case 'nts_live':
    case 'fip_radio':
    case 'hor_berlin':
    case 'global_hub':
      return GenreBroadcastTowerIcon;
    default:
      return GenreBroadcastTowerIcon;
  }
}

/** Cap — each station is a ~110pt tall card, so keep the stack scannable. */
const STATION_LIMIT = 12;

function stationToTrack(station: RadioStation): Track {
  return {
    id: `radio-browser:${station.id}`,
    title: station.name,
    artist: station.country ? `LIVE · ${station.country}` : 'LIVE',
    artistId: '',
    album: 'LIVE RADIO',
    albumId: `radio-browser:${station.id}`,
    isLiked: false,
    artwork: station.faviconUrl ?? '',
    duration: 0,
    source: 'global_radio',
    audioUrl: station.streamUrl,
    globalRadioStationId: `rb:${station.id}`,
    globalRadioMetadataSource: 'static',
    globalRadioDiTag: station.name.toUpperCase(),
    globalRadioDiLeading: 'default',
    globalRadioFirePulse: 'normal',
    globalRadioIslandAlbum: `RADIO: ${station.name.toUpperCase()}`,
  };
}

export function LibraryRadioSection() {
  const [stations, setStations] = useState<RadioStation[]>(() => readTopStationsCache() ?? []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fresh = await getTopStations(STATION_LIMIT);
        if (!cancelled && Array.isArray(fresh)) setStations(fresh);
      } catch {
        // Best-effort — cached stations already render; no throw.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Unified queue: curated stations first, then the public Radio-Browser set.
   * Passing this into {@link PlaybackController.playTrack} means hitting
   * skip/prev walks the same list the user sees — e.g. tap "Paradise" → next
   * → "Hip-Hop" → next → "House" → … → first Radio-Browser station → …
   *
   * Memoized on `stations` so the array identity is stable as long as the
   * Radio-Browser list doesn't change; avoids rebuilding the queue on every
   * render (and thus keeps queue identity consistent for the playback store).
   */
  const radioQueue = useMemo<Track[]>(() => {
    const curated = CURATED_ORDER.map((id) => buildGlobalRadioTrack(id));
    const rb = stations.slice(0, STATION_LIMIT).map((s) => stationToTrack(s));
    return [...curated, ...rb];
  }, [stations]);

  const onTapPublic = (station: RadioStation) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const track =
      radioQueue.find((t) => t.id === `radio-browser:${station.id}`) ?? stationToTrack(station);
    void usePlaybackController.getState().playTrack(track, radioQueue);
  };

  const onTapCurated = (id: GlobalRadioStationId) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const track = radioQueue.find((t) => t.globalRadioStationId === id) ?? buildGlobalRadioTrack(id);
    void usePlaybackController.getState().playTrack(track, radioQueue);
  };

  return (
    <View style={styles.wrap}>
      {/* ── RADIO (cyan, machined) — public Radio-Browser stations first.
          Live flag reads country (e.g. "LIVE · Germany"), so this block is
          where the "live germany" rows surface. */}
      <View style={styles.headerRow}>
        <Radio size={16} color={DOCK_CYAN} strokeWidth={2.4} />
        <Text style={styles.sectionTitle}>RADIO</Text>
        <Text style={styles.sectionSub}>Live stations</Text>
      </View>
      <View style={styles.stack}>
        {stations.slice(0, STATION_LIMIT).map((s) => {
          const Icon = pickStationIcon(s.tags);
          return (
            <Pressable
              key={`rb-${s.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${s.name} live station`}
              onPress={() => onTapPublic(s)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
            >
              <LinearGradient
                colors={['rgba(0,229,255,0.14)', '#000000']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.cardInner, styles.cardInnerCyan]}
              >
                <View style={[styles.artworkWell, styles.artworkWellCyan]}>
                  <Icon size={40} color={DOCK_CYAN} strokeWidth={1.75} />
                </View>

                <View style={styles.textCol}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
                    {s.name}
                  </Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.subtitle}>
                    {s.country ? `LIVE · ${s.country}` : 'LIVE'}
                  </Text>
                </View>

                <View style={[styles.playButton, styles.playButtonCyan]}>
                  <View style={[styles.playButtonInner, styles.playButtonInnerCyan]}>
                    <Play size={22} color={DOCK_CYAN} fill={DOCK_CYAN} style={{ marginLeft: 3 }} />
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>

      {/* ── GLOBAL STATIONS (amber, curated) — moved below the Radio-Browser
          list so curated relays read as their own category under "LIVE ·
          Germany" etc. Amber (`#FFB020`) visually separates first-party
          curated streams (Paradise, NTS, FIP, HÖR, Decades Vault) from the
          community Radio-Browser catalog above. */}
      <View style={[styles.headerRow, styles.headerRowGlobal]}>
        <Radio size={16} color={CURATED_AMBER} strokeWidth={2.4} />
        <Text style={styles.sectionTitle}>GLOBAL STATIONS</Text>
        <Text style={styles.sectionSub}>Curated relays</Text>
      </View>
      <View style={styles.stack}>
        {CURATED_ORDER.map((id) => {
          const def = GLOBAL_RADIO_STATIONS[id];
          const Icon = pickCuratedIcon(id);
          const title = CURATED_TITLE[id];
          return (
            <Pressable
              key={`curated-${id}`}
              accessibilityRole="button"
              accessibilityLabel={`${title} radio station`}
              onPress={() => onTapCurated(id)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
            >
              <LinearGradient
                colors={['rgba(255,176,32,0.14)', '#000000']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.cardInner, styles.cardInnerAmber]}
              >
                <View style={[styles.artworkWell, styles.artworkWellAmber]}>
                  <Icon size={40} color={CURATED_AMBER} strokeWidth={1.75} />
                </View>

                <View style={styles.textCol}>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.title}>
                    {title}
                  </Text>
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.subtitle}>
                    {`LIVE · ${def.diChannelTag}`}
                  </Text>
                </View>

                <View style={[styles.playButton, styles.playButtonAmber]}>
                  <View style={[styles.playButtonInner, styles.playButtonInnerAmber]}>
                    <Play size={22} color={CURATED_AMBER} fill={CURATED_AMBER} style={{ marginLeft: 3 }} />
                  </View>
                </View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * GLOBAL STATIONS accent — same amber as `NEON_AMBER` in DynamicIsland so the
 * curated category reads as warm/first-party vs the cyan machined chrome.
 */
const CURATED_AMBER = '#FFB020';

const styles = StyleSheet.create({
  wrap: {
    marginTop: 22,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerRowGlobal: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  sectionSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 6,
    letterSpacing: 0.4,
  },
  stack: {
    paddingHorizontal: 16,
    gap: 10,
  },
  card: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardInner: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 18,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardInnerCyan: {
    borderColor: 'rgba(0,229,255,0.28)',
  },
  cardInnerAmber: {
    borderColor: 'rgba(255,176,32,0.32)',
  },
  artworkWell: {
    width: 72,
    height: 72,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  artworkWellCyan: {
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderColor: 'rgba(0,229,255,0.18)',
  },
  artworkWellAmber: {
    backgroundColor: 'rgba(255,176,32,0.10)',
    borderColor: 'rgba(255,176,32,0.22)',
  },
  textCol: {
    flex: 1,
    marginLeft: 16,
    minWidth: 0,
  },
  title: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: -0.3,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 5,
    letterSpacing: 0.3,
  },
  playButton: {
    marginLeft: 8,
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: '#000000',
  },
  playButtonCyan: {
    borderColor: 'rgba(0,229,255,0.35)',
  },
  playButtonAmber: {
    borderColor: 'rgba(255,176,32,0.42)',
  },
  playButtonInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonInnerCyan: {
    backgroundColor: 'rgba(0,229,255,0.18)',
  },
  playButtonInnerAmber: {
    backgroundColor: 'rgba(255,176,32,0.22)',
  },
});
