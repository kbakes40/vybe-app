import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';

interface HouseAdProps {
  brandName: string;
  collabArtist?: string;
  productName: string;
  tagline: string;
  imageUrl: string;
  ctaLabel: string;
  ctaUrl: string;
  badgeColor?: string;
}

export function HouseAdCard({
  brandName,
  collabArtist,
  productName,
  tagline,
  imageUrl,
  ctaLabel,
  ctaUrl,
  badgeColor = '#F97316',
}: HouseAdProps) {
  return (
    <View style={{
      marginHorizontal: 20,
      marginVertical: 12,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.05)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.1)',
      overflow: 'hidden',
    }}>
      {/* Image */}
      <View style={{ height: 180, overflow: 'hidden' }}>
        <Image
          source={{ uri: imageUrl }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
        <View style={{
          position: 'absolute',
          top: 10,
          right: 10,
          backgroundColor: badgeColor,
          borderRadius: 4,
          paddingHorizontal: 8,
          paddingVertical: 4,
        }}>
          <Text style={{ color: '#000', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>EXCLUSIVE DROP</Text>
        </View>
      </View>

      {/* Content */}
      <View style={{ padding: 14 }}>
        <Text style={{ color: badgeColor, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 }}>
          {brandName}{collabArtist ? ` x ${collabArtist}` : null}
        </Text>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 4 }}>{productName}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 18, marginBottom: 14 }} numberOfLines={2}>{tagline}</Text>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            Linking.openURL(ctaUrl);
          }}
          style={{
            backgroundColor: '#fff',
            borderRadius: 8,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#000', fontSize: 14, fontWeight: '700' }}>{ctaLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export const HOUSE_ADS = [
  {
    brandName: 'STAK',
    productName: 'Performance Gold Whey',
    tagline: 'Fuel your vybe with the new performance-driven blend.',
    imageUrl: 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=600&h=300&fit=crop',
    ctaLabel: 'Get Early Access',
    ctaUrl: 'https://example.com/stak',
    badgeColor: '#F97316',
  },
  {
    brandName: 'Krak Coffee',
    productName: 'High-Caffeine Cold Brew',
    tagline: 'Maximum focus. Zero compromise. Krak your morning.',
    imageUrl: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&h=300&fit=crop',
    ctaLabel: 'Shop Now',
    ctaUrl: 'https://example.com/krak',
    badgeColor: '#EF4444',
  },
];
