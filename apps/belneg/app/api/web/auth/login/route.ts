import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { qGet, signWebToken, setWebTokenCookie, ok, bad } from "../../_lib";

export const runtime = "nodejs";

type UserRow = {
  id: string;
  full_name: string;
  email_or_phone: string;
  nrp: string;
  role: string;
  status: string;
  is_active: number;
};

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON");
  }

  const email_or_phone = (body.email_or_phone as string | undefined)?.trim().toLowerCase() ?? "";
  const nrp = (body.nrp as string | undefined)?.trim() ?? "";

  if (!email_or_phone || !nrp) {
    return bad("email_or_phone dan nrp wajib diisi.");
  }

  const user = await qGet<UserRow>(
    `SELECT id, full_name, email_or_phone, nrp, role, status, is_active
     FROM users
     WHERE email_or_phone = ?`,
    [email_or_phone]
  );

  if (!user) {
    return bad("Akun tidak ditemukan. Silakan daftar terlebih dahulu.", 404);
  }
  if (user.nrp !== nrp) {
    return bad("NRP tidak sesuai dengan akun terdaftar.", 401);
  }
  if (user.status === "pending") {
    return NextResponse.json(
      { error: "pending", message: "Akun Anda masih menunggu approval admin." },
      { status: 403 }
    );
  }
  if (user.status === "rejected") {
    return NextResponse.json(
      { error: "rejected", message: "Akun Anda ditolak atau dinonaktifkan." },
      { status: 403 }
    );
  }
  if (user.is_active !== 1) {
    return NextResponse.json(
      { error: "inactive", message: "Akun Anda tidak aktif. Hubungi admin." },
      { status: 403 }
    );
  }

  const token = await signWebToken({
    sub: user.id,
    full_name: user.full_name,
    email_or_phone: user.email_or_phone,
    role: user.role as "admin" | "user",
    status: user.status,
  });

  const res = ok({ ok: true, role: user.role });
  setWebTokenCookie(res, token);
  return res;
}
