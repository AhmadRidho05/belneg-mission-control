// PATCH /api/web/admin/pembina/change-requests/[id]
// [id] = kkri_users.id — approve copies pending→current and clears pending;
// reject just clears pending.
import "server-only";
import { NextRequest } from "next/server";
import { qGet, qRun, getAdminFromRequest, ok, bad } from "../../../../_lib";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await getAdminFromRequest(req);
  if (!admin) return bad("Akses ditolak.", 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("Invalid JSON"); }

  const action = body.action as string | undefined;
  if (action !== "approve" && action !== "reject") {
    return bad("action harus 'approve' atau 'reject'.");
  }

  const user = await qGet<{
    id: string;
    pangkat_pending: string | null;
    assigned_npsn_pending: string | null;
    assigned_nama_pending: string | null;
  }>(
    `SELECT id, pangkat_pending, assigned_npsn_pending, assigned_nama_pending
     FROM kkri_users WHERE id = ? AND deleted_at IS NULL`,
    [params.id]
  );
  if (!user) return bad("User tidak ditemukan.", 404);
  if (!user.pangkat_pending && !user.assigned_npsn_pending) {
    return bad("Tidak ada perubahan pending untuk user ini.", 409);
  }

  if (action === "reject") {
    await qRun(
      `UPDATE kkri_users
       SET pangkat_pending = NULL, assigned_npsn_pending = NULL, assigned_nama_pending = NULL
       WHERE id = ?`,
      [params.id]
    );
    return ok({ ok: true, action: "rejected" });
  }

  // approve — copy pending → current, then clear all pending fields
  const sets: string[] = [];
  if (user.pangkat_pending) {
    sets.push("pangkat = pangkat_pending");
  }
  if (user.assigned_npsn_pending) {
    sets.push("assigned_npsn = assigned_npsn_pending");
    sets.push("assigned_nama = assigned_nama_pending");
  }
  sets.push("pangkat_pending = NULL", "assigned_npsn_pending = NULL", "assigned_nama_pending = NULL");

  await qRun(
    `UPDATE kkri_users SET ${sets.join(", ")} WHERE id = ?`,
    [params.id]
  );
  return ok({ ok: true, action: "approved" });
}
