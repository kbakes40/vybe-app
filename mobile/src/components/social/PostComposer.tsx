import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Music, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlaybackController } from '@/stores/playbackController';
import { useDynamicIslandSignal } from '@/stores/dynamicIslandStore';
import { createSocialPost } from '@/lib/api/social';
import type { SocialPost } from '@/lib/api/social';
import { VIBRANT_BLUE } from '@/constants/machinedTheme';

const NEON_MAGENTA = '#FF00D4';
const MAX_LEN = 500;

interface PostComposerProps {
  visible: boolean;
  onClose: () => void;
  onPosted?: (post: SocialPost) => void;
}

/**
 * Bottom-sheet style modal for composing a social post.
 *
 * - OLED Black surface with a 1px Machined-Blue (#00E5FF) hairline border.
 * - Blinking Magenta cursor anchored to the right edge of the typed text.
 * - Auto-attaches the currently playing track from `usePlaybackController`
 *   as a chip the user can dismiss before posting.
 * - On success, flashes the Dynamic Island via `useDynamicIslandSignal`.
 */
export function PostComposer({ visible, onClose, onPosted }: PostComposerProps) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [attachTrack, setAttachTrack] = useState(true);

  const currentTrack = usePlaybackController((s) => s.currentTrack);
  const flashSuccess = useDynamicIslandSignal((s) => s.flashSuccess);

  // Reset state every time the sheet opens, then auto-focus the input so the
  // keyboard rises with the same animation as the sheet.
  useEffect(() => {
    if (visible) {
      setText('');
      setErrorMsg(null);
      setSubmitting(false);
      setAttachTrack(true);
      // Wait one frame so the modal is mounted before requesting focus.
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [visible]);

  // ── Slide / fade animation (sheet rises from bottom, scrim fades in). ──
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 280 : 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [visible, progress]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.62,
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 80 }],
  }));

  // Magenta cursor blink — pure-UI animation, never touches React state.
  const cursorBlink = useSharedValue(1);
  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      cursorBlink.value = withTiming(cursorBlink.value > 0.5 ? 0 : 1, {
        duration: 480,
      });
    };
    const id = setInterval(tick, 480);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [visible, cursorBlink]);
  const cursorStyle = useAnimatedStyle(() => ({ opacity: cursorBlink.value }));

  const handleClose = useCallback(() => {
    inputRef.current?.blur();
    onClose();
  }, [onClose]);

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
      const attached = attachTrack && currentTrack ? currentTrack : null;
      const post = await createSocialPost({
        text: trimmed,
        ...(attached
          ? {
              trackId: attached.id,
              trackTitle: attached.title,
              trackArtist: attached.artist,
              trackArtwork: attached.artwork,
            }
          : {}),
      });
      flashSuccess('POSTED');
      onPosted?.(post);
      // Slide closed via reanimated worklet so the success flash isn't blocked
      // on the modal unmount.
      progress.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(handleClose)();
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to post';
      const isUnauth = /401|UNAUTHORIZED/i.test(msg);
      setErrorMsg(isUnauth ? 'Sign in required to post' : msg);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSubmitting(false);
    }
  }, [text, submitting, attachTrack, currentTrack, flashSuccess, onPosted, progress, handleClose]);

  const charsLeft = MAX_LEN - text.length;
  const canSubmit = text.trim().length > 0 && !submitting;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Scrim */}
        <Animated.View style={[StyleSheet.absoluteFillObject, styles.scrim, scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={handleClose} />
        </Animated.View>

        {/* Sheet */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kbWrap}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[styles.sheet, { paddingBottom: 16 + insets.bottom }, sheetStyle]}
          >
            <View style={styles.handle} />

            <View style={styles.headerRow}>
              <Text style={styles.headerTitle}>Post a Vybe</Text>
              <Pressable
                onPress={handleClose}
                hitSlop={10}
                style={styles.closeBtn}
                accessibilityLabel="Close composer"
              >
                <X size={18} color="rgba(255,255,255,0.65)" strokeWidth={2.4} />
              </Pressable>
            </View>

            {/* Input + magenta cursor */}
            <View style={styles.inputWrap}>
              <TextInput
                ref={inputRef}
                value={text}
                onChangeText={setText}
                placeholder="What's the vybe?"
                placeholderTextColor="rgba(255,255,255,0.32)"
                style={styles.input}
                multiline
                maxLength={MAX_LEN}
                autoCapitalize="sentences"
                selectionColor={NEON_MAGENTA}
                editable={!submitting}
              />
              {/* Cursor only visible when no text — for that "ready to type" feel. */}
              {text.length === 0 ? (
                <Animated.View pointerEvents="none" style={[styles.cursor, cursorStyle]} />
              ) : null}
            </View>

            {/* Track attachment chip */}
            {currentTrack && attachTrack ? (
              <View style={styles.trackChip}>
                {currentTrack.artwork ? (
                  <Image source={{ uri: currentTrack.artwork }} style={styles.trackArt} contentFit="cover" />
                ) : (
                  <View style={[styles.trackArt, styles.trackArtFallback]}>
                    <Music size={16} color={VIBRANT_BLUE} />
                  </View>
                )}
                <View style={styles.trackText}>
                  <Text numberOfLines={1} style={styles.trackTitle}>
                    {currentTrack.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.trackArtist}>
                    {currentTrack.artist}
                  </Text>
                </View>
                <Pressable onPress={() => setAttachTrack(false)} hitSlop={8} style={styles.trackCloseBtn}>
                  <X size={14} color="rgba(255,255,255,0.55)" strokeWidth={2.4} />
                </Pressable>
              </View>
            ) : null}

            {/* Footer row: chars + submit */}
            <View style={styles.footerRow}>
              <Text
                style={[
                  styles.charsLeft,
                  charsLeft < 60 ? { color: NEON_MAGENTA } : null,
                ]}
              >
                {charsLeft}
              </Text>
              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.submitBtn,
                  !canSubmit && styles.submitBtnDisabled,
                  pressed && canSubmit && { opacity: 0.85 },
                ]}
              >
                <BlurView intensity={Platform.OS === 'ios' ? 24 : 0} tint="dark" style={StyleSheet.absoluteFill} />
                {submitting ? (
                  <ActivityIndicator size="small" color={VIBRANT_BLUE} />
                ) : (
                  <Text style={styles.submitText}>POST</Text>
                )}
              </Pressable>
            </View>

            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: '#000000' },
  kbWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: VIBRANT_BLUE,
    paddingHorizontal: 22,
    paddingTop: 10,
    shadowColor: VIBRANT_BLUE,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.55,
    shadowRadius: 22,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
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
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 96,
    paddingVertical: 4,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
    padding: 0,
  },
  cursor: {
    position: 'absolute',
    left: 0,
    top: 4,
    width: 2,
    height: 24,
    backgroundColor: NEON_MAGENTA,
    shadowColor: NEON_MAGENTA,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    borderRadius: 1,
  },
  trackChip: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,229,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,229,255,0.45)',
  },
  trackArt: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#111',
  },
  trackArtFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
    marginRight: 6,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  trackArtist: {
    color: VIBRANT_BLUE,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 1,
    textTransform: 'uppercase',
  },
  trackCloseBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  charsLeft: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  submitBtn: {
    minWidth: 96,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: VIBRANT_BLUE,
    shadowColor: VIBRANT_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 14,
  },
  submitBtnDisabled: {
    borderColor: 'rgba(255,255,255,0.18)',
    shadowOpacity: 0,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  submitText: {
    color: VIBRANT_BLUE,
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 1.4,
  },
  errorText: {
    marginTop: 10,
    color: NEON_MAGENTA,
    fontSize: 12,
    fontWeight: '600',
  },
});
