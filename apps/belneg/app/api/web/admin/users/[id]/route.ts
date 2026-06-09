import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { InValue } from "@libsql/client";
import { qGet, qRun, ok, bad, getAdminFromRequest } from "../../../_lib";

export const runtime = "nodejs";

type Ctx = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  if (!await getAdminFromRequest(req)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const { id } = params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("Invalid JSON");
  }

  const exists = await qGet<{ id: string }>("SELECT id FROM users WHERE id = ?", [id]);
  if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sets: string[] = [];
  const args: InValue[] = [];

  if (typeof body.status === "string") {
    const valid = ["approved", "rejected", "pending"];
    if (!valid.includes(body.status)) return bad("status harus: approved, rejected, atau pending");
    sets.push("status = ?");
    args.push(body.status);
  }
  if (typeof body.is_active === "number") {
    sets.push("is_active = ?");
    args.push(body.is_active === 1 ? 1 : 0);
  }
  if (typeof body.role === "string") {
    const valid = ["admin", "user"];
    if (!valid.includes(body.role)) return bad("role harus: admin atau user");
    sets.push("role = ?");
    args.push(body.role);
  }

  if (sets.length === 0) return bad("Tidak ada field yang diupdate.");

  sets.push("updated_at = ?");
  args.push(new Date().toISOString());
  args.push(id);

  await qRun(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, args);
  return ok({ updated: true });
}

// Soft-delete: users table has no deleted_at, so we deactivate + reject.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!await getAdminFromRequest(req)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const { id } = params;
  const exists = await qGet<{ id: string }>("SELECT id FROM users WHERE id = ?", [id]);
  if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });

  await qRun(
    "UPDATE users SET is_active = 0, status = 'rejected', updated_at = ? WHERE id = ?",
    [new Date().toISOString(), id]
  );
  return ok({ deleted: true });
}
