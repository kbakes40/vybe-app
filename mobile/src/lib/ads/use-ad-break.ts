/**
 * Advertising is fully disabled in this build.
 * - No expo-ads-admob / react-native-google-mobile-ads initialization.
 * - No in-app “ad break” timers or UI (removed from Now Playing).
 *
 * Re-enable only after adding an SDK and explicit product approval.
 */
export const ADS_ENABLED = false;

/** @deprecated Use ADS_ENABLED — kept so any stale imports fail closed. */
export const ADS_PAUSED = true;
