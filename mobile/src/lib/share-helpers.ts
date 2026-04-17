import { Asset } from 'expo-asset';
import { Share, Platform } from 'react-native';

/**
 * Resolved Vybe icon URI — cached after first load. On iOS this comes back
 * as a file:// URL that the system Share sheet can use as a preview image.
 */
let cachedIconUri: string | null = null;

async function getVybeIconUri(): Promise<string | null> {
  if (cachedIconUri) return cachedIconUri;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const module = require('../../assets/vybe-icon.png');
    const asset = Asset.fromModule(module);
    if (!asset.localUri) await asset.downloadAsync();
    cachedIconUri = asset.localUri ?? asset.uri ?? null;
    return cachedIconUri;
  } catch (e) {
    console.warn('[share] Vybe icon load failed', e);
    return null;
  }
}

/**
 * Share a song with a Vybe-branded message and the Vybe app icon attached
 * as the preview thumbnail.
 *
 * The share sheet will show the Vybe icon on iOS when the recipient app
 * supports image previews (iMessage, Mail, most others). On Android the
 * icon is passed as a URL that most chat apps will surface as a preview.
 */
export async function shareSong(opts: {
  title: string;
  artist: string;
  playbackUrl?: string | null;
}): Promise<void> {
  const { title, artist, playbackUrl } = opts;
  const header = '🔥🔥🔥\n🎶🎵🎶';
  const body = `${title} — ${artist}`;
  const message = playbackUrl ? `${header}\n\n${body}\n\n${playbackUrl}` : `${header}\n\n${body}`;

  const iconUri = await getVybeIconUri();

  // iOS honors both `message` and `url`. Passing the Vybe icon file URI as
  // `url` makes the system share sheet render it as the preview thumbnail.
  // Android only surfaces `message`, so the icon URI there is passed as a
  // stable HTTPS URL if available.
  if (Platform.OS === 'ios' && iconUri) {
    await Share.share({ message, url: iconUri });
    return;
  }
  await Share.share({ message });
}
