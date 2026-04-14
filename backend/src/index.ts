import "@vibecodeapp/proxy"; // DO NOT REMOVE OTHERWISE VIBECODE PROXY WILL NOT WORK
import { Hono } from "hono";
import { cors } from "hono/cors";
import "./env";
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
import { logger } from "hono/logger";

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
];

app.use(
  "*",
  cors({
    origin: (origin) => (origin && allowed.some((re) => re.test(origin)) ? origin : null),
    credentials: true,
  })
);

// Logging
app.use("*", logger());

// Auth middleware - populates user/session for all routes
app.use("*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }
  c.set("user", session.user);
  c.set("session", session.session);
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

// Health check endpoint
app.get("/health", (c) => c.json({ status: "ok" }));

// Get current user
app.get("/api/me", (c) => {
  const user = c.get("user");
  if (!user) return c.body(null, 401);
  return c.json({ data: user });
});

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

const port = Number(process.env.PORT) || 3000;

// Prewarm hot search caches shortly after startup so the mobile app's
// home/explore/search tabs see instant responses for popular genres.
// Runs async and non-blocking — failures are ignored.
const PREWARM_QUERIES = [
  "pop", "rock", "hip hop", "electronic", "jazz",
  "r&b", "country", "indie", "latin", "k-pop",
  "metal", "classical", "reggae", "blues", "folk",
  "punk", "soul", "funk", "edm", "house",
];

async function prewarmSearchCaches(baseUrl: string) {
  const start = Date.now();
  const tasks = PREWARM_QUERIES.flatMap((q) => {
    const qs = `q=${encodeURIComponent(q)}&maxResults=10`;
    return [
      fetch(`${baseUrl}/api/youtube/search?${qs}`).then((r) => r.ok),
      fetch(`${baseUrl}/api/soundcloud/search?${qs}`).then((r) => r.ok),
    ];
  });
  const results = await Promise.allSettled(tasks);
  const ok = results.filter((r) => r.status === "fulfilled" && r.value).length;
  const total = PREWARM_QUERIES.length * 2;
  const ms = Date.now() - start;
  console.log(`[cache-prewarm] completed ${ok}/${total} queries in ${ms} ms`);
}

// Fire prewarm after the server has had a moment to bind. Kept off the
// critical startup path — pipelined with Promise.allSettled.
setTimeout(() => {
  const baseUrl = process.env.BACKEND_URL ?? `http://127.0.0.1:${port}`;
  prewarmSearchCaches(baseUrl).catch((e) => {
    console.warn("[cache-prewarm] failed:", e instanceof Error ? e.message : e);
  });
}, 1500);

export default {
  port,
  fetch: app.fetch,
};
