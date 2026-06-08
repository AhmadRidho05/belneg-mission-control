import { NextRequest } from "next/server";
import { qGet, qRun, signSiswaToken, normalizeContact, newId, ok, bad, SISWA_ACCESS_TTL_SECONDS } from "../../_lib";

export const dynamic = "force-dynamic";

const MAX_ATTEMPTS = 5;
const REQUIRED_ONBOARDING_FIELDS = ["full_name", "school_npsn", "school_class", "birth_year", "gender"] as const;

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  const contactRaw = String(body?.contact ?? "");
  const code = String(body?.code ?? "");
  const c = normalizeContact(contactRaw);
  if (!c || c.kind !== "email") return bad("contact harus berupa email");
  if (!/^\d{6}$/.test(code)) return bad("kode OTP harus 6 digit angka");

  // Find most recent unused, unexpired OTP
  const otp = await qGet<{ id: string; code: string; expires_at: string; attempts: number }>(
    `SELECT id, code, expires_at, attempts FROM siswa_otp
     WHERE contact = ? AND used = 0
     ORDER BY created_at DESC LIMIT 1`,
    [c.value]
  );
  if (!otp) return bad("OTP tidak ditemukan atau sudah kadaluarsa. Minta yang baru.", 404);
  if (new Date(otp.expires_at + "Z").getTime() < Date.now()) {
    await qRun(`UPDATE siswa_otp SET used = 1 WHERE id = ?`, [otp.id]);
    return bad("OTP kadaluarsa. Minta yang baru.", 410);
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    await qRun(`UPDATE siswa_otp SET used = 1 WHERE id = ?`, [otp.id]);
    return bad("Terlalu banyak percobaan. Minta OTP baru.", 429);
  }
  if (otp.code !== code) {
    await qRun(`UPDATE siswa_otp SET attempts = attempts + 1 WHERE id = ?`, [otp.id]);
    const left = MAX_ATTEMPTS - otp.attempts - 1;
    return bad(`Kode salah. Sisa percobaan: ${left}`, 401);
  }

  // OTP is valid + code correct, but DON'T mark it used yet — first see if
  // we can actually issue a token. If the user is new and hasn't submitted
  // onboarding fields, we return 202 needs_onboarding and the OTP stays
  // valid so the client can re-call this endpoint with the form payload
  // without forcing the user to wait for a fresh OTP.

  // Find or auto-create user
  let user = await qGet<any>(`SELECT * FROM siswa_users WHERE email = ?`, [c.value]);
  let isNewUser = false;

  if (!user) {
    // First-time signup — require all onboarding fields
    const missing = REQUIRED_ONBOARDING_FIELDS.filter(f => body?.[f] == null || body[f] === "");
    if (missing.length > 0) {
      // OTP intentionally left valid — client will re-submit with form data.
      return ok({
        needs_onboarding: true,
        missing_fields: missing,
        message: "Lengkapi data berikut untuk menyelesaikan pendaftaran.",
      }, { status: 202 });
    }

    // Validate onboarding payload
    const fullName = String(body.full_name).trim().slice(0, 200);
    const schoolNpsn = String(body.school_npsn).trim();
    const schoolClass = String(body.school_class).trim();
    const birthYear = parseInt(String(body.birth_year), 10);
    const gender = String(body.gender).trim().toUpperCase();

    if (fullName.length < 2) return bad("nama lengkap minimal 2 karakter");
    if (!/^\d{8,10}$/.test(schoolNpsn)) return bad("school_npsn harus 8-10 digit");
    if (!["10","11","12"].includes(schoolClass)) return bad("school_class harus 10, 11, atau 12");
    const thisYear = new Date().getFullYear();
    if (!Number.isInteger(birthYear) || birthYear < thisYear - 25 || birthYear > thisYear - 12) {
      return bad("birth_year tidak masuk akal untuk siswa SMA");
    }
    if (!["L","P"].includes(gender)) return bad("gender harus 'L' atau 'P'");

    // Verify the NPSN exists and is an SMA-family school
    const school = await qGet<{ bentuk_pendidikan: string }>(
      `SELECT bentuk_pendidikan FROM fact_satpen_dikmen WHERE npsn = ?`,
      [schoolNpsn]
    );
    if (!school) return bad("NPSN sekolah tidak ditemukan", 404);
    if (!["SMA","SMK","MA","MAK"].includes(school.bentuk_pendidikan)) {
      return bad(`sekolah ini bentuk pendidikannya "${school.bentuk_pendidikan}" — KKRI Pencari Arah untuk siswa SMA/SMK/MA/MAK saja`, 422);
    }

    const id = newId("sis");
    await qRun(
      `INSERT INTO siswa_users (id, email, full_name, birth_year, gender, school_npsn, school_class, is_active, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
      [id, c.value, fullName, birthYear, gender, schoolNpsn, schoolClass]
    );
    await qRun(
      `INSERT INTO siswa_activity_log (id, user_id, activity_type, ref_id) VALUES (?,?,?,?)`,
      [newId("act"), id, "signup", null]
    );
    user = await qGet<any>(`SELECT * FROM siswa_users WHERE id = ?`, [id]);
    isNewUser = true;
  } else {
    await qRun(`UPDATE siswa_users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?`, [user.id]);
  }

  if (user.deleted_at) return bad("akun sudah dihapus. Hubungi admin.", 403);
  if (!user.is_active) return bad("akun tidak aktif. Hubungi admin.", 403);

  // We're issuing a token — NOW consume the OTP. Any earlier exit path
  // (needs_onboarding, field validation 4xx, deleted/inactive account)
  // leaves it valid so the client can retry without waiting on a fresh OTP.
  await qRun(`UPDATE siswa_otp SET used = 1 WHERE id = ?`, [otp.id]);

  const token = await signSiswaToken({
    sub: user.id,
    email: user.email,
  });

  return ok({
    access_token: token,
    token_type: "Bearer",
    expires_in: SISWA_ACCESS_TTL_SECONDS,
    is_new_user: isNewUser,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      birth_year: user.birth_year,
      gender: user.gender,
      school_npsn: user.school_npsn,
      school_class: user.school_class,
      primary_career_onet: user.primary_career_onet,
      riasec_top_code: user.riasec_top_code,
    },
  });
}
