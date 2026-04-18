import React from 'react';
import {
  InputAccessoryView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Keyboard,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { VYBE_INPUT_ACCESSORY_ID } from '@/lib/shadowInput';

/**
 * iOS keyboard accessory — Done dismisses the keyboard with light haptic on touch-down.
 */
export function ShadowInputAccessory() {
  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView nativeID={VYBE_INPUT_ACCESSORY_ID}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Done"
          hitSlop={14}
          style={styles.donePressable}
          onPressIn={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            Keyboard.dismiss();
          }}
        >
          <Text style={styles.doneLabel}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#FFFFFF15',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    minHeight: 44,
  },
  donePressable: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  doneLabel: {
    color: '#FF00FF',
    fontSize: 17,
    fontWeight: '800',
  },
});
