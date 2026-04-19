import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InputAccessoryView,
  Keyboard,
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
import { ImagePlus, Search, X } from 'lucide-react-native';
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
 * Fire-post composer — Gorhom handles keyboard + `BottomSheetScrollView` so the
 * multiline field stays on-screen. Toolbar, vault chips, iOS accessory POST.
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

  // Single snap point — sheet opens nearly full-height so everything fits
  // above the keyboard without internal scrolling.
  // Shorter sheet so the underlying Vybe Activity screen stays visible above
  // the composer and the rounded top corners have room to show.
  const snapPoints = useMemo(() => ['80%'], []);
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

  // Compact preview shown ABOVE the text input — the ONLY place attached
  // track is shown (the old big "Attach now playing" row was removed to
  // free vertical space so everything fits on one screen).
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

  // Footer POST is hidden while keyboard is up on iOS — the InputAccessoryView
  // takes over. Android always shows the inline footer.
  const showInlineFooterPost = !keyboardVisible || Platform.OS !== 'ios';

  return (
    <>
    <BottomSheetModal
      ref={sheetRef}
      name="postComposer"
      index={0}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDismissOnClose
      enableContentPanningGesture={false}
      keyboardBlurBehavior="restore"
      // Extend the sheet with the keyboard; nesting KeyboardAvoidingView on top of Gorhom collapses the compose area on iOS.
      keyboardBehavior="extend"
      android_keyboardInputMode="adjustResize"
      topInset={insets.top}
      animationConfigs={animationConfigs}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handlePill}
      onDismiss={handleDismiss}
      onChange={handleSheetChange}
    >
      <BottomSheetScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, { paddingBottom: 8 + insets.bottom }]}
      >
          {/* Tight header — close X on left, title pill, POST chip on right */}
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => sheetRef.current?.dismiss(animationConfigs)}
              hitSlop={10}
              style={styles.closeBtn}
              accessibilityLabel="Close composer"
            >
              <X size={16} color={GRAPHITE_SOFT} strokeWidth={2.4} />
            </Pressable>
            <Text style={styles.headerTitle}>FIRE POST</Text>
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
          </View>

          {/* Pinned compact track preview — only renders when attached. */}
          {attachedPreview ? (
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
          ) : null}

          {/* Main text input — fixed min height so it stays visible above the keyboard. */}
          <BottomSheetTextInput
            ref={inputRef}
            value={text}
            onChangeText={setText}
            placeholder="What's on your mind?"
            placeholderTextColor={GRAPHITE}
            style={styles.input}
            multiline
            maxLength={MAX_LEN}
            autoCapitalize="sentences"
            selectionColor={VIBRANT_BLUE}
            editable={!submitting}
            inputAccessoryViewID={Platform.OS === 'ios' ? ACCESSORY_ID : undefined}
          />

          {/* Optional media thumbnail — sits inline above the toolbar so it
              doesn't push the chips off-screen. */}
          {mediaUri ? (
            <View style={styles.mediaThumbWrap}>
              <Image source={{ uri: mediaUri }} style={styles.mediaThumb} contentFit="cover" />
              <Pressable style={styles.mediaThumbClear} onPress={clearVisual} hitSlop={8}>
                <X size={12} color="#fff" strokeWidth={2.4} />
              </Pressable>
            </View>
          ) : null}

          {/* Compact toolbar — photo button + inline vault search + char counter */}
          <View style={styles.toolbar}>
            <Pressable
              onPress={pickVisual}
              hitSlop={8}
              style={({ pressed }) => [styles.toolbarIconBtn, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Add photo or video"
              disabled={submitting}
            >
              <ImagePlus size={18} color={VIBRANT_BLUE} strokeWidth={2.2} />
            </Pressable>
            <View style={styles.vaultSearchRow}>
              <Search size={14} color={GRAPHITE} style={{ marginRight: 6 }} />
              <BottomSheetTextInput
                ref={vaultSearchRef}
                value={vaultQuery}
                onChangeText={setVaultQuery}
                placeholder="Vault search…"
                placeholderTextColor={GRAPHITE}
                style={styles.vaultSearchInput}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!submitting}
                selectionColor={VIBRANT_BLUE}
              />
            </View>
            <Text
              style={[styles.charsLeft, charsLeft < 60 ? { color: NEON_MAGENTA } : null]}
            >
              {charsLeft}
            </Text>
          </View>

          {/* Horizontal vault chips — tap to attach */}
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="handled"
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

          {/* Android inline footer POST — hidden on iOS in favor of the
              accessory bar so the keyboard area stays uncluttered. */}
          {showInlineFooterPost && Platform.OS !== 'ios' ? (
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.androidPostBtn,
                !canSubmit && styles.androidPostBtnDisabled,
                pressed && canSubmit && { opacity: 0.88 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={VIBRANT_BLUE} />
              ) : (
                <Text style={styles.androidPostText}>POST</Text>
              )}
            </Pressable>
          ) : null}

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
      </BottomSheetScrollView>
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
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },
  handlePill: {
    width: 40,
    height: 3,
    borderRadius: 2,
    backgroundColor: GRAPHITE_GREY,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  headerPostBtn: {
    height: 30,
    paddingHorizontal: 16,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.14)',
    borderWidth: 1,
    borderColor: VIBRANT_BLUE,
    minWidth: 72,
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
  trackPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PREVIEW_BORDER,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginBottom: 10,
  },
  trackPreviewArt: {
    width: 44,
    height: 44,
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
  input: {
    alignSelf: 'stretch',
    // Fixed compose height: `flex:1` inside the sheet + iOS keyboard was resolving
    // to ~0 visible lines so only the accessory bar appeared above the keyboard.
    minHeight: 168,
    maxHeight: 220,
    color: '#FFFFFF',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '600',
    letterSpacing: -0.2,
    paddingVertical: 12,
    paddingHorizontal: 12,
    textAlignVertical: 'top',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  mediaThumbWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginVertical: 6,
  },
  mediaThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.4)',
  },
  mediaThumbClear: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  toolbarIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
  },
  vaultSearchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  vaultSearchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    padding: 0,
  },
  charsLeft: {
    color: GRAPHITE_SOFT,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 28,
    textAlign: 'right',
  },
  vaultChips: {
    paddingTop: 8,
    paddingBottom: 4,
    paddingRight: 4,
  },
  vaultChip: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 180,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginRight: 8,
  },
  vaultChipSelected: {
    borderColor: VIBRANT_BLUE,
    backgroundColor: 'rgba(0,229,255,0.1)',
    shadowColor: VIBRANT_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 6,
  },
  vaultChipArt: {
    width: 32,
    height: 32,
    borderRadius: 6,
    marginRight: 8,
    backgroundColor: '#111',
  },
  vaultChipTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  vaultChipArtist: {
    color: GRAPHITE_SOFT,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  androidPostBtn: {
    marginTop: 8,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.14)',
    borderWidth: 1,
    borderColor: VIBRANT_BLUE,
  },
  androidPostBtnDisabled: {
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  androidPostText: {
    color: VIBRANT_BLUE,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1.6,
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
  errorText: {
    marginTop: 6,
    color: NEON_MAGENTA,
    fontSize: 12,
    fontWeight: '600',
  },
});
