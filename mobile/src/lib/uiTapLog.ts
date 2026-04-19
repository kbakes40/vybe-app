/** Structured client log for discover / home QA (grep `[UI_TAP]` in device logs). */
export function logUiTap(sectionTitle: string, actionType: string): void {
  const s = sectionTitle.slice(0, 48);
  const a = actionType.slice(0, 48);
  console.log(`[UI_TAP] Section: ${s} | Action: ${a}`);
}
