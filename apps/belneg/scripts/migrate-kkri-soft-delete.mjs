// Adds soft-delete to kkri_users.
// Idempotent — checks for column existence before adding.
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2];
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const info = await client.execute("PRAGMA table_info(kkri_users)");
const hasCol = info.rows.some(r => (r.name ?? r[1]) === "deleted_at");

if (hasCol) {
  console.log("✓ deleted_at column already exists — skipping");
} else {
  await client.execute("ALTER TABLE kkri_users ADD COLUMN deleted_at TEXT");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_kkri_users_deleted ON kkri_users(deleted_at)");
  console.log("✓ added deleted_at column + index");
}

await client.close();
