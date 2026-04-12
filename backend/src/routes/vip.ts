import { Hono } from "hono";
import { prisma } from "../prisma";

const vipRouter = new Hono();

// Check if an email is in the VIP list
vipRouter.get("/check", async (c) => {
  const email = c.req.query("email")?.toLowerCase().trim();
  if (!email) return c.json({ data: { isVip: false } });

  const vip = await prisma.vipUser.findUnique({ where: { email } });
  return c.json({ data: { isVip: !!vip } });
});

// Add a VIP email (no auth required — secured by Railway network only)
vipRouter.post("/add", async (c) => {
  const body = await c.req.json<{ email: string; note?: string }>();
  const email = body.email?.toLowerCase().trim();
  if (!email) return c.json({ error: { message: "email required", code: "BAD_REQUEST" } }, 400);

  const vip = await prisma.vipUser.upsert({
    where: { email },
    create: { email, note: body.note },
    update: { note: body.note },
  });
  return c.json({ data: vip });
});

// List all VIP emails
vipRouter.get("/list", async (c) => {
  const vips = await prisma.vipUser.findMany({ orderBy: { createdAt: "desc" } });
  return c.json({ data: vips });
});

// Remove a VIP email
vipRouter.delete("/remove", async (c) => {
  const email = c.req.query("email")?.toLowerCase().trim();
  if (!email) return c.json({ error: { message: "email required", code: "BAD_REQUEST" } }, 400);

  await prisma.vipUser.deleteMany({ where: { email } });
  return c.json({ data: { removed: true } });
});

export { vipRouter };
