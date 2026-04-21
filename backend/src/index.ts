import "@vibecodeapp/proxy"; // DO NOT REMOVE OTHERWISE VIBECODE PROXY WILL NOT WORK
import { addExcludedDomains } from "@vibecodeapp/proxy";

// The proxy ships with `amazonaws.com` etc. — routing DB / YouTube / Turso through
// cloudproxy breaks Prisma and the YouTube Data API on Railway (global 500s).
addExcludedDomains([
  "amazonaws.com",
  "rds.amazonaws.com",
  "turso.io",
  "libsql.com",
  "neon.tech",
  "planetscale.com",
  "supabase.co",
  "googleapis.com",
  "google.com",
  "youtube.com",
  "ytimg.com",
  "ggpht.com",
  "github.com",
  "githubusercontent.com",
  "bcbits.com",
]);

import { Hono } from "hono";
// NOTE: `hono/compress` was removed because the Railway runtime here does
// not expose `CompressionStream` as a global, which makes that middleware
// throw `ReferenceError: CompressionStream is not defined` on EVERY request
// (the route-shield masks the user-facing error but the CPU+log cost is
// brutal). Railway's edge already gzips HTTPS responses, so dropping the
// app-level compress is a net win until/unless we polyfill the Web Streams
// API explicitly. If you re-add this, gate it behind `typeof CompressionStream
// !== 'undefined'` and import from `node:stream/web` as a fallback.
import { cors } from "hono/cors";
import "./env";
import { prisma } from "./prisma";
import { ensureYoutubeCookiesFile } from "./lib/youtubeCookies";

ensureYoutubeCookiesFile();
import { auth } from "./auth";
import { sampleRouter } from "./routes/sample";
import { userRouter } from "./routes/user";
import { soundcloudRouter } from "./routes/soundcloud";
import { discoveryRouter } from "./routes/discovery";
import { discoverRouter } from "./routes/discover";
import { freepdRouter } from "./routes/freepd";
import { musicgenRouter } from "./routes/musicgen";
import { youtubeRouter } from "./routes/youtube";
import { spotifyRouter } from "./routes/spotify";
import { appleMusicRouter } from "./routes/appleMusic";
import { vipRouter } from "./routes/vip";
import { libraryRouter } from "./routes/library";
import { socialRouter } from "./routes/social";
import { searchRouter } from "./routes/search";
import { vaultRouter } from "./routes/vault";
import { bandcampRouter } from "./routes/bandcamp";
import { logger } from "hono/logger";
import { routeShield } from "./lib/route-shield";

// Type the Hono app with user/session variables
const app = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

// CORS middleware - validates origin against allowlist
const allowed = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.dev\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecodeapp\.com$/,
  /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/,
  /** Expo dev / LAN — RN often omits Origin; when present it is `exp://…`. */
  /^exp:\/\/.+$/,
];

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      return allowed.some((re) => re.test(origin)) ? origin : null;
    },
    credentials: true,
  })
);

// Logging
app.use("*", logger());

// Auth middleware - populates user/session for all routes
app.use("*", async (c, next) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) {
      c.set("user", null);
      c.set("session", null);
    } else {
      c.set("user", session.user);
      c.set("session", session.session);
    }
  } catch (e) {
    // DB down / misconfigured Turso → still serve public API (YouTube home feed, health, etc.)
    console.error("[session] getSession failed — continuing without user:", e);
    c.set("user", null);
    c.set("session", null);
  }
  await next();
});

// Strip PKCE from Google auth URL before Better Auth processes the proxy.
// Better Auth's Google social provider forces PKCE but Google rejects it from mobile clients.
// We intercept the proxy, strip code_challenge + code_challenge_method from the Google URL,
// then let Better Auth handle the rest (sets oauthState cookie, etc).
app.get("/api/auth/expo-authorization-proxy", async (c) => {
  const authorizationURL = c.req.query("authorizationURL");
  if (authorizationURL) {
    try {
      const googleUrl = new URL(authorizationURL);
      if (googleUrl.hostname.includes("accounts.google.com") && googleUrl.searchParams.has("code_challenge_method")) {
        googleUrl.searchParams.delete("code_challenge");
        googleUrl.searchParams.delete("code_challenge_method");
        // Rebuild request with cleaned URL so Better Auth stores state without PKCE
        const newReqUrl = new URL(c.req.url);
        newReqUrl.searchParams.set("authorizationURL", googleUrl.toString());
        const newReq = new Request(newReqUrl.toString(), {
          method: c.req.method,
          headers: c.req.raw.headers,
        });
        console.log("[PROXY] Stripped PKCE from Google URL, forwarding to Better Auth");
        return auth.handler(newReq);
      }
    } catch {
      // fall through
    }
  }
  return auth.handler(c.req.raw);
});

// On the Google callback, strip code_verifier from the request body before
// Better Auth processes it — since we stripped code_challenge from the auth URL,
// Google never set up PKCE so sending code_verifier would cause a token exchange failure.
app.get("/api/auth/callback/google", async (c) => {
  // Clone the request and pass through — Better Auth handles the state/cookie lookup.
  // The fix is upstream (proxy strips PKCE) so no verifier was stored in state.
  return auth.handler(c.req.raw);
});

// Mount auth handler
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/health", (c) => c.json({ status: "ok" }));

