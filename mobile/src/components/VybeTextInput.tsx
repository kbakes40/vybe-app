import React from 'react';
import { TextInput, TextInputProps, StyleSheet } from 'react-native';

/**
 * VybeTextInput - Enforces dark mode keyboard and styling across the app
 *
 * ALL TextInputs in the app MUST use this component to ensure:
 * 1. Dark keyboard appearance on iOS
 * 2. Consistent dark styling
 * 3. Proper placeholder contrast
 */

interface VybeTextInputProps extends Omit<TextInputProps, 'keyboardAppearance'> {
  // Variant for different contexts
  variant?: 'default' | 'search' | 'minimal';
}

export function VybeTextInput({
  style,
  placeholderTextColor,
  variant = 'default',
  ...props
}: VybeTextInputProps) {
  const variantStyles = {
    default: styles.default,
    search: styles.search,
    minimal: styles.minimal,
  };

  return (
    <TextInput
      keyboardAppearance="dark"
      placeholderTextColor={placeholderTextColor ?? 'rgba(255,255,255,0.45)'}
      selectionColor="#9333EA"
      cursorColor="#9333EA"
      {...props}
      style={[variantStyles[variant], style]}
    />
  );
}

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
