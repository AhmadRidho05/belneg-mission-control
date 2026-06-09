import "server-only";
import { cookies } from "next/headers";
import { verifyWebToken, WEB_TOKEN_COOKIE, type WebTokenPayload } from "@/app/api/web/_lib";

export async function getWebSession(): Promise<WebTokenPayload | null> {
  const jar = await cookies();
  const token = jar.get(WEB_TOKEN_COOKIE)?.value;
  if (!token) return null;
  return verifyWebToken(token);
}