// Get current user
app.get("/api/me", (c) => {
  const user = c.get("user");
  if (!user) return c.body(null, 401);
  return c.json({ data: user });
});

// Route shields — give SoundCloud and Discovery routes a 3s hard deadline
// with last-known-good snapshot fallback. This prevents the 502 storms that
// freeze the home/search/discover rails when an upstream stalls. The shield
// MUST be installed before the router so it can race the handler.
//
// SoundCloud fallbacks are shaped like the various endpoint contracts:
//  - /playlists  → []
//  - /search     → []
//  - /mixes      → []
//  - /playlist-tracks → { tracks: [], playlistTitle: '', thumbnailUrl: '', canonicalUrl: '', playlistId: '' }
// Sending [] for everything else is safe — the mobile client treats null/[]
// the same way and just shows its empty/skeleton state.
app.use("/api/soundcloud/*", routeShield({
  timeoutMs: 3000,
  snapshotTtlMs: 10 * 60 * 1000,
  stableFallback: (c) => {
    const path = new URL(c.req.url).pathname;
    if (path.endsWith("/playlist-tracks")) {
      return {
        tracks: [],
        playlistTitle: "",
        thumbnailUrl: "",
        canonicalUrl: "",
        playlistId: "",
      };
    }
    return [];
  },
}));

// Mirror the shield onto /api/discover/* — instant-onboarding was the 183s
// offender in the latest log (it synchronously awaits buildInstantOnboardingFeed
// which fans out to YouTube+SoundCloud, so when the Data API is exhausted it
// stacks up yt-dlp fallbacks). 3s deadline returns an empty feed and lets the
// mobile client hydrate from cached snapshots / local state.
app.use("/api/discover/*", routeShield({
  timeoutMs: 3000,
  snapshotTtlMs: 10 * 60 * 1000,
  stableFallback: (c) => {
    const path = new URL(c.req.url).pathname;
    if (path.endsWith("/instant-onboarding")) {
      // Shape-compatible with buildInstantOnboardingFeed's inner value; mobile
      // client is tolerant of empty sections / tracks arrays here.
      return { sections: [], tracks: [] };
    }
    if (path.endsWith("/feed")) {
      return { sections: [] };
    }
    if (path.endsWith("/preferences")) {
      return { genres: [], moods: [], favoriteArtists: [] };
    }
    return {};
  },
}));

app.use("/api/discovery/*", routeShield({
  timeoutMs: 3000,
  snapshotTtlMs: 10 * 60 * 1000,
  stableFallback: (c) => {
    const path = new URL(c.req.url).pathname;
    if (path.endsWith("/profile")) {
      return { topGenres: [], topMoods: [], topArtists: [], dna: null };
    }
    if (path.endsWith("/sections")) {
      return [];
    }
    if (path.endsWith("/signal") || path.endsWith("/dislike") || path.endsWith("/hide-artist")) {
      return { ok: true };
    }
    return [];
  },
}));

// Routes
app.route("/api/sample", sampleRouter);
app.route("/api/user", userRouter);
app.route("/api/soundcloud", soundcloudRouter);
app.route("/api/discovery", discoveryRouter);
app.route("/api/discover", discoverRouter);
app.route("/api/freepd", freepdRouter);
app.route("/api/musicgen", musicgenRouter);
app.route("/api/youtube", youtubeRouter);
app.get("/api/youtube-test", (c) => c.json({ mounted: true }));
app.route("/api/spotify", spotifyRouter);
app.route("/api/apple-music", appleMusicRouter);
app.route("/api/vip", vipRouter);
app.route("/api/library", libraryRouter);
app.route("/api/social", socialRouter);
app.route("/api/search", searchRouter);
app.route("/api/vault", vaultRouter);
app.route("/api/bandcamp", bandcampRouter);

// Build marker — bumped to force Railway to pick up new commits.
// If you see this in Railway logs, the new code IS deployed.
const BUILD_MARKER =
  "vybe-backend@2026-04-20T04 [Bandcamp audio proxy + POST /session + GET /stream/:token]";
console.log("[boot]", BUILD_MARKER);
app.get("/api/_build", (c) => c.json({ marker: BUILD_MARKER }));

const port = Number(process.env.PORT) || 3000;

void (async () => {
  let dbStatus = "disconnected";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "connected";
  } catch (e) {
    console.error("[SYSTEM] Database connectivity check failed:", e);
  }
  console.log(`[SYSTEM] Backend ignited on port ${port}. Database connected: ${dbStatus}`);
})();

// NOTE: Cache prewarm intentionally disabled. Firing 40 searches against
// YouTube/SoundCloud at startup triggered YouTube's rate limiter on the
// Railway IP, resulting in HTTP 429 responses for all subsequent yt-dlp
// requests (which broke downloads). Caches now warm naturally as real
// users hit endpoints — slower first-hit for any single user, but no
// rate-limit blowback for the whole server.

const honoFetch = app.fetch.bind(app);

export default {
  port,
  fetch(req: Request, srv?: unknown) {
    return Promise.resolve(honoFetch(req, srv as never)).catch((err: unknown) => {
      console.error("[hono] unhandled fetch error:", err);
      return Response.json(
        {
          error: {
            code: "INTERNAL",
            message: err instanceof Error ? err.message : String(err),
          },
        },
        { status: 500 }
      );
    });
  },
};
