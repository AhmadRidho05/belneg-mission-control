import { NextRequest } from "next/server";
import { Resend } from "resend";
import { db, qRun, qGet, generateOtpCode, normalizeContact, newId, ok, bad } from "../../_lib";

export const dynamic = "force-dynamic";

const OTP_TTL_MIN = 10;
const OTP_RATE_LIMIT_SEC = 60;

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  const rawContact = String(body?.contact ?? "").trim();
  if (!rawContact) return bad("contact (email or phone) required");

  const c = normalizeContact(rawContact);
  if (!c) return bad("invalid email or phone format");

  // Rate-limit: don't allow another OTP within 60s for same contact
  const recent = await qGet<{ created_at: string }>(
    `SELECT created_at FROM kkri_otp WHERE contact = ? ORDER BY created_at DESC LIMIT 1`,
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

  // Invalidate any prior unused OTPs for this contact
  await qRun(`UPDATE kkri_otp SET used = 1 WHERE contact = ? AND used = 0`, [c.value]);
  await qRun(
    `INSERT INTO kkri_otp(id, contact, code, expires_at, used, attempts) VALUES (?,?,?,?,0,0)`,
    [id, c.value, code, expires]
  );

  // Deliver
  if (c.kind === "email") {
    const apiKey = process.env.RESEND_API_KEY;
    const fromAddr = process.env.RESEND_FROM || "Pembina KKRI <onboarding@resend.dev>";
    if (apiKey) {
      try {
        const resend = new Resend(apiKey);
        await resend.emails.send({
          from: fromAddr,
          to: c.value,
          subject: `Kode OTP Pembina KKRI: ${code}`,
          html: `
            <div style="font-family: -apple-system, system-ui, sans-serif; max-width:480px; margin:0 auto; padding:24px; background:#0a0f1c; color:#e8edf5;">
              <div style="text-align:center; margin-bottom:16px">
                <div style="font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#fbbf24;">Pembina KKRI</div>
                <div style="font-size:13px; color:#9aa6bd;">Korps Kadet Republik Indonesia</div>
              </div>
              <div style="background:#172241; border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:24px; text-align:center;">
                <div style="font-size:11px; text-transform:uppercase; letter-spacing:0.18em; color:#9aa6bd; margin-bottom:8px;">Kode OTP Anda</div>
                <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:36px; letter-spacing:0.3em; font-weight:700; color:#fbbf24;">${code}</div>
                <div style="font-size:12px; color:#9aa6bd; margin-top:12px;">Berlaku ${OTP_TTL_MIN} menit. Jangan bagikan kode ini.</div>
              </div>
              <div style="font-size:11px; color:#5d6a85; text-align:center; margin-top:16px;">
                Jika Anda tidak meminta kode ini, abaikan email ini.
              </div>
            </div>
          `,
          text: `Kode OTP Pembina KKRI: ${code}\n\nBerlaku ${OTP_TTL_MIN} menit. Jangan bagikan kode ini.`,
        });
      } catch (e: any) {
        // Log + fall through to allow non-prod dev when RESEND not configured
        console.error("[otp] resend send failed:", e?.message);
        if (process.env.NODE_ENV === "production") {
          return bad("gagal kirim OTP, coba lagi sebentar", 502);
        }
      }
    } else {
      // No Resend key → dev mode, expose code for testing
      if (process.env.NODE_ENV === "production") {
        return bad("OTP delivery belum dikonfigurasi", 503);
      }
      console.log(`[otp][dev] ${c.value} -> ${code}`);
    }
  } else {
    // Phone delivery (WhatsApp/SMS) not wired yet — degrade to email-only for MVP
    return bad("Pengiriman OTP via HP belum tersedia. Gunakan email.", 501);
  }

  return ok({
    sent: true,
    contact: c.value,
    expires_at: expires,
    // In dev only — DO NOT expose in prod
    ...(process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY ? { dev_code: code } : {}),
  });
}
