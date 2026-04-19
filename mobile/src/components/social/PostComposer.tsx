import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
  useBottomSheetSpringConfigs,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { ImagePlus, Music, Search, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track } from '@/types/music';
import { usePlaybackController } from '@/stores/playbackController';
import { useDynamicIslandSignal } from '@/stores/dynamicIslandStore';
import { createSocialPost } from '@/lib/api/social';
import type { SocialPost } from '@/lib/api/social';
import { DECADES_VAULT_FEED_TRACKS, type DecadesVaultFeedTrackRef } from '@/constants/decadesVault';
import { GRAPHITE_GREY, OLED_BLACK, VIBRANT_BLUE } from '@/constants/machinedTheme';

const NEON_MAGENTA = '#FF00D4';
const GRAPHITE = '#6B6E73';
const GRAPHITE_SOFT = 'rgba(107,110,115,0.55)';
const MAX_LEN = 500;
/** iOS InputAccessoryView nativeID — POST jumps here when keyboard is up. */
const ACCESSORY_ID = 'vybe-post-accessory';
/** Caps the text input growth so it never pushes the track card off-screen. */
const INPUT_MAX_HEIGHT = 140;
/** 1px Machined Border for the compact track preview card. */
const PREVIEW_BORDER = 'rgba(255,255,255,0.20)';

/** Drawer-like sheet motion — mass 1, damping 20, stiffness 150. */
const SHEET_SPRING = { mass: 1, damping: 20, stiffness: 150 } as const;

interface PostComposerProps {
  visible: boolean;
  onClose: () => void;
  onPosted?: (post: SocialPost) => void;
}

function trackToPostAttach(t: Track): {
  trackId: string;
  trackTitle: string;
  trackArtist: string;
  trackArtwork?: string;
} {
  const yt = t.youtubeMusicId?.trim() || t.youtubeId?.trim();
  const legacy = t.id?.trim().match(/^ytm?-([^/]+)$/);
  const trackId = yt || legacy?.[1] || t.id;
  return {
    trackId,
    trackTitle: t.title,
    trackArtist: t.artist,
    trackArtwork: t.artwork,
  };
}

/**
 * Fire-post composer — Gorhom bottom sheet over the feed (OLED sheet + blurred dim backdrop).
 * POST still uses `createSocialPost` → shared `api` client (Bearer + cookies) to Railway.
 */
