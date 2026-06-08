import { NextRequest } from "next/server";
import { qGet, qRun, signAccessToken, normalizeContact, newId, ok, bad } from "../../_lib";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  const contactRaw = String(body?.contact ?? "");
  const code = String(body?.code ?? "");
  const c = normalizeContact(contactRaw);
  if (!c) return bad("invalid contact");
  if (!/^\d{6}$/.test(code)) return bad("invalid code format");

  // Find most recent unused, unexpired OTP
  const otp = await qGet<{ id: string; code: string; expires_at: string; attempts: number }>(
    `SELECT id, code, expires_at, attempts FROM kkri_otp
     WHERE contact = ? AND used = 0
     ORDER BY created_at DESC LIMIT 1`,
    [c.value]
  );
  if (!otp) return bad("OTP tidak ditemukan / kadaluarsa. Minta yang baru.", 404);
  if (new Date(otp.expires_at + "Z").getTime() < Date.now()) {
    await qRun(`UPDATE kkri_otp SET used = 1 WHERE id = ?`, [otp.id]);
    return bad("OTP kadaluarsa. Minta yang baru.", 410);
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    await qRun(`UPDATE kkri_otp SET used = 1 WHERE id = ?`, [otp.id]);
    return bad("Terlalu banyak percobaan. Minta OTP baru.", 429);
  }
  if (otp.code !== code) {
    await qRun(`UPDATE kkri_otp SET attempts = attempts + 1 WHERE id = ?`, [otp.id]);
    const left = MAX_ATTEMPTS - otp.attempts - 1;
    return bad(`Kode salah. Sisa percobaan: ${left}`, 401);
  }

  // Success — mark OTP used
  await qRun(`UPDATE kkri_otp SET used = 1 WHERE id = ?`, [otp.id]);

  // Find or auto-create user (pending approval if first time)
  let user = await qGet<any>(
    c.kind === "email"
      ? `SELECT * FROM kkri_users WHERE email = ?`
      : `SELECT * FROM kkri_users WHERE phone = ?`,
    [c.value]
  );

  let isNewUser = false;
  if (!user) {
    // Auto-create pending user. Admin must approve via dashboard before is_active=1.
    const id = newId("usr");
    await qRun(
      c.kind === "email"
        ? `INSERT INTO kkri_users(id, email, full_name, role, is_active) VALUES (?,?,?,?,0)`
        : `INSERT INTO kkri_users(id, phone, full_name, role, is_active) VALUES (?,?,?,?,0)`,
      [id, c.value, "(belum diisi)", "KODIM"]
    );
    user = await qGet<any>(`SELECT * FROM kkri_users WHERE id = ?`, [id]);
    isNewUser = true;
  }

  await qRun(`UPDATE kkri_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);

  // If user is not yet active, return a "needs approval" response without token
  if (!user.is_active) {
    return ok({
      needs_profile: isNewUser,
      needs_approval: true,
      user_id: user.id,
      message: isNewUser
        ? "Akun berhasil dibuat. Hubungi atasan untuk approval + lengkapi profil."
        : "Akun belum disetujui oleh admin. Hubungi atasan.",
    }, { status: 202 });
  }

  // Issue access token
  const token = await signAccessToken({
    sub: user.id,
    role: user.role,
    unit_id: user.unit_id || undefined,
    email: user.email || undefined,
  });

  return ok({
    access_token: token,
    token_type: "Bearer",
    expires_in: 60 * 60 * 24 * 30,
    user: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      full_name: user.full_name,
      role: user.role,
      unit_id: user.unit_id,
    },
  });
}
