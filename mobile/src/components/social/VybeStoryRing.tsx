import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Play } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { VybeStory } from '@/types/socialActivity';

const RING = 76;
const INNER = 68;

type Props = {
  story: VybeStory;
  onPress: () => void;
};

export function VybeStoryRing({ story, onPress }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!story.hasUnviewedShare) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [story.hasUnviewedShare, pulse]);

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={styles.wrap}
    >
      <LinearGradient
        colors={['#8B5CF6', '#D946EF', '#FF00FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientRing}
      >
        <View style={styles.innerPad}>
          {story.avatarUrl ? (
            <Image source={{ uri: story.avatarUrl }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.initial}>{story.name.charAt(0)}</Text>
            </View>
          )}
        </View>
      </LinearGradient>
      {story.hasUnviewedShare ? (
        <Animated.View style={[styles.playBadge, { transform: [{ scale: pulse }] }]}>
          <Play size={11} color="#0A0A0A" fill="#0A0A0A" style={{ marginLeft: 1 }} />
        </Animated.View>
      ) : null}
      <Text style={styles.name} numberOfLines={1}>
        {story.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: RING + 8,
    alignItems: 'center',
    marginRight: 14,
  },
  gradientRing: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerPad: {
    width: INNER,
    height: INNER,
    borderRadius: INNER / 2,
    backgroundColor: '#000000',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: INNER - 4,
    height: INNER - 4,
    borderRadius: (INNER - 4) / 2,
    backgroundColor: '#141414',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 22,
    fontWeight: '800',
  },
  playBadge: {
    position: 'absolute',
    top: 52,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
  },
  name: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '600',
    maxWidth: RING + 12,
    textAlign: 'center',
  },
});
