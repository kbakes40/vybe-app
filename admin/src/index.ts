import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = new Hono();

// Password protection
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "vybe2024";

app.use("/*", basicAuth({ username: ADMIN_USER, password: ADMIN_PASS }));

// HTML template helper
const html = (title: string, content: string) => `
<!DOCTYPE html>
<html>
<head>
  <title>${title} - VYBE Admin</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 20px; background: #0a0a0a; color: #fff; }
    nav { margin-bottom: 20px; display: flex; gap: 15px; border-bottom: 1px solid #333; padding-bottom: 15px; }
    nav a { color: #8b5cf6; text-decoration: none; font-weight: 500; }
    nav a:hover { text-decoration: underline; }
    h1 { margin: 0 0 20px; color: #8b5cf6; }
    table { width: 100%; border-collapse: collapse; background: #1a1a1a; border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #252525; color: #888; font-weight: 500; text-transform: uppercase; font-size: 12px; }
    tr:hover { background: #222; }
    .btn { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }
    .btn-danger { background: #dc2626; color: #fff; }
    .btn-warning { background: #f59e0b; color: #000; }
    .btn-success { background: #22c55e; color: #fff; }
    .btn-primary { background: #8b5cf6; color: #fff; }
    form { display: inline; }
    select { padding: 6px; border-radius: 4px; border: 1px solid #444; background: #252525; color: #fff; }
    input[type="text"], input[type="url"], input[type="number"] {
      padding: 8px 12px; border-radius: 4px; border: 1px solid #444; background: #252525; color: #fff; width: 100%;
    }
    .form-group { margin-bottom: 15px; }
    .form-group label { display: block; margin-bottom: 5px; color: #888; font-size: 13px; }
    .card { background: #1a1a1a; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .badge-free { background: #374151; color: #9ca3af; }
    .badge-plus { background: #7c3aed; color: #fff; }
    .badge-active { background: #166534; color: #86efac; }
    .badge-banned { background: #991b1b; color: #fca5a5; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px; }
    .stat { background: #1a1a1a; padding: 20px; border-radius: 8px; }
    .stat-value { font-size: 32px; font-weight: 700; color: #8b5cf6; }
    .stat-label { color: #888; font-size: 13px; margin-top: 5px; }
  </style>
</head>
<body>
  <nav>
    <a href="/">Dashboard</a>
    <a href="/users">Users</a>
    <a href="/ads">Ads</a>
  </nav>
  ${content}
</body>
</html>
`;

// Dashboard
app.get("/", async (c) => {
  const [userCount, subCount, adCount] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count({ where: { tier: "plus" } }),
    prisma.ad.count({ where: { active: true } }),
  ]);

  return c.html(html("Dashboard", `
    <h1>VYBE Admin Dashboard</h1>
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${userCount}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat">
        <div class="stat-value">${subCount}</div>
        <div class="stat-label">Plus Subscribers</div>
      </div>
      <div class="stat">
        <div class="stat-value">${adCount}</div>
        <div class="stat-label">Active Ads</div>
      </div>
    </div>
  `));
});

// Users list
app.get("/users", async (c) => {
  const users = await prisma.user.findMany({
    include: { subscription: true },
    orderBy: { createdAt: "desc" },
  });

  const rows = users.map(u => {
    const sub = u.subscription;
    const tier = sub?.tier || "free";
    const status = sub?.status || "active";
    const isBanned = status === "banned";

    return `
      <tr>
        <td>${u.email}</td>
        <td>${u.name}</td>
        <td><span class="badge badge-${tier}">${tier}</span></td>
        <td><span class="badge badge-${isBanned ? 'banned' : 'active'}">${status}</span></td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td>
          <form action="/users/${u.id}/plan" method="POST">
            <select name="tier" onchange="this.form.submit()">
              <option value="free" ${tier === 'free' ? 'selected' : ''}>Free</option>
              <option value="plus" ${tier === 'plus' ? 'selected' : ''}>Plus</option>
            </select>
          </form>
        </td>
        <td>
          ${isBanned ? `
            <form action="/users/${u.id}/unban" method="POST">
              <button type="submit" class="btn btn-success">Unban</button>
            </form>
          ` : `
            <form action="/users/${u.id}/ban" method="POST">
              <button type="submit" class="btn btn-warning">Ban</button>
            </form>
          `}
          <form action="/users/${u.id}/delete" method="POST" onsubmit="return confirm('Delete this user?')">
            <button type="submit" class="btn btn-danger">Delete</button>
          </form>
        </td>
      </tr>
    `;
  }).join("");

  return c.html(html("Users", `
    <h1>Users</h1>
    <table>
      <thead>
        <tr>
          <th>Email</th>
          <th>Name</th>
          <th>Plan</th>
          <th>Status</th>
          <th>Joined</th>
          <th>Change Plan</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="7">No users yet</td></tr>'}</tbody>
    </table>
  `));
});

