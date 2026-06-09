import "server-only";
import { NextRequest } from "next/server";
import { qGet, qRun, ok, bad } from "../../_lib";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON");
  }

  const full_name = (body.full_name as string | undefined)?.trim() ?? "";
  const email_or_phone = (body.email_or_phone as string | undefined)?.trim().toLowerCase() ?? "";
  const nrp = (body.nrp as string | undefined)?.trim() ?? "";
  const unit_name = (body.unit_name as string | undefined)?.trim() ?? "";
  const jabatan = (body.jabatan as string | undefined)?.trim() ?? "";
  const unit_type = (body.unit_type as string | undefined)?.trim() ?? "";

  if (!full_name || !email_or_phone || !nrp || !unit_name) {
    return bad("full_name, email_or_phone, nrp, dan unit_name wajib diisi.");
  }

  const existing = await qGet<{ id: string }>(
    "SELECT id FROM users WHERE email_or_phone = ?",
    [email_or_phone]
  );
  if (existing) return bad("Email atau No WhatsApp sudah terdaftar.", 409);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await qRun(
    `INSERT INTO users
       (id, full_name, email_or_phone, nrp, jabatan, unit_type, unit_name,
        role, status, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'user', 'pending', 1, ?, ?)`,
    [id, full_name, email_or_phone, nrp, jabatan, unit_type, unit_name, now, now]
  );

  return ok(
    { ok: true, message: "Pendaftaran berhasil. Akun menunggu approval admin." },
    { status: 201 }
  );
}
