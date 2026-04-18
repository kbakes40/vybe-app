import React from 'react';
import { TextInput, TextInputProps, StyleSheet, Platform } from 'react-native';
import {
  SHADOW_PLACEHOLDER,
  SHADOW_SELECTION,
  VYBE_INPUT_ACCESSORY_ID,
} from '@/lib/shadowInput';

/**
 * VybeTextInput — Shadow OLED keyboard + magenta cursor + iOS Done accessory.
 * Prefer this over raw `TextInput` for consistent styling.
 */

export interface VybeTextInputProps extends Omit<TextInputProps, 'keyboardAppearance'> {
  variant?: 'default' | 'search' | 'minimal';
  /** Omit iOS `InputAccessoryView` link (e.g. rare multiline-only cases). */
  hideInputAccessory?: boolean;
}

export const VybeTextInput = React.forwardRef<TextInput, VybeTextInputProps>(function VybeTextInput(
  {
    style,
    placeholderTextColor,
    variant = 'default',
    hideInputAccessory = false,
    selectionColor,
    cursorColor,
    ...props
  },
  ref,
) {
  const variantStyles = {
    default: styles.default,
    search: styles.search,
    minimal: styles.minimal,
  };

  const accessoryId =
    !hideInputAccessory && Platform.OS === 'ios' ? VYBE_INPUT_ACCESSORY_ID : undefined;

  return (
    <TextInput
      ref={ref}
      keyboardAppearance="dark"
      placeholderTextColor={placeholderTextColor ?? SHADOW_PLACEHOLDER}
      selectionColor={selectionColor ?? SHADOW_SELECTION}
      cursorColor={cursorColor ?? SHADOW_SELECTION}
      inputAccessoryViewID={accessoryId}
      {...props}
      style={[variantStyles[variant], style]}
    />
  );
});

const styles = StyleSheet.create({
  default: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 16,
  },
  search: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 0,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 16,
  },
  minimal: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 12,
    paddingHorizontal: 0,
    color: '#FFFFFF',
    fontSize: 16,
  },
});

export default VybeTextInput;
