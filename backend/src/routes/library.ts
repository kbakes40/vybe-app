import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { prisma } from "../prisma";
import { auth } from "../auth";

export const libraryRouter = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

// Schema for a single track in the sync payload
const trackSchema = z.object({
  trackId: z.string(),
  title: z.string(),
  artist: z.string(),
  artwork: z.string().nullable().optional(),
  duration: z.number().int().default(0),
  source: z.enum(["youtube_music", "soundcloud", "youtube"]),
  sourceId: z.string(),
  fileFormat: z.string().nullable().optional(),
});

const syncSchema = z.object({
  tracks: z.array(trackSchema),
});

// POST /api/library/sync — upsert an array of tracks for the authenticated user
libraryRouter.post("/sync", zValidator("json", syncSchema), async (c) => {
  const user = c.get("user");
  if (!user) return c.body(null, 401);

  const { tracks } = c.req.valid("json");

  const results = await Promise.all(
    tracks.map((track) =>
      prisma.libraryTrack.upsert({
        where: {
          userId_trackId: {
            userId: user.id,
            trackId: track.trackId,
          },
        },
        update: {
          title: track.title,
          artist: track.artist,
          artwork: track.artwork ?? null,
          duration: track.duration,
          source: track.source,
          sourceId: track.sourceId,
          fileFormat: track.fileFormat ?? null,
        },
        create: {
          userId: user.id,
          trackId: track.trackId,
          title: track.title,
          artist: track.artist,
          artwork: track.artwork ?? null,
          duration: track.duration,
          source: track.source,
          sourceId: track.sourceId,
          fileFormat: track.fileFormat ?? null,
        },
      })
    )
  );

  return c.json({ data: { synced: results.length } });
});

// GET /api/library/restore — return all saved tracks for the authenticated user
libraryRouter.get("/restore", async (c) => {
  const user = c.get("user");
  if (!user) return c.body(null, 401);

  const tracks = await prisma.libraryTrack.findMany({
    where: { userId: user.id },
    orderBy: { savedAt: "desc" },
  });

  return c.json({ data: tracks });
});

// DELETE /api/library/track/:trackId — remove a single track from the user's library
libraryRouter.delete("/track/:trackId", async (c) => {
  const user = c.get("user");
  if (!user) return c.body(null, 401);

  const trackId = c.req.param("trackId");

  try {
    await prisma.libraryTrack.delete({
      where: {
        userId_trackId: {
          userId: user.id,
          trackId,
        },
      },
    });

    return c.json({ data: { deleted: true } });
  } catch (e: any) {
    // Prisma P2025 = record not found
    if (e?.code === "P2025") {
      return c.json(
        { error: { message: "Track not found in library", code: "NOT_FOUND" } },
        404
      );
    }
    throw e;
  }
});
