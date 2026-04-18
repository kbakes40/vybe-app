import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Crown, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { VybePlusWordmark } from '@/components/VybePlusWordmark';

const AD_DURATION_SECONDS = 5;

export function AdBreakOverlay() {
  const showAdBreak = useSubscriptionStore(s => s.showAdBreak);
  const dismissAd = useSubscriptionStore(s => s.dismissAd);
  const skipsRemaining = useSubscriptionStore(s => s.skipsRemaining);
  const router = useRouter();
  const [countdown, setCountdown] = useState(AD_DURATION_SECONDS);

  useEffect(() => {
    if (!showAdBreak) {
      setCountdown(AD_DURATION_SECONDS);
      return;
    }

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          dismissAd();
          return AD_DURATION_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showAdBreak, dismissAd]);

  if (!showAdBreak) return null;

  const remaining = skipsRemaining;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        {/* Countdown dismiss */}
        <View style={{ position: 'absolute', top: 60, right: 24 }}>
          {countdown > 0 ? (
            <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '700' }}>{countdown}</Text>
            </View>
          ) : (
            <Pressable onPress={dismissAd} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} color="#fff" />
            </Pressable>
          )}
        </View>

        {/* Ad content — upsell to Vybe+ */}
        <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(139,92,246,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <Crown size={40} color="#8B5CF6" />
        </View>

        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 8 }}>
          Enjoying the vybe?
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 8 }}>
          Upgrade to Vybe+ for ad-free listening, unlimited skips, and high quality audio.
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, textAlign: 'center', marginBottom: 32 }}>
          {remaining > 0 ? `${remaining} skip${remaining === 1 ? '' : 's'} remaining today` : 'No skips remaining today'}
        </Text>

        {/* Upgrade button */}
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            dismissAd();
            router.push('/(app)/your-plan');
          }}
          style={{ width: '100%', borderRadius: 28, overflow: 'hidden', marginBottom: 16 }}
        >
          <LinearGradient
            colors={['#8B5CF6', '#6366F1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ height: 52, alignItems: 'center', justifyContent: 'center' }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>Try </Text>
              <VybePlusWordmark variant="inline" vybeColor="#fff" plusColor="#fff" />
            </View>
          </LinearGradient>
        </Pressable>

        <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
          Ad closes in {countdown}s
        </Text>
      </View>
    </Modal>
  );
}
