import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { qGet, qRun, ok, bad } from "../../_lib";

export const runtime = "nodejs";

type UserRow = {
  id: string;
  full_name: string;
  nrp: string | null;
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
    return bad("Nomor HP / Email dan NRP wajib diisi.");
  }

  const user = await qGet<UserRow>(
    `SELECT id, full_name, nrp, status, is_active FROM users WHERE email_or_phone = ?`,
    [email_or_phone]
  );

  if (!user) {
    return bad("Nomor HP / Email tidak terdaftar. Hubungi admin untuk membuat akun.", 404);
  }
  if (user.nrp !== nrp) {
    return bad("NRP tidak sesuai.", 401);
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

  // Invalidate all previous unused OTPs for this user/purpose
  await qRun(
    `UPDATE web_otp_codes SET used_at = CURRENT_TIMESTAMP
     WHERE email_or_phone = ? AND purpose = 'login' AND used_at IS NULL`,
    [email_or_phone]
  );

  // Generate new 6-digit OTP
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const id = crypto.randomUUID();

  await qRun(
    `INSERT INTO web_otp_codes (id, user_id, email_or_phone, purpose, otp_code, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 'login', ?, ?, 0, CURRENT_TIMESTAMP)`,
    [id, user.id, email_or_phone, code, expiresAt]
  );

  // DEMO: no WA/email provider yet — print to server terminal only
  console.log(`[DEMO OTP] identifier: ${email_or_phone} | code: ${code}`);

  return ok({ ok: true });
}
