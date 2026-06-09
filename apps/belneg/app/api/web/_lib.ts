// Shared helpers for /api/web/* endpoints (web dashboard auth).
// Separate audience/cookie from mobile v1/v2 so tokens can't cross systems.
import "server-only";
import { createClient, type Client, type InValue } from "@libsql/client";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";

// ───────────── DB (reuses same Turso instance as v1/v2) ─────────────
let _client: Client | null = null;
function db(): Client {
  if (_client) return _client;
  _client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return _client;
}

export async function qAll<T>(sql: string, args: InValue[] = []): Promise<T[]> {
  noStore();
  const r = await db().execute({ sql, args });
  return r.rows.map(row => {
    const o: Record<string, unknown> = {};
    for (const col of r.columns) o[col] = (row as Record<string, unknown>)[col];
    return o as T;
  });
}

export async function qGet<T>(sql: string, args: InValue[] = []): Promise<T | undefined> {
  noStore();
  const r = await db().execute({ sql, args });
  if (!r.rows.length) return undefined;
  const o: Record<string, unknown> = {};
  for (const col of r.columns) o[col] = (r.rows[0] as Record<string, unknown>)[col];
  return o as T;
}

export async function qRun(sql: string, args: InValue[] = []): Promise<void> {
  noStore();
  await db().execute({ sql, args });
}

// ───────────── JWT (web dashboard) ─────────────
const JWT_ISSUER = "belneg-api";
const JWT_AUDIENCE = "web-mc";
export const WEB_TOKEN_COOKIE = "belneg_web_token";
const ACCESS_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function jwtSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET env var required (min 32 chars)");
  return new TextEncoder().encode(s);
}

export type WebTokenPayload = JWTPayload & {
  sub: string;
  full_name: string;
  email_or_phone: string;
  role: "admin" | "user";
  status: string;
};

export async function signWebToken(
  payload: Omit<WebTokenPayload, "iat" | "exp" | "aud" | "iss">
): Promise<string> {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(jwtSecret());
}

export async function verifyWebToken(token: string): Promise<WebTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload as WebTokenPayload;
  } catch {
    return null;
  }
}

export function setWebTokenCookie(res: NextResponse, token: string): void {
  res.cookies.set(WEB_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ACCESS_TTL_SECONDS,
    path: "/",
  });
}

export const ok = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);
export const bad = (msg: string, status = 400) =>
  NextResponse.json({ error: msg }, { status });
