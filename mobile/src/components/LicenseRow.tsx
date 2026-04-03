import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { ChevronRight, Scale } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { cn } from '@/lib/cn';
import { useVybePopup } from '@/components/VybePopup';

interface LicenseRowProps {
  licenseName: string;
  licenseUrl?: string;
  className?: string;
}

/**
 * License information row for track detail screens
 * Displays license name and opens license URL when tapped
 */
export function LicenseRow({ licenseName, licenseUrl, className }: LicenseRowProps) {
  const { showVybePopup } = useVybePopup();
  const isInteractive = Boolean(licenseUrl);

  const handlePress = async () => {
    if (!licenseUrl) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const canOpen = await Linking.canOpenURL(licenseUrl);
      if (canOpen) {
        await Linking.openURL(licenseUrl);
      } else {
        showVybePopup({
          title: 'Unable to open link',
          message: 'Could not open the license URL.',
          type: 'error',
        });
      }
    } catch (error) {
      showVybePopup({
        title: 'Error',
        message: 'Failed to open the license link.',
        type: 'error',
      });
    }
  };

  const content = (
    <View
      className={cn(
        'flex-row items-center justify-between py-4 px-4 bg-white/5 rounded-xl',
        className
      )}
    >
      {/* Left side: icon and label */}
      <View className="flex-row items-center flex-1">
        <View className="w-10 h-10 bg-[#4CAF50]/20 rounded-full items-center justify-center mr-3">
          <Scale size={20} color="#4CAF50" />
        </View>
        <View className="flex-1">
          <Text className="text-white/60 text-xs uppercase tracking-wider mb-0.5">
            License
          </Text>
          <Text className="text-white font-medium" numberOfLines={1}>
            {licenseName}
          </Text>
        </View>
      </View>

      {/* Right side: chevron indicator if interactive */}
      {isInteractive ? (
        <ChevronRight size={20} color="rgba(255,255,255,0.4)" />
      ) : null}
    </View>
  );

  if (isInteractive) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => ({
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}
