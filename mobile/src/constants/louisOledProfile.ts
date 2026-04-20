import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { EXPANDED_PILL_MAX_HEIGHT_PT } from '@/constants/pillIslandGeometry';
import { TAB_SCREEN_TOP_INSET_BELOW_PILL_PT } from '@/constants/Layout';

/**
 * iPhone 14 Pro Max — internal codename "Louis" (see settings / accounts copy).
 * OLED infinite-black + pill displacement + blur treatments are gated here only.
 */
export function isLouisDevice(): boolean {
  if (Platform.OS !== 'ios') return false;
  const name = Device.modelName ?? '';
  const id = Device.modelId ?? '';
  return name === 'iPhone 14 Pro Max' || id === 'iPhone15,3';
}

/**
 * Tab list header offset while the pill is collapsed — chosen so
 * `collapsed + (expandedMax − playingBar)` matches {@link TAB_SCREEN_TOP_INSET_BELOW_PILL_PT}.
 */
export const LOUIS_COLLAPSED_TOP_EXTRA_PT =
  TAB_SCREEN_TOP_INSET_BELOW_PILL_PT - (EXPANDED_PILL_MAX_HEIGHT_PT - 44);

/** Top-of-viewport fade band (pt) — scroll content dissolves into OLED before the pill. */
export const LOUIS_SCROLL_TOP_FADE_HEIGHT_PT = 20;
