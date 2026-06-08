// POST /api/admin/users — create new KKRI Pembina user (admin-issued)
import { NextRequest, NextResponse } from "next/server";
import { qGet, qRun, newId, normalizeContact } from "../../v1/_lib";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = new Set(["KODAM", "KOREM", "KODIM", "KORAMIL", "ADMIN"]);

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const full_name = String(body.full_name ?? "").trim().slice(0, 200);
  const role = String(body.role ?? "").trim();
  const unit_id = body.unit_id ? String(body.unit_id).trim() : null;
  const nrp = body.nrp ? String(body.nrp).trim().slice(0, 50) : null;
  const contact = String(body.contact ?? "").trim();
  const is_active = body.is_active === 1 || body.is_active === true ? 1 : 0;

  if (!full_name) return NextResponse.json({ error: "full_name wajib" }, { status: 400 });
  if (!ALLOWED_ROLES.has(role)) return NextResponse.json({ error: "role invalid" }, { status: 400 });
  if (role !== "ADMIN" && !unit_id) return NextResponse.json({ error: "unit_id wajib untuk role non-ADMIN" }, { status: 400 });
  if (!contact) return NextResponse.json({ error: "email atau no HP wajib" }, { status: 400 });

  const c = normalizeContact(contact);
  if (!c) return NextResponse.json({ error: "format kontak invalid" }, { status: 400 });

  // Duplicate check (active only — deleted ones can have email reused)
  const dup = await qGet<{ id: string }>(
    c.kind === "email"
      ? `SELECT id FROM kkri_users WHERE email = ? AND deleted_at IS NULL`
      : `SELECT id FROM kkri_users WHERE phone = ? AND deleted_at IS NULL`,
    [c.value]
  );
  if (dup) return NextResponse.json({ error: `${c.kind} sudah terdaftar` }, { status: 409 });

  const id = newId("usr");
  await qRun(
    c.kind === "email"
      ? `INSERT INTO kkri_users(id, email, full_name, nrp, role, unit_id, is_active, approved_at) VALUES (?,?,?,?,?,?,?,${is_active ? "CURRENT_TIMESTAMP" : "NULL"})`
      : `INSERT INTO kkri_users(id, phone, full_name, nrp, role, unit_id, is_active, approved_at) VALUES (?,?,?,?,?,?,?,${is_active ? "CURRENT_TIMESTAMP" : "NULL"})`,
    [id, c.value, full_name, nrp, role, unit_id, is_active]
  );

  return NextResponse.json({ id, created: true }, { status: 201 });
}
