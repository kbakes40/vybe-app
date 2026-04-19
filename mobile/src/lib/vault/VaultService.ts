import { fetchRadioParadiseNowPlaying } from '@/lib/radioParadiseApi';

function backendBase(): string {
  return (process.env.EXPO_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
}

type VaultRow = { videoId?: string };

/**
 * Background vault pipeline: YouTube search for `artist` + `title`, then
 * fire-and-forget `POST /api/vault/save` when a video id is found.
 */
export function queueRadioParadiseVaultFromMetadata(artist: string, title: string): void {
  const q = `${artist} ${title}`.trim();
  if (q.length < 2) return;

  queueMicrotask(() => {
    void (async () => {
      try {
        const base = backendBase();
        if (!base) return;

        const r = await fetch(`${base}/api/search/global/vault?q=${encodeURIComponent(q)}`);
        if (!r.ok) return;
        const j = (await r.json()) as { data?: { vaultTracks?: VaultRow[] } };
        const rows = j?.data?.vaultTracks;
        const vid = rows?.[0]?.videoId?.trim();
        if (!vid || !/^[a-zA-Z0-9_-]{6,32}$/.test(vid)) return;

        await fetch(`${base}/api/vault/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: vid, title, artist }),
        }).catch(() => {});
      } catch {
        /* background — never throw */
      }
    })();
  });
}

/**
 * Heart: read current on-air metadata from Radio Paradise, then queue vault
 * search + offline save for the best YouTube match.
 */
export function vaultRadioParadiseCurrentTrackFromApi(): void {
  void (async () => {
    const meta = await fetchRadioParadiseNowPlaying();
    if (!meta) return;
    queueRadioParadiseVaultFromMetadata(meta.artist, meta.title);
  })();
}

/** Alias — vault any artist/title pair (e.g. non–Radio Paradise relays). */
export const queueVaultFromArtistTitle = queueRadioParadiseVaultFromMetadata;
