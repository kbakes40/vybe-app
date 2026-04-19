import { Hono } from "hono";
import { searchSoundCloud } from "./soundcloud";
import { searchYouTube } from "../services/youtubeService";
import type { YouTubeDiscoverResult } from "../types/discover";

const searchRouter = new Hono();

type ScRow = Awaited<ReturnType<typeof searchSoundCloud>>[number];

/** Prefer full-length streams; dedupe artist+title; cap for “top of feed” UI. */
function rankSoundCloudForUi(rows: ScRow[], limit: number): ScRow[] {
  const seen = new Set<string>();
  const scored = [...rows]
    .filter((r) => r.soundcloudUrl?.includes("soundcloud.com"))
    .map((r) => {
      const dur = typeof r.duration === "number" ? r.duration : 0;
      const score = dur >= 120 ? dur + 500 : dur >= 45 ? dur + 100 : dur;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);

  const out: ScRow[] = [];
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
 * GET /api/search/global?q=…
 * SoundCloud-first unified search: top slots are ranked SC streams; YouTube rows are vault-labelled.
 */
searchRouter.get("/global", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ error: { message: "Missing q parameter", code: "MISSING_Q" } }, 400);

  const maxSc = Math.min(parseInt(c.req.query("maxSc") ?? "18", 10), 25);

  const scRows = await searchSoundCloud(q, maxSc).catch((e) => {
    console.error("[search/global] SoundCloud:", e);
    return [] as ScRow[];
  });

  const soundcloudTop = rankSoundCloudForUi(scRows, 10);
  const soundcloudRest = scRows.filter(
    (r) => !soundcloudTop.some((t) => t.trackId === r.trackId && t.soundcloudUrl === r.soundcloudUrl),
  );

  return c.json({
    data: {
      soundcloudTop,
      soundcloudRest,
      vaultTracks: [],
      vaultDeferred: true,
    },
  });
});

/**
 * GET /api/search/global/vault?q=…
 * Lazy vault (YouTube Data API) results — call after /global so SoundCloud rows are not blocked.
 */
searchRouter.get("/global/vault", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ error: { message: "Missing q parameter", code: "MISSING_Q" } }, 400);

  const maxVault = Math.min(parseInt(c.req.query("maxVault") ?? "16", 10), 25);
  const ytQuery = `${q} music`;

  const ytRows = await searchYouTube(ytQuery, maxVault).catch(() => [] as YouTubeDiscoverResult[]);

  const vaultTracks = ytRows.map((v) => ({
    ...v,
    resultKind: "vault_track" as const,
    vaultLabel: "Vault Track",
    recoveryHint: "May use longer Machined Recovery (PO-token / CDN)",
  }));

  return c.json({ data: { vaultTracks } });
});

/**
 * GET /api/search/sc-match?q=…
 * Best-effort SoundCloud row for title/artist (used by mobile before YouTube resolve + on vault errors).
 */
searchRouter.get("/sc-match", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q || q.length < 2) return c.json({ data: null });

  try {
    const rows = await searchSoundCloud(q, 12);
    const ranked = rankSoundCloudForUi(rows, 5);
    const best = ranked[0] ?? null;
    return c.json({ data: best });
  } catch (e) {
    console.error("[search/sc-match]", e);
    return c.json({ data: null });
  }
});

export { searchRouter };
