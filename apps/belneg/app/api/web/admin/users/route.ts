import "server-only";
import { NextRequest } from "next/server";
import { qGet, qRun, ok, bad, getAdminFromRequest } from "../../_lib";

export const runtime = "nodejs";

const VALID_ROLES = new Set(["admin", "user"]);
const VALID_UNIT_TYPES = new Set(["KODAM", "KOREM", "KODIM", "KORAMIL"]);

export async function POST(req: NextRequest) {
  if (!await getAdminFromRequest(req)) {
    return bad("Akses ditolak. Hanya admin yang bisa membuat user baru.", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON");
  }

  const full_name = (body.full_name as string | undefined)?.trim() ?? "";
  const email_or_phone = (body.email_or_phone as string | undefined)?.trim().toLowerCase() ?? "";
  const nrp = (body.nrp as string | undefined)?.trim() ?? "";
  const jabatan = (body.jabatan as string | undefined)?.trim() ?? "";
  const unit_type = (body.unit_type as string | undefined)?.trim() ?? "";
  const unit_name = (body.unit_name as string | undefined)?.trim() ?? "";
  const role = (body.role as string | undefined)?.trim() ?? "user";

  if (!full_name) return bad("Nama lengkap wajib diisi.");
  if (!email_or_phone) return bad("Email atau No WhatsApp wajib diisi.");
  if (!nrp) return bad("NRP wajib diisi.");
  if (!unit_name) return bad("Nama unit kerja wajib diisi.");
  if (!VALID_ROLES.has(role)) return bad("Role harus: admin atau user.");
  if (unit_type && !VALID_UNIT_TYPES.has(unit_type)) return bad("Jenis unit tidak valid.");

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
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 1, ?, ?)`,
    [id, full_name, email_or_phone, nrp, jabatan, unit_type, unit_name, role, now, now]
  );

  return ok({
    ok: true,
    user: {
      id, full_name, email_or_phone, nrp, jabatan,
      unit_type, unit_name, role,
      status: "approved", is_active: 1,
      created_at: now, updated_at: now,
    },
  }, { status: 201 });
}
