// Shared helpers for /api/v1/* endpoints (mobile-facing).
import "server-only";
import { createClient, type Client, type InValue } from "@libsql/client";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";

// ───────────── DB ─────────────
let _client: Client | null = null;
export function db(): Client {
  if (_client) return _client;
  _client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return _client;
}

// IMPORTANT: noStore() opts out of Next.js 14's automatic fetch cache.
// libsql's HTTP transport uses fetch under the hood — without noStore,
// queries with identical SQL+args get served stale (e.g. /admin/users list
// returning data from minutes ago even after fresh DB inserts).
export async function qAll<T>(sql: string, args: InValue[] = []): Promise<T[]> {
  noStore();
  const r = await db().execute({ sql, args });
  return r.rows.map(row => {
    const o: any = {};
    for (const col of r.columns) o[col] = (row as any)[col];
    return o;
  }) as T[];
}
export async function qGet<T>(sql: string, args: InValue[] = []): Promise<T | undefined> {
  noStore();
  const rows = await qAll<T>(sql, args);
  return rows[0];
}
export async function qRun(sql: string, args: InValue[] = []): Promise<void> {
  noStore();
  await db().execute({ sql, args });
}

// ───────────── JWT ─────────────
const JWT_ISSUER = "belneg-api";
const JWT_AUDIENCE = "pembina-kkri-app";
const ACCESS_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function jwtSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("JWT_SECRET env var required (min 32 chars)");
  }
  return new TextEncoder().encode(s);
}

export type AccessTokenPayload = JWTPayload & {
  sub: string;
  role: "KODAM" | "KOREM" | "KODIM" | "KORAMIL" | "ADMIN";
  unit_id?: string;
  email?: string;
};

export async function signAccessToken(payload: Omit<AccessTokenPayload, "iat" | "exp" | "aud" | "iss">): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(jwtSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload as AccessTokenPayload;
  } catch {
    return null;
  }
}

// ───────────── Auth middleware ─────────────
export async function requireUser(req: NextRequest): Promise<
  | { ok: true; user: AccessTokenPayload }
  | { ok: false; res: NextResponse }
> {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized", reason: "missing Bearer token" }, { status: 401 }) };
  }
  const user = await verifyAccessToken(m[1]);
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized", reason: "invalid or expired token" }, { status: 401 }) };
  }
  // Verify user still active
  const row = await qGet<{ is_active: number }>(
    `SELECT is_active FROM kkri_users WHERE id = ?`,
    [user.sub]
  );
  if (!row || row.is_active !== 1) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized", reason: "user inactive" }, { status: 403 }) };
  }
  return { ok: true, user };
}

// ───────────── OTP ─────────────
export function generateOtpCode(): string {
  // 6 digit numeric, leading-zero safe
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function normalizeContact(input: string): { kind: "email" | "phone"; value: string } | null {
  const s = input.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { kind: "email", value: s.toLowerCase() };
  // E.164-ish: digits with optional + prefix, 8-15 digits
  const digits = s.replace(/[\s\-()]/g, "");
  if (/^\+?\d{8,15}$/.test(digits)) {
    // Indonesian numbers: convert "08xxx" to "+628xxx"
    let normalized = digits.startsWith("+") ? digits : digits.startsWith("0") ? "+62" + digits.slice(1) : "+" + digits;
    return { kind: "phone", value: normalized };
  }
  return null;
}

// ───────────── ID helper ─────────────
export const newId = (prefix: string) => `${prefix}_${nanoid(16)}`;

// ───────────── Response helpers ─────────────
export const ok = (data: any, init?: ResponseInit) => NextResponse.json(data, init);
export const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