export function PostComposer({ visible, onClose, onPosted }: PostComposerProps) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<React.ComponentRef<typeof BottomSheetModal>>(null);
  const inputRef = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
  const vaultSearchRef = useRef<React.ComponentRef<typeof BottomSheetTextInput>>(null);
  const focusedFirstSnapRef = useRef(false);

  const [text, setText] = useState('');
  const [vaultQuery, setVaultQuery] = useState('');
  const [vaultPick, setVaultPick] = useState<DecadesVaultFeedTrackRef | null>(null);
  const [attachNowPlaying, setAttachNowPlaying] = useState(false);
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Track keyboard visibility so the inline footer POST can collapse and
  // the iOS accessory bar takes over (saves screen real estate while typing).
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const flashSuccess = useDynamicIslandSignal((s) => s.flashSuccess);

  const snapPoints = useMemo(() => ['50%', '90%'], []);
  const animationConfigs = useBottomSheetSpringConfigs(SHEET_SPRING);

  const filteredVault = useMemo(() => {
    const q = vaultQuery.trim().toLowerCase();
    if (!q) return DECADES_VAULT_FEED_TRACKS;
    return DECADES_VAULT_FEED_TRACKS.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.trackId.toLowerCase().includes(q),
    );
  }, [vaultQuery]);

  useEffect(() => {
    if (!visible) {
      sheetRef.current?.dismiss(animationConfigs);
      return;
    }
    setText('');
    setVaultQuery('');
    setVaultPick(null);
    setMediaUri(null);
    setErrorMsg(null);
    setSubmitting(false);
    setAttachNowPlaying(!!currentTrack);
    focusedFirstSnapRef.current = false;
    // Defer `present()` so the BottomSheetModal ref is attached (otherwise the sheet can silently not open).
    const tid = setTimeout(() => {
      sheetRef.current?.present();
    }, 48);
    return () => clearTimeout(tid);
  }, [visible, currentTrack, animationConfigs]);

  const handleSheetChange = useCallback((index: number) => {
    if (index === 0 && !focusedFirstSnapRef.current) {
      focusedFirstSnapRef.current = true;
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, []);

  /** If `onChange` misses the first snap, still focus once the sheet is up. */
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => {
      if (focusedFirstSnapRef.current) return;
      focusedFirstSnapRef.current = true;
      inputRef.current?.focus();
    }, 520);
    return () => clearTimeout(t);
  }, [visible]);

  const handleDismiss = useCallback(() => {
    inputRef.current?.blur();
    vaultSearchRef.current?.blur();
    setSubmitting(false);
    onClose();
  }, [onClose]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      >
        <BlurView
          intensity={Platform.OS === 'ios' ? 44 : 28}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      </BottomSheetBackdrop>
    ),
    [],
  );

  const pickVisual = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg('Photo library access is required for visuals.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.85,
      videoMaxDuration: 60,
    });
    if (result.canceled || !result.assets[0]) return;
    setErrorMsg(null);
    setMediaUri(result.assets[0].uri);
  }, []);

  const clearVisual = useCallback(() => {
    void Haptics.selectionAsync();
    setMediaUri(null);
  }, []);

  const resolveTrackPayload = useCallback(():
    | { trackId: string; trackTitle: string; trackArtist: string; trackArtwork?: string }
    | Record<string, never> => {
    if (vaultPick) {
      return {
        trackId: vaultPick.trackId,
        trackTitle: vaultPick.title,
        trackArtist: vaultPick.artist,
        trackArtwork: vaultPick.artwork,
      };
    }
    if (attachNowPlaying && currentTrack) {
      return trackToPostAttach(currentTrack);
    }
    return {};
  }, [vaultPick, attachNowPlaying, currentTrack]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    if (trimmed.length > MAX_LEN) {
      setErrorMsg(`Max ${MAX_LEN} characters`);
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const trackFields = resolveTrackPayload();
      const mediaUrl =
        mediaUri && mediaUri.length < 2048 ? mediaUri : mediaUri ? mediaUri.slice(0, 2047) : undefined;
      const post = await createSocialPost({
        text: trimmed,
        ...trackFields,
        ...(mediaUrl ? { mediaUrl } : {}),
      });
      flashSuccess('POSTED');
      onPosted?.(post);
      inputRef.current?.blur();
      vaultSearchRef.current?.blur();
      sheetRef.current?.dismiss(animationConfigs);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to post';
      const isUnauth = /401|UNAUTHORIZED/i.test(msg);
      setErrorMsg(isUnauth ? 'Sign in required to post' : msg);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSubmitting(false);
    }
  }, [
    text,
    submitting,
    resolveTrackPayload,
    mediaUri,
    flashSuccess,
    onPosted,
    animationConfigs,
  ]);

  const charsLeft = MAX_LEN - text.length;
  const canSubmit = text.trim().length > 0 && !submitting;

  // Compact preview shown ABOVE the text input — keeps text + track always
  // visible at the top so the user knows what they're attaching.
  const attachedPreview = vaultPick
    ? {
        title: vaultPick.title,
        artist: vaultPick.artist,
        artwork: vaultPick.artwork,
        source: 'vault' as const,
      }
    : attachNowPlaying && currentTrack
      ? {
          title: currentTrack.title,
          artist: currentTrack.artist,
          artwork: currentTrack.artwork,
          source: 'now-playing' as const,
        }
      : null;

  const clearAttachedPreview = useCallback(() => {
    void Haptics.selectionAsync();
    setVaultPick(null);
    setAttachNowPlaying(false);
  }, []);

  const renderTrackPreview = () =>
    attachedPreview ? (
      <View style={styles.trackPreviewCard}>
        {attachedPreview.artwork ? (
          <Image
            source={{ uri: attachedPreview.artwork }}
            style={styles.trackPreviewArt}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.trackPreviewArt, { backgroundColor: '#111' }]} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.trackPreviewSource} numberOfLines={1}>
            {attachedPreview.source === 'vault' ? 'VAULT' : 'NOW PLAYING'}
          </Text>
          <Text style={styles.trackPreviewTitle} numberOfLines={1}>
            {attachedPreview.title}
          </Text>
          <Text style={styles.trackPreviewArtist} numberOfLines={1}>
            {attachedPreview.artist}
          </Text>
        </View>
        <Pressable
          hitSlop={8}
          style={styles.trackPreviewClear}
          onPress={clearAttachedPreview}
          accessibilityLabel="Remove attached track"
        >
          <X size={14} color={GRAPHITE_SOFT} strokeWidth={2.4} />
        </Pressable>
      </View>
    ) : null;

  // Footer POST is hidden while the keyboard is up — the InputAccessoryView
  // takes over (iOS) or the floating header POST shows (Android).
  const showInlineFooterPost = !keyboardVisible;
  const showHeaderPost = keyboardVisible && Platform.OS !== 'ios';

  return (
    <>
    <BottomSheetModal
      ref={sheetRef}
      name="postComposer"
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDismissOnClose
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      topInset={insets.top}
      bottomInset={insets.bottom}
      animationConfigs={animationConfigs}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handlePill}
      onDismiss={handleDismiss}
      onChange={handleSheetChange}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 12 + insets.bottom, justifyContent: 'flex-start' },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Fire post</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {showHeaderPost ? (
              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.headerPostBtn,
                  !canSubmit && styles.headerPostBtnDisabled,
                  pressed && canSubmit && { opacity: 0.85 },
                ]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={VIBRANT_BLUE} />
                ) : (
                  <Text style={styles.headerPostText}>POST</Text>
                )}
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => sheetRef.current?.dismiss(animationConfigs)}
              hitSlop={10}
              style={styles.closeBtn}
              accessibilityLabel="Close composer"
            >
              <X size={18} color={GRAPHITE_SOFT} strokeWidth={2.4} />
            </Pressable>
          </View>
        </View>

        {/* Pinned track header — sits directly above the text input so both
            text and attached track are always visible at the top. */}
        {renderTrackPreview()}

        <Text style={styles.sectionLabel}>Text</Text>
        <BottomSheetTextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder="What's on your mind?"
          placeholderTextColor={GRAPHITE}
          style={[styles.input, { maxHeight: INPUT_MAX_HEIGHT }]}
          multiline
          maxLength={MAX_LEN}
          autoCapitalize="sentences"
          selectionColor={VIBRANT_BLUE}
          editable={!submitting}
          inputAccessoryViewID={Platform.OS === 'ios' ? ACCESSORY_ID : undefined}
        />

        <Text style={[styles.sectionLabel, styles.sectionSpaced]}>Attach track</Text>
        <Text style={styles.sectionHint}>Search Decades Vault</Text>
        <View style={styles.vaultSearchRow}>
          <Search size={16} color={GRAPHITE} style={{ marginRight: 8 }} />
          <BottomSheetTextInput
            ref={vaultSearchRef}
            value={vaultQuery}
            onChangeText={setVaultQuery}
            placeholder="Heartless, 90s G-Funk…"
            placeholderTextColor={GRAPHITE}
            style={styles.vaultSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            selectionColor={VIBRANT_BLUE}
          />
        </View>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.vaultChips}
        >
          {filteredVault.map((t) => {
            const selected = vaultPick?.trackId === t.trackId;
            return (
              <Pressable
                key={t.trackId}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setVaultPick(selected ? null : t);
                  if (!selected) setAttachNowPlaying(false);
                }}
                style={[styles.vaultChip, selected && styles.vaultChipSelected]}
              >
                <Image source={{ uri: t.artwork }} style={styles.vaultChipArt} contentFit="cover" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={styles.vaultChipTitle}>
                    {t.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.vaultChipArtist}>
                    {t.artist}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {currentTrack ? (
          <Pressable
            style={styles.nowPlayingRow}
            onPress={() => {
              void Haptics.selectionAsync();
              setAttachNowPlaying((v) => {
                const next = !v;
                if (next) setVaultPick(null);
                return next;
              });
            }}
          >
            <View style={[styles.check, attachNowPlaying && styles.checkOn]} />
            <Music size={16} color={VIBRANT_BLUE} style={{ marginHorizontal: 8 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.npLabel}>Attach now playing</Text>
              <Text numberOfLines={1} style={styles.npTitle}>
                {currentTrack.title} — {currentTrack.artist}
              </Text>
            </View>
          </Pressable>
        ) : null}

        <Text style={[styles.sectionLabel, styles.sectionSpaced]}>Visual</Text>
        <View style={styles.visualBox}>
          {mediaUri ? (
            <View style={styles.visualInner}>
              <Image source={{ uri: mediaUri }} style={styles.visualPreview} contentFit="cover" />
              <Pressable style={styles.visualClear} onPress={clearVisual} hitSlop={8}>
                <X size={16} color="#fff" strokeWidth={2.4} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={pickVisual} style={styles.visualPlaceholder} disabled={submitting}>
              <ImagePlus size={28} color={GRAPHITE} strokeWidth={1.8} />
              <Text style={styles.visualPlaceholderText}>Photo or video</Text>
              <Text style={styles.visualSub}>1px frame · tap to add</Text>
            </Pressable>
          )}
        </View>

        {showInlineFooterPost ? (
          <View style={styles.footerRow}>
            <Text style={[styles.charsLeft, charsLeft < 60 ? { color: NEON_MAGENTA } : null]}>{charsLeft}</Text>
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                !canSubmit && styles.submitBtnDisabled,
                pressed && canSubmit && { opacity: 0.88 },
              ]}
            >
              {Platform.OS === 'ios' ? (
                <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
              )}
              {submitting ? (
                <ActivityIndicator size="small" color={VIBRANT_BLUE} />
              ) : (
                <Text style={styles.submitText}>POST</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
      </BottomSheetScrollView>
      </KeyboardAvoidingView>
    </BottomSheetModal>

    {/* iOS keyboard accessory bar — POST is reachable without leaving the
        keyboard, freeing the screen up for text + track preview. */}
    {Platform.OS === 'ios' ? (
      <InputAccessoryView nativeID={ACCESSORY_ID} backgroundColor={OLED_BLACK}>
        <View style={styles.accessoryBar}>
          <Text style={[styles.accessoryChars, charsLeft < 60 ? { color: NEON_MAGENTA } : null]}>
            {charsLeft}
          </Text>
          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            hitSlop={6}
            style={({ pressed }) => [
              styles.accessoryPostBtn,
              !canSubmit && styles.accessoryPostBtnDisabled,
              pressed && canSubmit && { opacity: 0.85 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={VIBRANT_BLUE} />
            ) : (
              <Text style={styles.accessoryPostText}>POST</Text>
            )}
          </Pressable>
        </View>
      </InputAccessoryView>
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: OLED_BLACK,
  },
  handlePill: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: GRAPHITE_GREY,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  trackPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PREVIEW_BORDER,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 12,
  },
  trackPreviewArt: {
    width: 48,
    height: 48,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: '#111',
  },
  trackPreviewSource: {
    color: VIBRANT_BLUE,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  trackPreviewTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  trackPreviewArtist: {
    color: GRAPHITE_SOFT,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  trackPreviewClear: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginLeft: 6,
  },
  headerPostBtn: {
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.14)',
    borderWidth: 1,
    borderColor: VIBRANT_BLUE,
  },
  headerPostBtnDisabled: {
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  headerPostText: {
    color: VIBRANT_BLUE,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1.4,
  },
  accessoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,229,255,0.18)',
    backgroundColor: OLED_BLACK,
  },
  accessoryChars: {
    color: GRAPHITE_SOFT,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  accessoryPostBtn: {
    minWidth: 84,
    height: 34,
    paddingHorizontal: 18,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.18)',
    borderWidth: 1,
    borderColor: VIBRANT_BLUE,
    shadowColor: VIBRANT_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  accessoryPostBtnDisabled: {
    borderColor: 'rgba(255,255,255,0.15)',
    shadowOpacity: 0,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  accessoryPostText: {
    color: VIBRANT_BLUE,
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 1.6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
  },
  sectionLabel: {
    color: GRAPHITE,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sectionSpaced: {
    marginTop: 16,
  },
  sectionHint: {
    color: GRAPHITE_SOFT,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
    minHeight: 72,
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  vaultSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.22)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  vaultSearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
  },
  vaultChips: {
    paddingVertical: 12,
    paddingRight: 4,
  },
  vaultChip: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 200,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginRight: 10,
  },
  vaultChipSelected: {
    borderColor: VIBRANT_BLUE,
    backgroundColor: 'rgba(0,229,255,0.1)',
    shadowColor: VIBRANT_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
  },
  vaultChipArt: {
    width: 40,
    height: 40,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: '#111',
  },
  vaultChipTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  vaultChipArtist: {
    color: GRAPHITE_SOFT,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  nowPlayingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GRAPHITE,
  },
  checkOn: {
    borderColor: VIBRANT_BLUE,
    backgroundColor: 'rgba(0,229,255,0.25)',
  },
  npLabel: {
    color: GRAPHITE,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  npTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  visualBox: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: VIBRANT_BLUE,
    overflow: 'hidden',
    backgroundColor: '#050505',
    minHeight: 140,
  },
  visualInner: {
    position: 'relative',
    width: '100%',
    minHeight: 160,
  },
  visualPreview: {
    width: '100%',
    height: 180,
    backgroundColor: '#111',
  },
  visualClear: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  visualPlaceholder: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  visualPlaceholderText: {
    marginTop: 10,
    color: GRAPHITE,
    fontSize: 14,
    fontWeight: '700',
  },
  visualSub: {
    marginTop: 4,
    color: GRAPHITE_SOFT,
    fontSize: 11,
    fontWeight: '600',
  },
  footerRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  charsLeft: {
    color: GRAPHITE_SOFT,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  submitBtn: {
    minWidth: 100,
    height: 42,
    paddingHorizontal: 20,
    borderRadius: 21,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.14)',
    borderWidth: 1,
    borderColor: VIBRANT_BLUE,
    shadowColor: VIBRANT_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 12,
  },
  submitBtnDisabled: {
    borderColor: 'rgba(255,255,255,0.15)',
    shadowOpacity: 0,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  submitText: {
    color: VIBRANT_BLUE,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1.6,
  },
  errorText: {
    marginTop: 8,
    color: NEON_MAGENTA,
    fontSize: 12,
    fontWeight: '600',
  },
});
