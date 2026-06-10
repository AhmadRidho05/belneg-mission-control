import "server-only";
import { NextRequest } from "next/server";
import { bad } from "../../_lib";

export const runtime = "nodejs";

// Public self-registration is disabled. Accounts are created by admins only.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_req: NextRequest) {
  return bad("Pendaftaran mandiri ditutup. Akun baru hanya dibuat oleh administrator.", 403);
}
