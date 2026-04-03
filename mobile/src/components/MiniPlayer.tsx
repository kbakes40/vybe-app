import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Play, Pause, Cloud, Disc3, ExternalLink } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  interpolate,
  Extrapolation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { usePlaybackController } from '@/stores/playbackController';
import { usePlaybackDebugStore } from '@/stores/playbackDebugStore';
import { PlaybackDebugIndicator } from '@/components/PlaybackDebugOverlay';
import { openInSoundCloud } from '@/lib/soundcloudHandoff';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// YouTube icon component
function YouTubeIcon({ size = 14 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: '#FF0000',
        borderRadius: 3,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.35,
          borderTopWidth: size * 0.2,
          borderBottomWidth: size * 0.2,
          borderLeftColor: '#fff',
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          marginLeft: 2,
        }}
      />
    </View>
  );
}

// SoundCloud icon component
function SoundCloudIcon({ size = 14 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: '#FF5500',
        borderRadius: 3,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Cloud size={size * 0.7} color="#fff" strokeWidth={3} />
    </View>
  );
}

// YouTube Music icon component
function YouTubeMusicIcon({ size = 14 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: '#FF0000',
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size * 0.3,
          borderTopWidth: size * 0.18,
          borderBottomWidth: size * 0.18,
          borderLeftColor: '#fff',
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          marginLeft: 1,
        }}
      />
    </View>
  );
}

// VYBE icon for source indicator
function VybeSourceIcon({ size = 14 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: '#8B5CF6',
        borderRadius: 3,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.6, fontWeight: 'bold' }}>V</Text>
    </View>
  );
}

