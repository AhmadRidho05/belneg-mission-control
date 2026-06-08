// Shared helpers for /api/v2/* endpoints (siswa-facing, mobile app
// "KKRI Pencari Arah" consumes these). Mirrors v1 _lib but writes to
// siswa_* tables and uses a separate JWT audience.
import "server-only";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { NextRequest, NextResponse } from "next/server";

// Reuse the shared DB helpers (qAll/qGet/qRun) + nanoid prefix helper +
// response helpers from v1 — they're transport-agnostic.
import { qAll, qGet, qRun, newId, ok, bad, generateOtpCode, normalizeContact } from "../v1/_lib";
export { qAll, qGet, qRun, newId, ok, bad, generateOtpCode, normalizeContact };

// ───────────── JWT (siswa) ─────────────
const JWT_ISSUER = "belneg-api";
const JWT_AUDIENCE = "kkri-pencari-arah";
const ACCESS_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function jwtSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET env var required (min 32 chars)");
  }
  return new TextEncoder().encode(s);
}

export type SiswaTokenPayload = JWTPayload & {
  sub: string;       // siswa_users.id
  email: string;
};

export async function signSiswaToken(payload: Omit<SiswaTokenPayload, "iat" | "exp" | "aud" | "iss">): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(jwtSecret());
}

export async function verifySiswaToken(token: string): Promise<SiswaTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload as SiswaTokenPayload;
  } catch {
    return null;
  }
}

export const SISWA_ACCESS_TTL_SECONDS = ACCESS_TTL_SECONDS;

// ───────────── Auth middleware (siswa) ─────────────
// Opportunistically logs a 'login' activity row if last_active_at is >12h
// ago. This is the heartbeat that drives the streak counter (S5).
const LOGIN_ROLLUP_HOURS = 12;

export async function requireSiswa(req: NextRequest): Promise<
  | { ok: true; user: SiswaTokenPayload }
  | { ok: false; res: NextResponse }
> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized", reason: "missing Bearer token" }, { status: 401 }) };
  }
  const user = await verifySiswaToken(m[1]);
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized", reason: "invalid or expired token" }, { status: 401 }) };
  }

  const row = await qGet<{ is_active: number; last_active_at: string | null; deleted_at: string | null }>(
    `SELECT is_active, last_active_at, deleted_at FROM siswa_users WHERE id = ?`,
    [user.sub]
  );
  if (!row || row.deleted_at) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized", reason: "user not found" }, { status: 404 }) };
  }
  if (row.is_active !== 1) {
    return { ok: false, res: NextResponse.json({ error: "forbidden", reason: "user inactive" }, { status: 403 }) };
  }

  // Heartbeat — write a 'login' activity if last login >12h ago (or never).
  // Best-effort; failure must NOT block the request.
  const shouldRoll = !row.last_active_at
    || (Date.now() - new Date(row.last_active_at + "Z").getTime()) > LOGIN_ROLLUP_HOURS * 3600 * 1000;
  if (shouldRoll) {
    try {
      await qRun(`UPDATE siswa_users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.sub]);
      await qRun(
        `INSERT INTO siswa_activity_log (id, user_id, activity_type, ref_id) VALUES (?,?,?,?)`,
        [newId("act"), user.sub, "login", null]
      );
    } catch (e: any) {
      console.error("[v2] login heartbeat failed:", e?.message);
    }
  }

  return { ok: true, user };
}
