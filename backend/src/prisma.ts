import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

// Check if Turso credentials are available
const tursoUrl = process.env.TURSO_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

let prisma: PrismaClient;

if (tursoUrl && tursoToken) {
  // Use Turso (libSQL) in production
  console.log("🚀 Connecting to Turso database...");
  const adapter = new PrismaLibSQL({
    url: tursoUrl,
    authToken: tursoToken,
  });
  prisma = new PrismaClient({ adapter });
} else {
  // Fall back to local SQLite for development
  console.log("📁 Using local SQLite database...");
  prisma = new PrismaClient();

  // SQLite optimizations for better performance (local only)
  async function initSqlitePragmas(client: PrismaClient) {
    await client.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
    await client.$queryRawUnsafe("PRAGMA foreign_keys = ON;");
    await client.$queryRawUnsafe("PRAGMA busy_timeout = 10000;");
    await client.$queryRawUnsafe("PRAGMA synchronous = NORMAL;");
  }
  initSqlitePragmas(prisma);
}

export { prisma };
