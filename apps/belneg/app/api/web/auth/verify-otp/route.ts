import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { qGet, qRun, signWebToken, setWebTokenCookie, ok, bad } from "../../_lib";

export const runtime = "nodejs";

type OtpRow = {
  id: string;
  otp_code: string;
  expires_at: string;
  used_at: string | null;
  attempts: number;
};

type UserRow = {
  id: string;
  full_name: string;
  email_or_phone: string;
  role: string;
  status: string;
  is_active: number;
};

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON");
  }

  const email_or_phone = (body.email_or_phone as string | undefined)?.trim().toLowerCase() ?? "";
  const otp_code = (body.otp_code as string | undefined)?.trim() ?? "";

  if (!email_or_phone || !otp_code) {
    return bad("email_or_phone dan otp_code wajib diisi.");
  }

  const otp = await qGet<OtpRow>(
    `SELECT id, otp_code, expires_at, used_at, attempts
     FROM web_otp_codes
     WHERE email_or_phone = ? AND purpose = 'login' AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [email_or_phone]
  );

  if (!otp) {
    return bad("Tidak ada OTP aktif. Silakan request OTP baru.", 400);
  }

  if (new Date(otp.expires_at) < new Date()) {
    return bad("OTP sudah kedaluwarsa. Silakan request OTP baru.", 400);
  }

  if (otp.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "max_attempts", message: "Terlalu banyak percobaan salah. Silakan request OTP baru." },
      { status: 429 }
    );
  }

  if (otp.otp_code !== otp_code) {
    await qRun(`UPDATE web_otp_codes SET attempts = attempts + 1 WHERE id = ?`, [otp.id]);
    const remaining = MAX_ATTEMPTS - (otp.attempts + 1);
    return NextResponse.json(
      {
        error: "wrong_otp",
        message: remaining > 0
          ? `Kode OTP salah. Sisa ${remaining} percobaan.`
          : "Kode OTP salah. Percobaan habis.",
      },
      { status: 401 }
    );
  }

  // Mark OTP as used
  await qRun(`UPDATE web_otp_codes SET used_at = CURRENT_TIMESTAMP WHERE id = ?`, [otp.id]);

  // Re-fetch user to guarantee current state
  const user = await qGet<UserRow>(
    `SELECT id, full_name, email_or_phone, role, status, is_active FROM users WHERE email_or_phone = ?`,
    [email_or_phone]
  );

  if (!user || user.status !== "approved" || user.is_active !== 1) {
    return NextResponse.json(
      { error: "inactive", message: "Akun tidak aktif atau belum disetujui." },
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
