import { Platform } from 'react-native';

export const VYBE_INPUT_ACCESSORY_ID = 'vybe-shadow-input-accessory';

export const SHADOW_PLACEHOLDER = 'rgba(255,255,255,0.3)';

export const SHADOW_SELECTION = '#FF00FF';

/** Spread onto raw `TextInput` for Shadow OLED keyboard + cursor + iOS accessory bar. */
export const SHADOW_TEXT_INPUT_DEFAULTS = {
  keyboardAppearance: 'dark' as const,
  placeholderTextColor: SHADOW_PLACEHOLDER,
  selectionColor: SHADOW_SELECTION,
  cursorColor: SHADOW_SELECTION,
  ...(Platform.OS === 'ios' ? { inputAccessoryViewID: VYBE_INPUT_ACCESSORY_ID } : {}),
};
