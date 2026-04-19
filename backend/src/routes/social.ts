import { Hono } from "hono";

/**
 * Social feed routes — v1 (mock-data backbone).
 *
 * - GET  /api/social/feed   → 10 mock posts (auth-required)
 * - POST /api/social/post   → echoes the new post back (auth-required)
 *
 * Auth is enforced by reading the user populated by the global session
 * middleware in `src/index.ts` (`c.set("user", session.user)`). When a real DB
 * is wired in, swap the mock array for a Drizzle query — the route surface
 * shape (`{ data: SocialPost[] }`) stays the same, so the mobile client does
 * not need to change.
 */

interface SocialPost {
  id: string;
  userId: string;
  username: string;
  avatar?: string;
  text: string;
  trackId?: string;
  trackTitle?: string;
  trackArtist?: string;
  trackArtwork?: string;
  fireCount: number;
  createdAt: string;
}

export const socialRouter = new Hono();

const MOCK_POSTS: SocialPost[] = [
  {
    id: "post_001",
    userId: "u_kanye",
    username: "yeezy",
    avatar: "https://i.pravatar.cc/120?img=12",
    text: "Heartless on repeat. Cold like the booth.",
    trackId: "2EwViQxSJJQ",
    trackTitle: "Heartless",
    trackArtist: "Kanye West",
    trackArtwork: "https://img.youtube.com/vi/2EwViQxSJJQ/hqdefault.jpg",
    fireCount: 1247,
    createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: "post_002",
    userId: "u_anika",
    username: "anika.glow",
    avatar: "https://i.pravatar.cc/120?img=47",
    text: "found this in the Decades Vault, peep this",
    trackId: "9bZkp7q19f0",
    trackTitle: "Gangnam Style",
    trackArtist: "PSY",
    trackArtwork: "https://img.youtube.com/vi/9bZkp7q19f0/hqdefault.jpg",
    fireCount: 312,
    createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
  {
    id: "post_003",
    userId: "u_marc",
    username: "marc",
    avatar: "https://i.pravatar.cc/120?img=58",
    text: "70s analog hit different at 2am",
    trackId: "fJ9rUzIMcZQ",
    trackTitle: "Bohemian Rhapsody",
    trackArtist: "Queen",
    trackArtwork: "https://img.youtube.com/vi/fJ9rUzIMcZQ/hqdefault.jpg",
    fireCount: 894,
    createdAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
  },
  {
    id: "post_004",
    userId: "u_jules",
    username: "julesvibe",
    avatar: "https://i.pravatar.cc/120?img=32",
    text: "added this to fire mix, thank me later",
    trackId: "kXYiU_JCYtU",
    trackTitle: "Numb",
    trackArtist: "Linkin Park",
    trackArtwork: "https://img.youtube.com/vi/kXYiU_JCYtU/hqdefault.jpg",
    fireCount: 421,
    createdAt: new Date(Date.now() - 41 * 60 * 1000).toISOString(),
  },
  {
    id: "post_005",
    userId: "u_dre",
    username: "g.funk",
    avatar: "https://i.pravatar.cc/120?img=15",
    text: "90s g-funk bracket. fight me.",
    fireCount: 188,
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
  {
    id: "post_006",
    userId: "u_lex",
    username: "lex.machined",
    avatar: "https://i.pravatar.cc/120?img=24",
    text: "this scrubber is so smooth",
    fireCount: 73,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "post_007",
    userId: "u_serena",
    username: "serena_b",
    avatar: "https://i.pravatar.cc/120?img=44",
    text: "00s platinum playlist > everything",
    trackId: "JGwWNGJdvx8",
    trackTitle: "Shape of You",
    trackArtist: "Ed Sheeran",
    trackArtwork: "https://img.youtube.com/vi/JGwWNGJdvx8/hqdefault.jpg",
    fireCount: 612,
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "post_008",
    userId: "u_dom",
    username: "domino",
    avatar: "https://i.pravatar.cc/120?img=11",
    text: "shadow sexy is unreal",
    fireCount: 56,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "post_009",
    userId: "u_riv",
    username: "riv.studio",
    avatar: "https://i.pravatar.cc/120?img=63",
    text: "pulled an all-nighter looping this",
    trackId: "hT_nvWreIhg",
    trackTitle: "Counting Stars",
    trackArtist: "OneRepublic",
    trackArtwork: "https://img.youtube.com/vi/hT_nvWreIhg/hqdefault.jpg",
    fireCount: 234,
    createdAt: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "post_010",
    userId: "u_wave",
    username: "wave_capitan",
    avatar: "https://i.pravatar.cc/120?img=9",
    text: "vybe is replacing my main rn",
    fireCount: 1011,
    createdAt: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
  },
];

/** Extra ephemeral posts created in this process via POST /post (mock store). */
const sessionPosts: SocialPost[] = [];

socialRouter.get("/feed", (c) => {
  const user = c.get("user") as { id?: string; name?: string; email?: string } | null;
  if (!user) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Sign in required" } }, 401);
  }
  // Newest-first: session posts on top, then the curated mock set.
  const data: SocialPost[] = [...sessionPosts, ...MOCK_POSTS];
  return c.json({ data });
});

socialRouter.post("/post", async (c) => {
  const user = c.get("user") as { id?: string; name?: string; email?: string } | null;
  if (!user) {
    return c.json({ error: { code: "UNAUTHORIZED", message: "Sign in required" } }, 401);
  }

  let body: { text?: unknown; trackId?: unknown; trackTitle?: unknown; trackArtist?: unknown; trackArtwork?: unknown } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { code: "BAD_JSON", message: "Invalid JSON body" } }, 400);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 500) {
    return c.json(
      { error: { code: "BAD_INPUT", message: "Text must be 1-500 chars" } },
      400,
    );
  }

  const post: SocialPost = {
    id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: user.id ?? "u_self",
    username: (user.name ?? user.email ?? "you").split("@")[0]!.slice(0, 24),
    text,
    trackId: typeof body.trackId === "string" ? body.trackId : undefined,
    trackTitle: typeof body.trackTitle === "string" ? body.trackTitle : undefined,
    trackArtist: typeof body.trackArtist === "string" ? body.trackArtist : undefined,
    trackArtwork: typeof body.trackArtwork === "string" ? body.trackArtwork : undefined,
    fireCount: 0,
    createdAt: new Date().toISOString(),
  };

  // Cap session-only mock store so it doesn't grow unbounded.
  sessionPosts.unshift(post);
  if (sessionPosts.length > 50) sessionPosts.length = 50;

  return c.json({ data: post }, 201);
});
