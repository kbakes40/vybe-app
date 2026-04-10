import React from 'react';
import { Pressable } from 'react-native';
import { Download } from 'lucide-react-native';

interface DownloadButtonProps {
  trackId?: string;
  size?: number;
}

export function DownloadButton({ trackId, size = 24 }: DownloadButtonProps) {
  return (
    <Pressable onPress={() => {}}>
      <Download size={size} color="#8B5CF6" />
    </Pressable>
  );
}
