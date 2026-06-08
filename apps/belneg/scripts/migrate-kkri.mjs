// Idempotent: creates KKRI tables in Turso if not exists.
// Usage: node scripts/migrate-kkri.mjs

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

console.log("[1/5] kkri_users …");
await client.execute(`
  CREATE TABLE IF NOT EXISTS kkri_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    full_name TEXT NOT NULL,
    nrp TEXT,
    role TEXT NOT NULL CHECK (role IN ('KODAM','KOREM','KODIM','KORAMIL','ADMIN')),
    unit_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 0,
    approved_by TEXT,
    approved_at TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_kkri_users_unit ON kkri_users(unit_id)`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_kkri_users_active ON kkri_users(is_active)`);

console.log("[2/5] kkri_otp …");
await client.execute(`
  CREATE TABLE IF NOT EXISTS kkri_otp (
    id TEXT PRIMARY KEY,
    contact TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_kkri_otp_contact ON kkri_otp(contact, used)`);

console.log("[3/5] kkri_reports …");
await client.execute(`
  CREATE TABLE IF NOT EXISTS kkri_reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    unit_id TEXT,
    sekolah_npsn TEXT,
    jenis_kegiatan TEXT NOT NULL,
    materi TEXT,
    peserta_laki INTEGER NOT NULL DEFAULT 0,
    peserta_perempuan INTEGER NOT NULL DEFAULT 0,
    hasil TEXT,
    kendala TEXT,
    situasi_lapangan TEXT,
    lat REAL,
    lng REAL,
    reported_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed','approved','rejected')),
    reviewed_by TEXT,
    reviewed_at TEXT,
    review_notes TEXT,
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_kkri_reports_user ON kkri_reports(user_id)`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_kkri_reports_unit ON kkri_reports(unit_id)`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_kkri_reports_npsn ON kkri_reports(sekolah_npsn)`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_kkri_reports_status ON kkri_reports(status)`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_kkri_reports_submitted ON kkri_reports(submitted_at DESC)`);

console.log("[4/5] kkri_report_photos …");
await client.execute(`
  CREATE TABLE IF NOT EXISTS kkri_report_photos (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    url TEXT NOT NULL,
    caption TEXT,
    width INTEGER,
    height INTEGER,
    bytes INTEGER,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_kkri_photos_report ON kkri_report_photos(report_id)`);

console.log("[5/5] kkri_sessions (refresh tokens) …");
await client.execute(`
  CREATE TABLE IF NOT EXISTS kkri_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    refresh_token_hash TEXT NOT NULL,
    device_label TEXT,
    user_agent TEXT,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TEXT
  )
`);
await client.execute(`CREATE INDEX IF NOT EXISTS idx_kkri_sessions_user ON kkri_sessions(user_id, revoked_at)`);

console.log("\n✓ Done. Verifying …");
const r = await client.execute(`
  SELECT name FROM sqlite_master
  WHERE type='table' AND name LIKE 'kkri_%'
  ORDER BY name
`);
console.table(r.rows.map(x => ({ table: x.name })));

await client.close();
