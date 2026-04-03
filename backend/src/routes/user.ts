import { Hono } from "hono";
import { prisma } from "../prisma";
import { auth } from "../auth";

export const userRouter = new Hono<{
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
  };
}>();

// Get user preferences
userRouter.get("/preferences", async (c) => {
  const user = c.get("user");
  if (!user) return c.body(null, 401);

  let preferences = await prisma.userPreferences.findUnique({
    where: { userId: user.id },
  });

  // Create default preferences if none exist
  if (!preferences) {
    preferences = await prisma.userPreferences.create({
      data: { userId: user.id },
    });
  }

  return c.json({ data: preferences });
});

// Update user preferences (onboarding)
userRouter.post("/preferences", async (c) => {
  const user = c.get("user");
  if (!user) return c.body(null, 401);

  const body = await c.req.json();
  const { genres, mood, eraPreference, onboardingDone } = body;

  const preferences = await prisma.userPreferences.upsert({
    where: { userId: user.id },
    update: {
      genres: genres ? JSON.stringify(genres) : undefined,
      mood: mood ?? undefined,
      eraPreference: eraPreference ?? undefined,
      onboardingDone: onboardingDone ?? undefined,
    },
    create: {
      userId: user.id,
      genres: genres ? JSON.stringify(genres) : "[]",
      mood: mood ?? null,
      eraPreference: eraPreference ?? null,
      onboardingDone: onboardingDone ?? false,
    },
  });

  return c.json({ data: preferences });
});

// Get user subscription
userRouter.get("/subscription", async (c) => {
  const user = c.get("user");
  if (!user) return c.body(null, 401);

  let subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });

  // Create free subscription if none exists
  if (!subscription) {
    subscription = await prisma.subscription.create({
      data: { userId: user.id },
    });
  }

  // Check if skips need to be reset (daily reset)
  const now = new Date();
  const resetAt = new Date(subscription.skipResetAt);
  if (now.getDate() !== resetAt.getDate() || now.getMonth() !== resetAt.getMonth()) {
    subscription = await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        skipsToday: 0,
        adsListenedToday: 0,
        skipResetAt: now,
      },
    });
  }

  return c.json({ data: subscription });
});

// Use a skip (free tier)
userRouter.post("/subscription/skip", async (c) => {
  const user = c.get("user");
  if (!user) return c.body(null, 401);

  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });

  if (!subscription) {
    return c.json({ error: { message: "No subscription found", code: "NO_SUBSCRIPTION" } }, 404);
  }

  // Plus users have unlimited skips
  if (subscription.tier === "plus") {
    return c.json({ data: { allowed: true, remaining: -1 } });
  }

  // Free tier: 6 skips per hour
  const maxSkips = 6;
  if (subscription.skipsToday >= maxSkips) {
    return c.json({ data: { allowed: false, remaining: 0 } });
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { skipsToday: subscription.skipsToday + 1 },
  });

  return c.json({ data: { allowed: true, remaining: maxSkips - subscription.skipsToday - 1 } });
});

// Record ad listened
userRouter.post("/subscription/ad-listened", async (c) => {
  const user = c.get("user");
  if (!user) return c.body(null, 401);

  const subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
  });

  if (!subscription) {
    return c.json({ error: { message: "No subscription found", code: "NO_SUBSCRIPTION" } }, 404);
  }

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { adsListenedToday: subscription.adsListenedToday + 1 },
  });

  return c.json({ data: { success: true } });
});

// Guest login - create anonymous user
userRouter.post("/guest", async (c) => {
  const guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  const user = await prisma.user.create({
    data: {
      id: guestId,
      name: "Guest",
      email: `${guestId}@guest.vybe.app`,
      emailVerified: false,
    },
  });

  // Create default preferences and subscription
  await prisma.userPreferences.create({
    data: { userId: user.id },
  });

  await prisma.subscription.create({
    data: { userId: user.id },
  });

  return c.json({ data: { user, isGuest: true } });
});
