/**
 * OLED_ROOT_FIX — the accent-washed melt (black → cyan@8% → cyan@4% →
 * transparent) rendered as a blue/grey bar over the status-bar area on
 * 15 Pro Max (Louis 14 Pro Max already returned null). Unified: disabled
 * on every device so the top reads as pure OLED black above the pill.
 * Keep the exported symbol so existing mounts in `_layout.tsx` stay valid.
 */
export function DynamicIslandTopFade() {
  return null;
}
