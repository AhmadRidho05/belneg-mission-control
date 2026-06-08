// Assignment Table — siapa (Pembina KKRI) ditugaskan ke unit/wilayah mana, status,
// dan progres pelaporan mereka. Dibangun dari data real (kkri_users + kkri_reports +
// dim_kodim/korem/kodam) yang sudah ada di Turso — bukan data dummy.
//
// Untuk visualisasi spasial titik-titik assignment (KODIM/sekolah/petugas), lihat
// /assignment/map (dipindah dari sini — lihat app/assignment/map/page.tsx).
import { qAll } from "../api/v1/_lib";
import AssignmentTableClient, { type AssignmentRow } from "./assignment-table-client";

export const dynamic = "force-dynamic";

export default async function AssignmentPage() {
  const rows = await qAll<AssignmentRow>(`
    SELECT u.id, u.full_name, u.nrp, u.role, u.unit_id, u.is_active,
           u.created_at, u.approved_at, u.last_login_at,
           COALESCE(
             (SELECT name FROM dim_kodim WHERE kodim_id = u.unit_id),
             (SELECT name FROM dim_korem WHERE korem_id = u.unit_id),
             (SELECT name FROM dim_kodam WHERE kodam_id = u.unit_id)
           ) AS unit_name,
           (SELECT kabupaten_kota FROM dim_kodim WHERE kodim_id = u.unit_id) AS kabupaten_kota,
           (SELECT COUNT(*) FROM kkri_reports r WHERE r.user_id = u.id) AS n_laporan,
           (SELECT MAX(r.reported_at) FROM kkri_reports r WHERE r.user_id = u.id) AS last_report_at,
           (
             SELECT s.nama FROM kkri_reports r
             JOIN fact_satpen_dikmen s ON s.npsn = r.sekolah_npsn
             WHERE r.user_id = u.id
             ORDER BY r.reported_at DESC LIMIT 1
           ) AS last_sekolah_nama
    FROM kkri_users u
    WHERE u.deleted_at IS NULL
    ORDER BY u.is_active DESC, u.created_at DESC
  `);

  return <AssignmentTableClient rows={rows} />;
}