// Update user plan
app.post("/users/:id/plan", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.parseBody();
  const tier = body.tier as string;

  await prisma.subscription.upsert({
    where: { userId: id },
    update: { tier },
    create: { userId: id, tier },
  });

  return c.redirect("/users");
});

// Ban user
app.post("/users/:id/ban", async (c) => {
  const id = c.req.param("id");
  await prisma.subscription.upsert({
    where: { userId: id },
    update: { status: "banned" },
    create: { userId: id, status: "banned" },
  });
  return c.redirect("/users");
});

// Unban user
app.post("/users/:id/unban", async (c) => {
  const id = c.req.param("id");
  await prisma.subscription.update({
    where: { userId: id },
    data: { status: "active" },
  });
  return c.redirect("/users");
});

// Delete user
app.post("/users/:id/delete", async (c) => {
  const id = c.req.param("id");
  await prisma.user.delete({ where: { id } });
  return c.redirect("/users");
});

// Ads list
app.get("/ads", async (c) => {
  const ads = await prisma.ad.findMany({ orderBy: { createdAt: "desc" } });

  const rows = ads.map(ad => `
    <tr>
      <td>${ad.name}</td>
      <td>${ad.type}</td>
      <td><span class="badge badge-${ad.active ? 'active' : 'banned'}">${ad.active ? 'Active' : 'Inactive'}</span></td>
      <td>${ad.impressions}</td>
      <td>${ad.clicks}</td>
      <td>${ad.priority}</td>
      <td>
        <form action="/ads/${ad.id}/toggle" method="POST">
          <button type="submit" class="btn ${ad.active ? 'btn-warning' : 'btn-success'}">
            ${ad.active ? 'Disable' : 'Enable'}
          </button>
        </form>
        <form action="/ads/${ad.id}/delete" method="POST" onsubmit="return confirm('Delete this ad?')">
          <button type="submit" class="btn btn-danger">Delete</button>
        </form>
      </td>
    </tr>
  `).join("");

  return c.html(html("Ads", `
    <h1>Ads</h1>
    <div class="card">
      <h3>Create New Ad</h3>
      <form action="/ads" method="POST">
        <div class="form-group">
          <label>Name</label>
          <input type="text" name="name" required>
        </div>
        <div class="form-group">
          <label>Type</label>
          <select name="type">
            <option value="audio">Audio</option>
            <option value="banner">Banner</option>
            <option value="interstitial">Interstitial</option>
          </select>
        </div>
        <div class="form-group">
          <label>Media URL</label>
          <input type="url" name="mediaUrl" required>
        </div>
        <div class="form-group">
          <label>Click URL (optional)</label>
          <input type="url" name="clickUrl">
        </div>
        <div class="form-group">
          <label>Duration (seconds)</label>
          <input type="number" name="duration" value="30">
        </div>
        <div class="form-group">
          <label>Priority (higher = more frequent)</label>
          <input type="number" name="priority" value="0">
        </div>
        <button type="submit" class="btn btn-primary">Create Ad</button>
      </form>
    </div>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Status</th>
          <th>Impressions</th>
          <th>Clicks</th>
          <th>Priority</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="7">No ads yet</td></tr>'}</tbody>
    </table>
  `));
});

// Create ad
app.post("/ads", async (c) => {
  const body = await c.req.parseBody();
  await prisma.ad.create({
    data: {
      name: body.name as string,
      type: body.type as string,
      mediaUrl: body.mediaUrl as string,
      clickUrl: (body.clickUrl as string) || null,
      duration: parseInt(body.duration as string) || 30,
      priority: parseInt(body.priority as string) || 0,
    },
  });
  return c.redirect("/ads");
});

// Toggle ad
app.post("/ads/:id/toggle", async (c) => {
  const id = c.req.param("id");
  const ad = await prisma.ad.findUnique({ where: { id } });
  if (ad) {
    await prisma.ad.update({
      where: { id },
      data: { active: !ad.active },
    });
  }
  return c.redirect("/ads");
});

// Delete ad
app.post("/ads/:id/delete", async (c) => {
  const id = c.req.param("id");
  await prisma.ad.delete({ where: { id } });
  return c.redirect("/ads");
});

const port = 3001;
console.log(`Admin dashboard running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
