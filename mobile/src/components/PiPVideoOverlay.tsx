import React from 'react';
import { View, Text, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { X, Play, Pause } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlaybackController } from '@/stores/playbackController';
import { create } from 'zustand';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PIP_WIDTH = SCREEN_WIDTH * 0.4;
const PIP_HEIGHT = PIP_WIDTH * (9 / 16);

interface PiPState {
  isDocked: boolean;
  dock: () => void;
  undock: () => void;
}

export const usePiPStore = create<PiPState>((set) => ({
  isDocked: false,
  dock: () => set({ isDocked: true }),
  undock: () => set({ isDocked: false }),
}));

export function PiPVideoOverlay() {
  const insets = useSafeAreaInsets();
  const isDocked = usePiPStore(s => s.isDocked);
  const undock = usePiPStore(s => s.undock);
  const currentTrack = usePlaybackController(s => s.currentTrack);
  const playbackState = usePlaybackController(s => s.playbackState);
  const play = usePlaybackController(s => s.play);
  const pause = usePlaybackController(s => s.pause);
  const currentSource = usePlaybackController(s => s.currentSource);

  const isPlaying = playbackState === 'playing';
  const isVideo = currentSource === 'youtube';

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 100) {
        runOnJS(undock)();
      }
      translateX.value = withSpring(0, { damping: 15 });
      translateY.value = withSpring(0, { damping: 15 });
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  if (!isDocked || !currentTrack || !isVideo) return null;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          animStyle,
          {
            position: 'absolute',
            bottom: 140 + insets.bottom,
            right: 12,
            width: PIP_WIDTH,
            height: PIP_HEIGHT,
            borderRadius: 12,
            overflow: 'hidden',
            backgroundColor: '#000',
            shadowColor: '#00E5CC',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 250000,
            borderWidth: 1,
            borderColor: 'rgba(0,229,204,0.3)',
            zIndex: 250000,
          },
        ]}
      >
        <Image
          source={{ uri: currentTrack.artwork }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />

        {/* Controls overlay */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (isPlaying) pause();
              else play();
            }}
            style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}
          >
            {isPlaying ? (
              <Pause size={16} color="#fff" fill="#fff" />
            ) : (
              <Play size={16} color="#fff" fill="#fff" style={{ marginLeft: 1 }} />
            )}
          </Pressable>
        </View>

        {/* Close button */}
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); undock(); }}
          style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' }}
        >
          <X size={12} color="#fff" />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}
