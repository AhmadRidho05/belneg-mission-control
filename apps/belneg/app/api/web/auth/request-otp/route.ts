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

// ─── Phone helpers ────────────────────────────────────────────────────────────

function looksLikePhone(s: string): boolean {
  return /^[+0]?\d[\d\s()\-]{6,}$/.test(s.trim());
}

function normalizeIndonesianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("62") && digits.length >= 10) return digits;
  if (digits.startsWith("0") && digits.length >= 9)  return "62" + digits.slice(1);
  return null;
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
    `Kode OTP Belneg Mission Control Anda: ${code}. ` +
    `Berlaku 5 menit. Jangan bagikan kode ini kepada siapa pun.`;

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
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON");
  }

  const email_or_phone = ((body.email_or_phone as string | undefined) ?? "").trim().toLowerCase();
  const nrp            = ((body.nrp            as string | undefined) ?? "").trim();

  if (!email_or_phone || !nrp) {
    return bad("Nomor HP / Email dan NRP wajib diisi.");
  }

  const user = await qGet<UserRow>(
    `SELECT id, full_name, nrp, status, is_active FROM users WHERE email_or_phone = ?`,
    [email_or_phone]
  );

  if (!user) return bad("Nomor HP / Email tidak terdaftar. Hubungi admin untuk membuat akun.", 404);
  if (user.nrp !== nrp) return bad("NRP tidak sesuai.", 401);

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

  // Invalidate all previous unused OTPs for this identifier
  await qRun(
    `UPDATE web_otp_codes SET used_at = CURRENT_TIMESTAMP
     WHERE email_or_phone = ? AND purpose = 'login' AND used_at IS NULL`,
    [email_or_phone]
  );

  // Generate new 6-digit OTP
  const code      = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const id        = crypto.randomUUID();

  await qRun(
    `INSERT INTO web_otp_codes (id, user_id, email_or_phone, purpose, otp_code, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 'login', ?, ?, 0, CURRENT_TIMESTAMP)`,
    [id, user.id, email_or_phone, code, expiresAt]
  );

  // Send OTP via WhatsApp when identifier is a phone number
  if (looksLikePhone(email_or_phone)) {
    const phone = normalizeIndonesianPhone(email_or_phone);
    if (phone) {
      const result = await sendWhatsAppOtp(phone, code);
      if (!result.ok) {
        console.error(`[web/otp] WA send failed: ${result.error}`);
        if (process.env.NODE_ENV === "production") {
          return bad("Gagal mengirim OTP via WhatsApp. Coba lagi sebentar.", 502);
        }
        // dev: fall through, OTP tersimpan di DB — bisa dicek manual
        console.log(`[web/otp][dev] WA gagal — OTP tersimpan di DB untuk ${email_or_phone.slice(0, 4)}****`);
      } else {
        console.log(`[web/otp] OTP terkirim via WA ke ${phone.slice(0, 5)}****`);
      }
    }
  } else {
    // Email identifier — tidak ada nomor HP yang bisa dikirimi WA dari flow ini
    if (process.env.NODE_ENV !== "production") {
      console.log(`[web/otp][dev] email login — OTP tersimpan di DB untuk ${email_or_phone}`);
    }
  }

  return ok({ ok: true });
}
