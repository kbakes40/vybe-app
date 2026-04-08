import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useUserSettingsStore } from '@/stores/userSettingsStore';
import { VybeIcon } from '@/components/VybeIcon';

interface ProfileAvatarProps {
  size?: number;
  onPress?: () => void;
  allowUpload?: boolean;
}

export function ProfileAvatar({ size = 36, onPress, allowUpload = false }: ProfileAvatarProps) {
  const profileImage = useUserSettingsStore(s => s.profileImage);
  const setProfileImage = useUserSettingsStore(s => s.setProfileImage);

  const handlePress = async () => {
    if (!allowUpload) {
      onPress?.();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      onPress?.();
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]?.uri) {
      setProfileImage(result.assets[0].uri);
    }

    onPress?.();
  };

  const borderRadius = size / 2;

  return (
    <Pressable onPress={handlePress} hitSlop={8}>
      {profileImage ? (
        <Image
          source={{ uri: profileImage }}
          style={{ width: size, height: size, borderRadius }}
          contentFit="cover"
        />
      ) : (
        <VybeIcon size={size} backgroundColor="#2D1B69" />
      )}
    </Pressable>
  );
}
