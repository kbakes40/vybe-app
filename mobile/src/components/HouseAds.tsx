import React, { useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Shirt, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { Track } from '@/types/music';
import { DECADES_70S_PLAYLIST_ID, MAINSTREET_TEES_US_URL } from '@/constants/decadesVault';

export const HOUSE_AD_URLS = {
  mainstreetTees: MAINSTREET_TEES_US_URL,
} as const;

const ROW_H = 72;
const EASTER_COPY = 'VYBE GEAR BY A DESIGN LINE. STREETWEAR FOR THE VAULT.';
const DEFAULT_MAINSTREET_COPY = 'CUSTOM VYBE GEAR. AUTHENTIC PRINTS.';

export type HouseAdKind = 'mainstreet';

export type PlaylistDetailListItem =
  | { type: 'track'; track: Track }
  | {
      type: 'house-ad';
      id: string;
      kind: HouseAdKind;
      /** Oldschool / 90s vault Easter egg — yellow border + fixed slots + double haptic on view */
      easterEgg?: boolean;
      easterSlot?: 5 | 15;
    }
  /** Shadow “Discover More” section (playlist-detail FlashList tail) */
  | { type: 'discover-header' }
  | { type: 'discover-track'; track: Track }
  | { type: 'discover-skeleton'; id: string }
  | { type: 'discover-fade' };

/** Normalize for substring checks (case + common punctuation). */
function normalizePlaylistTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Playlists that get hard-wired Mainstreet Tees placements at FlashList indices 5 and 15.
 */
export function isMainstreetEasterEggPlaylist(playlistName: string): boolean {
  const n = normalizePlaylistTitle(playlistName);
  return (
    n.includes('oldschool hip hop') ||
    n.includes('90s & 00s hits') ||
    n.includes('90s and 00s hits')
  );
}

/**
 * Inserts Mainstreet house-ad rows at indices 5 and 15 (0-based) for Easter playlists.
 * 70s Analog vault: MainStreet Tees row at index 6 (displayed as track #7).
 * Other playlists: plain track rows only.
 */
export function buildPlaylistDetailFlashRows(
  tracks: Track[],
  playlistDisplayName: string,
  playlistId?: string,
): PlaylistDetailListItem[] {
  const rows: PlaylistDetailListItem[] = tracks.map((t) => ({ type: 'track', track: t }));

  if (playlistId === DECADES_70S_PLAYLIST_ID && rows.length > 6) {
    const ad70s: PlaylistDetailListItem = {
      type: 'house-ad',
      id: 'house-mainstreet-70s-track7',
      kind: 'mainstreet',
      easterEgg: true,
    };
    rows.splice(6, 0, ad70s);
  }

  if (!isMainstreetEasterEggPlaylist(playlistDisplayName)) {
    return rows;
  }

  const ad5: PlaylistDetailListItem = {
    type: 'house-ad',
    id: 'house-mainstreet-easter-5',
    kind: 'mainstreet',
    easterEgg: true,
    easterSlot: 5,
  };
  const ad15: PlaylistDetailListItem = {
    type: 'house-ad',
    id: 'house-mainstreet-easter-15',
    kind: 'mainstreet',
    easterEgg: true,
    easterSlot: 15,
  };

  if (rows.length > 5) {
    rows.splice(5, 0, ad5);
  }
  if (rows.length > 15) {
    rows.splice(15, 0, ad15);
  }
  return rows;
}

function triggerEasterEggViewHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  setTimeout(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, 110);
}

export type HouseAdViewabilityConfig = {
  itemVisiblePercentThreshold: number;
};

export const HOUSE_AD_VIEWABILITY: HouseAdViewabilityConfig = {
  itemVisiblePercentThreshold: 55,
};

/**
 * FlashList `onViewableItemsChanged` helper: double-impact haptic once per Easter ad id.
 */
export function useEasterEggAdViewabilityHandler() {
  const fired = useRef<Set<string>>(new Set());

  const resetFired = useCallback(() => {
    fired.current.clear();
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: { item: PlaylistDetailListItem; key: string }[] }) => {
      for (const v of viewableItems) {
        const it = v.item;
        if (it?.type !== 'house-ad' || !it.easterEgg || !it.id) continue;
        if (fired.current.has(it.id)) continue;
        fired.current.add(it.id);
        triggerEasterEggViewHaptic();
      }
    },
    [],
  );

  return { onViewableItemsChanged, resetFired };
}

type BannerProps = {
  graffitiNeonBorder?: boolean;
  onOpenSheet: () => void;
};

export function MainstreetTeesBannerRow({ graffitiNeonBorder, onOpenSheet }: BannerProps) {
  const borderColor = graffitiNeonBorder ? '#FFFF00' : '#FF00FF';
  const glowColor = graffitiNeonBorder ? '#FFFF00' : '#FF00FF';
  const copy = graffitiNeonBorder ? EASTER_COPY : DEFAULT_MAINSTREET_COPY;

  return (
    <Pressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        onOpenSheet();
      }}
      style={[
        styles.bannerShell,
        {
          height: ROW_H,
          borderColor,
          backgroundColor: '#000000',
        },
      ]}
    >
      <View
        style={[
          styles.logoWrap,
          Platform.select({
            ios: {
              shadowColor: glowColor,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.9,
              shadowRadius: 10,
            },
            android: { elevation: 12 },
            default: {},
          }),
        ]}
      >
        <Shirt size={26} color={glowColor} strokeWidth={2.2} />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.brandMark} numberOfLines={1}>
          MAINSTREET TEES
        </Text>
        <Text style={styles.tagline} numberOfLines={2}>
          {copy}
        </Text>
      </View>
      <BlurView intensity={45} tint="dark" style={styles.ctaBlur}>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onOpenSheet();
          }}
          style={styles.ctaInner}
        >
          <Text style={styles.ctaLabel}>Shop</Text>
        </Pressable>
      </BlurView>
    </Pressable>
  );
}

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
  url: string;
  ctaLabel?: string;
};

export function HouseAdLinkSheet({
  visible,
  onClose,
  title,
  body,
  url,
  ctaLabel = 'Open store',
}: SheetProps) {
  const insets = useSafeAreaInsets();

  const openLink = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFillObject} pointerEvents="none" />
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.55)' }]} pointerEvents="none" />
      </Pressable>
      <View style={[styles.sheetCard, { paddingBottom: insets.bottom + 20 }]} pointerEvents="box-none">
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFillObject} pointerEvents="none" />
        <View style={styles.sheetInner}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <X size={22} color="rgba(255,255,255,0.55)" />
            </Pressable>
          </View>
          <Text style={styles.sheetBody}>{body}</Text>
          <Pressable onPress={openLink} style={styles.sheetPrimaryCta}>
            <Text style={styles.sheetPrimaryCtaText}>{ctaLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bannerShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    marginVertical: 4,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },
  logoWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  brandMark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  tagline: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
    lineHeight: 13,
  },
  ctaBlur: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  ctaInner: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ctaLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#121212',
  },
  sheetInner: {
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: 'rgba(18,18,18,0.94)',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
    flex: 1,
    marginRight: 12,
  },
  sheetBody: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  sheetPrimaryCta: {
    backgroundColor: '#FFFF00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  sheetPrimaryCtaText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
});
