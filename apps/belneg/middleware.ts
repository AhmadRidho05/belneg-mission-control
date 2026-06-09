import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Edge-compatible JWT verification — must NOT import from app/api/web/_lib
// because _lib uses @libsql/client (Node.js only) and `import "server-only"`.
// Keep constants in sync with app/api/web/_lib.ts.
const WEB_TOKEN_COOKIE = "belneg_web_token";
const JWT_ISSUER = "belneg-api";
const JWT_AUDIENCE = "web-mc";

function jwtSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? "");
}

async function getSessionRole(req: NextRequest): Promise<"admin" | "user" | null> {
  const token = req.cookies.get(WEB_TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    const role = payload["role"];
    if (role === "admin" || role === "user") return role;
    return null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const role = await getSessionRole(req);

  // Not authenticated → redirect to login
  if (!role) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Non-admin accessing admin-only pages → redirect to dashboard.
  // Only /admin/users and /admin/pembina are restricted;
  // /admin/reports and /admin/siswa are readable by all authenticated users.
  const ADMIN_ONLY = ["/admin/users", "/admin/pembina"] as const;
  if (role !== "admin" && ADMIN_ONLY.some(p => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/mapping/:path*",
    "/admin/:path*",
    "/assignment/:path*",
  ],
};
