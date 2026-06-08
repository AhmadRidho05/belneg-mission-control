import { NextRequest } from "next/server";
import { Resend } from "resend";
import { qGet, qRun, generateOtpCode, normalizeContact, newId, ok, bad } from "../../_lib";

export const dynamic = "force-dynamic";

const OTP_TTL_MIN = 10;
const OTP_RATE_LIMIT_SEC = 60;

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  const rawContact = String(body?.contact ?? "").trim();
  if (!rawContact) return bad("contact (email) required");

  const c = normalizeContact(rawContact);
  if (!c) return bad("invalid email format");

  if (c.kind !== "email") {
    return bad("Pengiriman OTP via HP belum tersedia. Gunakan email.", 501);
  }

  // Rate-limit: 60s per contact across the siswa_otp table
  const recent = await qGet<{ created_at: string }>(
    `SELECT created_at FROM siswa_otp WHERE contact = ? ORDER BY created_at DESC LIMIT 1`,
    [c.value]
  );
  if (recent) {
    const ageSec = (Date.now() - new Date(recent.created_at + "Z").getTime()) / 1000;
    if (ageSec < OTP_RATE_LIMIT_SEC) {
      return bad(`tunggu ${Math.ceil(OTP_RATE_LIMIT_SEC - ageSec)} detik sebelum minta OTP lagi`, 429);
    }
  }

  const code = generateOtpCode();
  const id = newId("otp");
  const expires = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();

  await qRun(`UPDATE siswa_otp SET used = 1 WHERE contact = ? AND used = 0`, [c.value]);
  await qRun(
    `INSERT INTO siswa_otp(id, contact, code, expires_at, used, attempts) VALUES (?,?,?,?,0,0)`,
    [id, c.value, code, expires]
  );

  // Deliver via Resend (or dev-mode fallback)
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddr = process.env.RESEND_FROM_SISWA
    || process.env.RESEND_FROM
    || "KKRI Pencari Arah <onboarding@resend.dev>";
  if (apiKey) {
    try {
      const resend = new Resend(apiKey);
      await resend.emails.send({
        from: fromAddr,
        to: c.value,
        subject: `Kode OTP KKRI Pencari Arah: ${code}`,
        html: `
          <div style="font-family: -apple-system, system-ui, sans-serif; max-width:480px; margin:0 auto; padding:24px; background:#0F1E3D; color:#e8edf5;">
            <div style="text-align:center; margin-bottom:16px">
              <div style="font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#F5A623;">KKRI Pencari Arah</div>
              <div style="font-size:13px; color:#9aa6bd;">Temukan arahmu, mulai dari minat</div>
            </div>
            <div style="background:#172241; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:24px; text-align:center;">
              <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.18em; color:#9aa6bd; margin-bottom:8px;">Kode OTP Kamu</div>
              <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:36px; letter-spacing:0.3em; font-weight:700; color:#F5A623;">${code}</div>
              <div style="font-size:12px; color:#9aa6bd; margin-top:12px;">Berlaku ${OTP_TTL_MIN} menit. Jangan bagikan kode ini.</div>
            </div>
            <div style="font-size:11px; color:#5d6a85; text-align:center; margin-top:16px;">
              Jika kamu tidak meminta kode ini, abaikan email ini.
            </div>
          </div>
        `,
        text: `Kode OTP KKRI Pencari Arah: ${code}\n\nBerlaku ${OTP_TTL_MIN} menit. Jangan bagikan kode ini.`,
      });
    } catch (e: any) {
      console.error("[v2/otp] resend send failed:", e?.message);
      if (process.env.NODE_ENV === "production") {
        return bad("gagal kirim OTP, coba lagi sebentar", 502);
      }
    }
  } else {
    if (process.env.NODE_ENV === "production") {
      return bad("OTP delivery belum dikonfigurasi", 503);
    }
    console.log(`[v2/otp][dev] ${c.value} -> ${code}`);
  }

  return ok({
    sent: true,
    contact: c.value,
    expires_at: expires,
    ...(process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY ? { dev_code: code } : {}),
  });
}
