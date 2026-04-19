import { searchSoundCloud, resolveSoundcloudPageStreamUrl } from "../routes/soundcloud";
import { getVideoInfoViaApi } from "../services/youtubeService";

export type HealedStreamPayload = {
  streamUrl: string;
  soundcloudUrl: string;
  scTrackId: string;
  title: string;
  artist: string;
  artwork: string;
  duration: number;
};

/** yt-dlp / CDN / vault failures that warrant a SoundCloud auto-heal attempt. */
export function isVaultFailureLike(message: string, httpStatus?: number): boolean {
  if (httpStatus === 403 || httpStatus === 404 || httpStatus === 502 || httpStatus === 503) {
    return true;
  }
  const m = message.toLowerCase();
  return (
    m.includes("403") ||
    m.includes("404") ||
    m.includes("502") ||
    m.includes("503") ||
    m.includes("http 403") ||
    m.includes("http 404") ||
    m.includes("http 502") ||
    m.includes("unavailable") ||
    m.includes("private video") ||
    m.includes("video unavailable") ||
    m.includes("sign in to confirm") ||
    m.includes("not a bot") ||
    m.includes("requested format is not available") ||
    m.includes("no video formats") ||
    m.includes("unable to download")
  );
}

async function fetchOembedTitleChannel(
  videoId: string,
): Promise<{ title: string; channel: string } | null> {
  try {
    const u = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const r = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { title?: string; author_name?: string };
    const title = typeof j.title === "string" ? j.title.trim() : "";
    const channel = typeof j.author_name === "string" ? j.author_name.trim() : "";
    if (!title) return null;
    return { title, channel: channel || "Unknown Artist" };
  } catch {
    return null;
  }
}

function rankSoundCloudRows(
  rows: Awaited<ReturnType<typeof searchSoundCloud>>,
  limit: number,
): Awaited<ReturnType<typeof searchSoundCloud>> {
  const seen = new Set<string>();
  const scored = [...rows]
    .filter((r) => r.soundcloudUrl?.includes("soundcloud.com"))
    .map((r) => {
      const dur = typeof r.duration === "number" ? r.duration : 0;
      const score = dur >= 120 ? dur + 500 : dur >= 45 ? dur + 100 : dur;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);

  const out: Awaited<ReturnType<typeof searchSoundCloud>> = [];
  for (const { r } of scored) {
    const key = `${r.artist}|${r.title}`.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Best-effort SoundCloud stream + metadata for a failed YouTube vault id.
 */
export async function tryHealYoutubeToSoundcloud(
  videoId: string,
  titleHint?: string,
  artistHint?: string,
): Promise<HealedStreamPayload | null> {
  let title = titleHint?.trim() ?? "";
  let artist = artistHint?.trim() ?? "";

  if (!title || !artist) {
    const api = await getVideoInfoViaApi(videoId);
    if (api) {
      title = title || (api.title?.trim() ?? "");
      artist = artist || (api.channel?.trim() ?? "");
    }
  }
  if (!title || !artist) {
    const oe = await fetchOembedTitleChannel(videoId);
    if (oe) {
      title = title || oe.title;
      artist = artist || oe.channel;
    }
  }

  const q = `${artist} ${title}`
    .replace(/\s*\(official.*?\)/gi, "")
    .replace(/\s*\[official.*?\]/gi, "")
    .trim();
  if (q.length < 4) return null;

  try {
    const rows = await searchSoundCloud(q, 14);
    const ranked = rankSoundCloudRows(rows, 5);
    const best = ranked[0];
    if (!best?.soundcloudUrl) return null;
    const streamUrl = await resolveSoundcloudPageStreamUrl(best.soundcloudUrl);
    if (!streamUrl.startsWith("http")) return null;
    return {
      streamUrl,
      soundcloudUrl: best.soundcloudUrl,
      scTrackId: `sc-${best.trackId}`,
      title: best.title,
      artist: best.artist,
      artwork: best.artwork,
      duration: Math.max(0, Math.floor(best.duration ?? 0)),
    };
  } catch (e) {
    console.warn("[Vault Heal] SoundCloud path failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
