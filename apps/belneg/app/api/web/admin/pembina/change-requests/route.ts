// GET /api/web/admin/pembina/change-requests
// Reads inline pending fields from kkri_users — the mobile app writes to
// pangkat_pending / assigned_npsn_pending directly, not to kkri_profile_change_requests.
import "server-only";
import { NextRequest } from "next/server";
import { qAll, getAdminFromRequest, ok, bad } from "../../../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await getAdminFromRequest(req)) return bad("Akses ditolak.", 403);

  const rows = await qAll<any>(`
    SELECT
      u.id                     AS id,
      u.id                     AS user_id,
      u.full_name,
      u.phone,
      u.nrp,
      u.role,
      u.unit_id,
      u.pangkat                AS current_pangkat,
      u.pangkat_pending        AS requested_pangkat,
      u.assigned_npsn          AS current_sekolah_npsn,
      u.assigned_nama          AS current_sekolah_nama,
      u.assigned_npsn_pending  AS requested_sekolah_npsn,
      u.assigned_nama_pending  AS requested_sekolah_nama,
      CASE
        WHEN u.pangkat_pending IS NOT NULL AND u.assigned_npsn_pending IS NOT NULL THEN 'both'
        WHEN u.pangkat_pending IS NOT NULL THEN 'pangkat'
        ELSE 'sekolah'
      END AS change_type,
      u.created_at
    FROM kkri_users u
    WHERE u.deleted_at IS NULL
      AND (u.pangkat_pending IS NOT NULL OR u.assigned_npsn_pending IS NOT NULL)
    ORDER BY u.created_at DESC
  `);

  return ok({ requests: rows });
}
