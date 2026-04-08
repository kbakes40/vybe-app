# VYBE Admin Dashboard

Simple password-protected admin dashboard for managing users and ads.

## Running

```bash
cd admin
bun run dev   # Development with hot reload
bun run start # Production
```

Runs on port 3001.

## Authentication

Basic auth with credentials from environment:
- `ADMIN_USER` (default: admin)
- `ADMIN_PASS` (default: vybe2024)

## Features

- **Dashboard**: User count, Plus subscribers, active ads
- **Users**: View all users, change plan (free/plus), ban/unban, delete
- **Ads**: Create/manage audio/banner/interstitial ads with targeting

## Database

Uses the same SQLite database as the backend via Prisma.
