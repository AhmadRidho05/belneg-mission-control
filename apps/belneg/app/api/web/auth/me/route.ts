import "server-only";
import { type NextRequest } from "next/server";
import { verifyWebToken, WEB_TOKEN_COOKIE, ok } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(WEB_TOKEN_COOKIE)?.value;
  if (!token) return ok({ role: null });
  const payload = await verifyWebToken(token);
  return ok({ role: payload?.role ?? null });
}
