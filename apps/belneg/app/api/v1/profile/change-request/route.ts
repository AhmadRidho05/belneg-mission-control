// POST /api/v1/profile/change-request  — Pembina submits a profile change request
// GET  /api/v1/profile/change-request  — Pembina checks their current pending status
//
// Stores pending changes as inline columns on kkri_users
// (pangkat_pending, assigned_npsn_pending, assigned_nama_pending) so the
// admin "Pengajuan Profil" tab can read them directly.
import "server-only";
import { NextRequest } from "next/server";
import { qGet, qRun, requireUser, ok, bad } from "../../_lib";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set(["pangkat", "sekolah", "both"]);

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const u = await qGet<any>(
    `SELECT pangkat, pangkat_pending, assigned_npsn, assigned_nama,
            assigned_npsn_pending, assigned_nama_pending
     FROM kkri_users WHERE id = ? AND deleted_at IS NULL`,
    [auth.user.sub]
  );
  if (!u) return bad("User tidak ditemukan.", 404);

  const hasPending = u.pangkat_pending != null || u.assigned_npsn_pending != null;
  if (!hasPending) return ok({ pending: null });

  return ok({
    pending: {
      change_type: u.pangkat_pending && u.assigned_npsn_pending ? "both"
                 : u.pangkat_pending ? "pangkat" : "sekolah",
      current_pangkat: u.pangkat,
      requested_pangkat: u.pangkat_pending,
      current_sekolah_npsn: u.assigned_npsn,
      current_sekolah_nama: u.assigned_nama,
      requested_sekolah_npsn: u.assigned_npsn_pending,
      requested_sekolah_nama: u.assigned_nama_pending,
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("Invalid JSON"); }

  const change_type = (body.change_type as string | undefined)?.trim() ?? "";
  if (!VALID_TYPES.has(change_type)) {
    return bad("change_type harus 'pangkat', 'sekolah', atau 'both'.");
  }

  const user = await qGet<{ id: string; pangkat: string | null; assigned_npsn: string | null }>(
    `SELECT id, pangkat, assigned_npsn FROM kkri_users WHERE id = ? AND deleted_at IS NULL`,
    [auth.user.sub]
  );
  if (!user) return bad("User tidak ditemukan.", 404);

  const sets: string[] = [];
  const args: (string | null)[] = [];

  if (change_type === "pangkat" || change_type === "both") {
    const rp = (body.requested_pangkat as string | undefined)?.trim() ?? "";
    if (!rp) return bad("requested_pangkat wajib diisi.");
    if (user.pangkat === rp) return bad("Pangkat yang diajukan sama dengan pangkat saat ini.");
    sets.push("pangkat_pending = ?");
    args.push(rp);
  }

  if (change_type === "sekolah" || change_type === "both") {
    const rn = (body.requested_sekolah_npsn as string | undefined)?.trim() ?? "";
    if (!rn) return bad("requested_sekolah_npsn wajib diisi.");

    const school = await qGet<{ npsn: string; nama_sekolah: string }>(
      `SELECT npsn, nama_sekolah FROM kkri_target_all WHERE npsn = ? LIMIT 1`,
      [rn]
    );
    if (!school) return bad("Sekolah dengan NPSN tersebut tidak ditemukan di data target.", 404);
    if (user.assigned_npsn === rn) return bad("Sekolah yang diajukan sama dengan sekolah binaan saat ini.");

    sets.push("assigned_npsn_pending = ?", "assigned_nama_pending = ?");
    args.push(school.npsn, school.nama_sekolah);
  }

  args.push(auth.user.sub);
  await qRun(`UPDATE kkri_users SET ${sets.join(", ")} WHERE id = ?`, args);

  return ok(
    { status: "pending", message: "Pengajuan berhasil dikirim. Menunggu persetujuan admin." },
    { status: 201 }
  );
}
