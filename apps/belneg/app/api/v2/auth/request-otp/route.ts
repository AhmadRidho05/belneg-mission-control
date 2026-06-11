import { NextRequest } from "next/server";
import { Resend } from "resend";
import { qGet, qRun, generateOtpCode, normalizeContact, newId, ok, bad } from "../../_lib";

export const dynamic = "force-dynamic";

const OTP_TTL_MIN        = 10;
const OTP_RATE_LIMIT_SEC = 60;

// ─── Phone helpers ────────────────────────────────────────────────────────────

function e164ToFonnte(e164: string): string {
  // normalizeContact returns "+628xxx" — Fonnte wants "628xxx" (no leading +)
  return e164.startsWith("+") ? e164.slice(1) : e164;
}

// ─── WhatsApp OTP sender ──────────────────────────────────────────────────────

async function sendWhatsAppOtp(
  phone: string,
  code: string
): Promise<{ ok: boolean; error?: string }> {
  const token    = process.env.WA_OTP_TOKEN;
  const provider = (process.env.WA_OTP_PROVIDER || "fonnte").toLowerCase();

  if (!token) return { ok: false, error: "WA_OTP_TOKEN tidak dikonfigurasi" };

  const message =
    `Kode OTP KKRI Pencari Arah Anda: ${code}. ` +
    `Berlaku ${OTP_TTL_MIN} menit. Jangan bagikan kode ini kepada siapa pun.`;

  if (provider === "fonnte") {
    try {
      const res  = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: token, "Content-Type": "application/json" },
        body: JSON.stringify({ target: phone, message, countryCode: "62" }),
      });
      const data = (await res.json()) as { status: boolean; reason?: string };
      if (!data.status) {
        return { ok: false, error: data.reason || "Fonnte menolak pengiriman" };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "network error" };
    }
  }

  return { ok: false, error: `Provider "${provider}" belum didukung` };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return bad("invalid json"); }

  const rawContact = String(body?.contact ?? "").trim();
  if (!rawContact) return bad("contact (email atau nomor HP) required");

  const c = normalizeContact(rawContact);
  if (!c) return bad("Format email atau nomor HP tidak valid");

  // Rate-limit: 60s per contact
  const recent = await qGet<{ created_at: string }>(
    `SELECT created_at FROM siswa_otp WHERE contact = ? ORDER BY created_at DESC LIMIT 1`,
    [c.value]
  );
  if (recent) {
    const ageSec = (Date.now() - new Date(recent.created_at + "Z").getTime()) / 1000;
    if (ageSec < OTP_RATE_LIMIT_SEC) {
      return bad(`Tunggu ${Math.ceil(OTP_RATE_LIMIT_SEC - ageSec)} detik sebelum minta OTP lagi`, 429);
    }
  }

  const code    = generateOtpCode();
  const id      = newId("otp");
  const expires = new Date(Date.now() + OTP_TTL_MIN * 60 * 1000).toISOString();

  await qRun(`UPDATE siswa_otp SET used = 1 WHERE contact = ? AND used = 0`, [c.value]);
  await qRun(
    `INSERT INTO siswa_otp(id, contact, code, expires_at, used, attempts) VALUES (?,?,?,?,0,0)`,
    [id, c.value, code, expires]
  );

  // ── Delivery ──────────────────────────────────────────────────────────────
  if (c.kind === "phone") {
    // WhatsApp via WA_OTP_PROVIDER
    const fonntePhone = e164ToFonnte(c.value);
    const result      = await sendWhatsAppOtp(fonntePhone, code);
    if (!result.ok) {
      console.error(`[v2/otp] WA send failed: ${result.error}`);
      if (process.env.NODE_ENV === "production") {
        return bad("Gagal mengirim OTP via WhatsApp. Coba lagi sebentar.", 502);
      }
      console.log(`[v2/otp][dev] WA gagal — OTP tersimpan di DB untuk ${c.value.slice(0, 5)}****`);
    } else {
      console.log(`[v2/otp] OTP terkirim via WA ke ${fonntePhone.slice(0, 5)}****`);
    }
  } else {
    // Email via Resend
    const apiKey   = process.env.RESEND_API_KEY;
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
            <div style="font-family:-apple-system,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0F1E3D;color:#e8edf5;">
              <div style="text-align:center;margin-bottom:16px">
                <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#F5A623;">KKRI Pencari Arah</div>
                <div style="font-size:13px;color:#9aa6bd;">Temukan arahmu, mulai dari minat</div>
              </div>
              <div style="background:#172241;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:24px;text-align:center;">
                <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#9aa6bd;margin-bottom:8px;">Kode OTP Kamu</div>
                <div style="font-family:ui-monospace,monospace;font-size:36px;letter-spacing:0.3em;font-weight:700;color:#F5A623;">${code}</div>
                <div style="font-size:12px;color:#9aa6bd;margin-top:12px;">Berlaku ${OTP_TTL_MIN} menit. Jangan bagikan kode ini.</div>
              </div>
              <div style="font-size:11px;color:#5d6a85;text-align:center;margin-top:16px;">Jika kamu tidak meminta kode ini, abaikan email ini.</div>
            </div>
          `,
          text: `Kode OTP KKRI Pencari Arah: ${code}\n\nBerlaku ${OTP_TTL_MIN} menit. Jangan bagikan kode ini.`,
        });
      } catch (e: any) {
        console.error("[v2/otp] resend send failed:", e?.message);
        if (process.env.NODE_ENV === "production") {
          return bad("Gagal kirim OTP, coba lagi sebentar", 502);
        }
      }
    } else {
      if (process.env.NODE_ENV === "production") {
        return bad("OTP delivery belum dikonfigurasi", 503);
      }
      console.log(`[v2/otp][dev] ${c.value} -> OTP tersimpan di DB`);
    }
  }

  return ok({
    sent:       true,
    contact:    c.value,
    expires_at: expires,
    ...(process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY && c.kind === "email"
      ? { dev_code: code }
      : {}),
  });
}
