import React from 'react';
import { View, Text } from 'react-native';
import { cn } from '@/lib/cn';

interface FreePDSourceBadgeProps {
  size?: 'small' | 'medium';
  className?: string;
}

/**
 * FreePD source badge - indicates content from FreePD (royalty-free)
 * Green color represents free/open content
 */
export function FreePDSourceBadge({ size = 'small', className }: FreePDSourceBadgeProps) {
  const isSmall = size === 'small';

  return (
    <View
      className={cn(
        'flex-row items-center rounded',
        isSmall ? 'px-1.5 py-0.5' : 'px-2 py-1',
        className
      )}
      style={{ backgroundColor: '#4CAF50' }}
    >
      <Text
        className={cn(
          'text-white font-semibold',
          isSmall ? 'text-[9px]' : 'text-xs'
        )}
      >
        FreePD
      </Text>
    </View>
  );
}
