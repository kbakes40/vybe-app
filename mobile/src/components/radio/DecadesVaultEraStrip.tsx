import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DECADES_ERA_ORDER, type DecadesEraTab } from '@/lib/GlobalRadioClient';
import { MACHINED_CYAN, NAV_BAR_PURPLE } from '@/constants/machinedTheme';

const ERA_LABEL: Record<DecadesEraTab, string> = {
  global: 'GLOBAL',
  vault_70s: '70S',
  vault_80s: '80S',
  vault_90s: '90S',
  vault_00s: '00S',
  vault_modern: 'MODERN',
};

export function DecadesVaultEraStrip({
  selected,
  onSelect,
}: {
  selected: DecadesEraTab;
  onSelect: (id: DecadesEraTab) => void;
}) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {DECADES_ERA_ORDER.map((id) => {
          const sel = id === selected;
          return (
            <Pressable
              key={id}
              onPress={() => {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                onSelect(id);
              }}
              style={[styles.pill, sel && styles.pillActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: sel }}
              accessibilityLabel={ERA_LABEL[id]}
            >
              <Text style={[styles.txt, sel ? styles.txtActive : styles.txtIdle]} numberOfLines={1}>
                {ERA_LABEL[id]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    marginBottom: 4,
  },
  scroll: {
    gap: 8,
    paddingVertical: 2,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    marginRight: 8,
  },
  pillActive: {
    borderColor: MACHINED_CYAN,
    backgroundColor: 'rgba(0,255,255,0.08)',
  },
  txt: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  txtIdle: {
    color: NAV_BAR_PURPLE,
  },
  txtActive: {
    color: MACHINED_CYAN,
  },
});