export function MiniPlayer() {
  const router = useRouter();
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playbackState = usePlaybackController(s => s.playbackState);
  const progress = usePlaybackController(s => s.progress);
  const duration = usePlaybackController(s => s.duration);
  const play = usePlaybackController(s => s.play);
  const pause = usePlaybackController(s => s.pause);
  const currentSource = usePlaybackController(s => s.currentSource);

  // Debug store
  const debugModeEnabled = usePlaybackDebugStore(s => s.debugModeEnabled);
  const toggleDebugOverlay = usePlaybackDebugStore(s => s.toggleDebugOverlay);
  const logCurrentState = usePlaybackDebugStore(s => s.logCurrentState);

  // Triple tap tracking for debug toggle
  const tapCountRef = useRef(0);
  const lastTapTimeRef = useRef(0);

  // Derive state from playbackState
  const isPlaying = playbackState === 'playing';
  const isLoading = playbackState === 'loading' || playbackState === 'buffering';

  // Source type detection (needed before useEffects)
  const isYouTube = currentSource === 'youtube';
  const isYouTubeMusic = currentSource === 'youtube_music';
  const isSoundCloud = currentSource === 'soundcloud';

  // Animation values
  const scale = useSharedValue(1);
  const buttonScale = useSharedValue(1);
  const translateY = useSharedValue(0);
  const progressWidth = useSharedValue(0);
  const appearAnimation = useSharedValue(0);
  const loadingRotation = useSharedValue(0);

  // Animate progress bar smoothly (static for SoundCloud - external only)
  useEffect(() => {
    if (isSoundCloud) {
      progressWidth.value = 0;
      return;
    }
    const percent = duration > 0 ? (progress / duration) * 100 : 0;
    progressWidth.value = withTiming(percent, { duration: 200 });
  }, [progress, duration, isSoundCloud]);

  // Appear animation when track changes
  useEffect(() => {
    if (currentTrack) {
      appearAnimation.value = 0;
      appearAnimation.value = withSpring(1, { damping: 20, stiffness: 300 });
    }
  }, [currentTrack?.id]);

  // Loading spinner animation
  useEffect(() => {
    if (isLoading) {
      loadingRotation.value = 0;
      loadingRotation.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1, // Infinite
        false
      );
    } else {
      loadingRotation.value = 0;
    }
  }, [isLoading]);

  const navigateToNowPlaying = () => {
    // Medium haptic when expanding mini player to full player
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(app)/nowPlaying' as never);
  };

  // Triple tap handler for debug overlay toggle
  const handleTripleTap = () => {
    const now = Date.now();
    if (now - lastTapTimeRef.current > 500) {
      // Reset if more than 500ms since last tap
      tapCountRef.current = 1;
    } else {
      tapCountRef.current++;
    }
    lastTapTimeRef.current = now;

    if (tapCountRef.current >= 3 && debugModeEnabled) {
      tapCountRef.current = 0;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toggleDebugOverlay();
    }
  };

  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // SoundCloud is external-only - open search in SoundCloud
    if (isSoundCloud && currentTrack) {
      openInSoundCloud(currentTrack);
      return;
    }

    if (isPlaying) {
      pause();
    } else {
      play();
    }
  };

  // Long press handler for logging playback state
  const handleLongPress = () => {
    if (debugModeEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      logCurrentState();
      console.log('[MiniPlayer] Long press - logged current playback state');
    }
  };

  // Swipe up gesture to expand to full player
  const swipeGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY < 0) {
        translateY.value = Math.max(event.translationY, -50);
      }
    })
    .onEnd((event) => {
      if (event.translationY < -30 || event.velocityY < -500) {
        runOnJS(navigateToNowPlaying)();
      }
      translateY.value = withSpring(0, { damping: 20, stiffness: 400 });
    });

  // Tap gesture for navigation (with triple tap detection)
  const tapGesture = Gesture.Tap()
    .onStart(() => {
      scale.value = withSpring(0.98, { damping: 15 });
    })
    .onEnd(() => {
      scale.value = withSpring(1, { damping: 15 });
      runOnJS(handleTripleTap)();
      runOnJS(navigateToNowPlaying)();
    });

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
    opacity: interpolate(
      appearAnimation.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP
    ),
  }));

  const progressAnimatedStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const loadingAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${loadingRotation.value}deg` }],
  }));

  if (!currentTrack) return null;

  const isVybe = !currentSource || currentSource === 'vybe';

  // Determine source label
  const getSourceLabel = () => {
    if (isYouTube) return 'YouTube';
    if (isYouTubeMusic) return 'YouTube Music';
    if (isSoundCloud) return 'SoundCloud';
    return null;
  };

  const sourceLabel = getSourceLabel();

  return (
    <GestureDetector gesture={Gesture.Race(swipeGesture, tapGesture)}>
      <Animated.View style={[styles.container, containerAnimatedStyle]}>
        {/* Main content area */}
        <View style={styles.content}>
          {/* Album Art */}
          <View style={styles.artworkContainer}>
            <Image
              source={{ uri: currentTrack.artwork }}
              style={styles.artwork}
              contentFit="cover"
              transition={200}
            />
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <Animated.View style={loadingAnimatedStyle}>
                  <Disc3 size={20} color="#fff" style={{ opacity: 0.9 }} />
                </Animated.View>
              </View>
            )}
          </View>

          {/* Track Info */}
          <View style={styles.trackInfo}>
            <Text style={styles.trackTitle} numberOfLines={1}>
              {currentTrack.title}
            </Text>
            <View style={styles.artistRow}>
              {/* Source indicator */}
              {isYouTube && (
                <>
                  <YouTubeIcon size={12} />
                  <Text style={styles.sourceLabel}>{sourceLabel}</Text>
                  <Text style={styles.separator}>•</Text>
                </>
              )}
              {isYouTubeMusic && (
                <>
                  <YouTubeMusicIcon size={12} />
                  <Text style={styles.sourceLabel}>{sourceLabel}</Text>
                  <Text style={styles.separator}>•</Text>
                </>
              )}
              {isSoundCloud && (
                <>
                  <SoundCloudIcon size={12} />
                  <Text style={styles.sourceLabel}>{sourceLabel}</Text>
                  <Text style={styles.separator}>•</Text>
                </>
              )}
              {/* Artist name */}
              <Text style={styles.artistName} numberOfLines={1}>
                {currentTrack.artist}
              </Text>
            </View>
          </View>

          {/* Play/Pause Button - External link for YouTube Music and SoundCloud */}
          <AnimatedPressable
            onPress={handlePlayPause}
            onLongPress={handleLongPress}
            delayLongPress={500}
            onPressIn={() => {
              buttonScale.value = withSpring(0.85, { damping: 15 });
            }}
            onPressOut={() => {
              buttonScale.value = withSpring(1, { damping: 15 });
            }}
            style={[
              styles.playButton,
              buttonAnimatedStyle,
              isSoundCloud && { backgroundColor: '#FF5500', borderRadius: 20 },
            ]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {isSoundCloud ? (
              <ExternalLink size={20} color="#fff" />
            ) : isPlaying ? (
              <Pause size={22} color="#fff" fill="#fff" />
            ) : (
              <Play size={22} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
            )}
            {/* Debug indicator dot */}
            <PlaybackDebugIndicator />
          </AnimatedPressable>
        </View>

        {/* Progress bar at bottom edge */}
        <View style={styles.progressContainer}>
          <Animated.View style={[styles.progressBar, progressAnimatedStyle]} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 8,
    marginBottom: 4,
    borderRadius: 8,
    backgroundColor: '#282828',
    overflow: 'hidden',
    // Subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  artworkContainer: {
    position: 'relative',
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 4,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  trackTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  sourceLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginLeft: 4,
  },
  separator: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
    marginHorizontal: 4,
  },
  artistName: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    flex: 1,
  },
  qualityBadge: {
    color: '#8B5CF6',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressContainer: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#8B5CF6',
  },
});
