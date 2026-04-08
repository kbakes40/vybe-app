import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// Check if Turso credentials are available
const tursoUrl = process.env.TURSO_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

let prisma: PrismaClient;

if (tursoUrl && tursoToken) {
  // Use Turso (libSQL) - no DATABASE_URL needed
  console.log("🚀 Connecting to Turso database...");
  const adapter = new PrismaLibSQL({
    url: tursoUrl,
    authToken: tursoToken,
  });
  prisma = new PrismaClient({ adapter });
} else {
  // Fall back to local SQLite for development
  // DATABASE_URL defaults to "file:./dev.db" in env.ts if not set
  console.log("📁 Using local SQLite database...");
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL || "file:./dev.db",
      },
    },
  });

  // SQLite optimizations for better performance (local only)
  (async () => {
    try {
      await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
      await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON;");
      await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 10000;");
      await prisma.$queryRawUnsafe("PRAGMA synchronous = NORMAL;");
    } catch (e) {
      // Ignore pragma errors
    }
  })();
}

export { prisma };
