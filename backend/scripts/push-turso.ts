import { createClient } from "@libsql/client";
import { readFileSync } from "fs";

const url = process.env.TURSO_URL || process.argv[2];
const authToken = process.env.TURSO_AUTH_TOKEN || process.argv[3];

if (!url || !authToken) {
  console.error("Usage: bun scripts/push-turso.ts <TURSO_URL> <TURSO_AUTH_TOKEN>");
  process.exit(1);
}

const client = createClient({ url, authToken });

const sql = readFileSync("/tmp/turso-schema.sql", "utf-8");

// Remove comments and split into individual statements
const cleanSql = sql
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const statements = cleanSql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

console.log(`Executing ${statements.length} statements...`);

for (const stmt of statements) {
  try {
    await client.execute(stmt);
    console.log("✓", stmt.substring(0, 50) + "...");
  } catch (err: any) {
    // Ignore "table already exists" errors
    if (err.message?.includes("already exists")) {
      console.log("⊘", stmt.substring(0, 50) + "... (already exists)");
    } else {
      console.error("✗", stmt.substring(0, 50) + "...");
      console.error("  Error:", err.message);
    }
  }
}

console.log("\nDone!");
