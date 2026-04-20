import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import {
  BUILD_COMMIT,
  BUILD_BRANCH,
  BUILD_BUNDLED_AT,
} from '@/constants/buildInfo.generated';

function formatBundledAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${mi}`;
}

export function BuildInfoLine() {
  const line = useMemo(() => {
    const version = Application.nativeApplicationVersion ?? '?';
    const build = Application.nativeBuildVersion ?? '?';
    return `v${version} (${build}) · ${BUILD_COMMIT} · ${BUILD_BRANCH} · ${formatBundledAt(BUILD_BUNDLED_AT)}`;
  }, []);

  const onLongPress = async () => {
    await Clipboard.setStringAsync(line);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <Pressable onLongPress={onLongPress} hitSlop={8} style={styles.wrap}>
      <View>
        <Text style={styles.text} numberOfLines={1} ellipsizeMode="middle">
          {line}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    opacity: 0.45,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },
});
