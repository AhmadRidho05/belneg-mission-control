import { qAll } from "../../api/v1/_lib";
import ReportsClient from "./reports-client";
import { getWebSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const session = await getWebSession();
  const isAdmin = session?.role === "admin";
  // Fetch ALL reports with denormalized join fields for client-side filtering.
  // For an admin tool, 3k+ rows is fine (~1.5MB JSON). Subsequent filters are
  // instant — no API roundtrip.
  // Initial fetch: lean fields only (no full text bodies — those load on modal open).
  // Search uses jenis_kegiatan + user_name + sekolah_nama + kab — all sent here.
  // Full materi/hasil/kendala/situasi_lapangan fetched via /api/admin/reports/[id] when modal opens.
  const rows = await qAll<any>(`
    SELECT r.id, r.user_id, r.unit_id, r.sekolah_npsn,
           r.jenis_kegiatan,
           r.peserta_laki, r.peserta_perempuan,
           r.lat, r.lng, r.reported_at, r.submitted_at, r.status,
           u.full_name AS user_name, u.role AS user_role,
           s.nama AS sekolah_nama, s.kab_kota AS sekolah_kab,
           REPLACE(s.provinsi, 'PROV. ', '') AS sekolah_provinsi,
           s.bentuk_pendidikan AS sekolah_bentuk,
           kdi.name AS kodim_name,
           COALESCE(kdm.name,
             (SELECT kd2.name FROM dim_korem kr2
                JOIN dim_kodam kd2 ON kd2.kodam_id = kr2.kodam_id
                WHERE kr2.korem_id = r.unit_id),
             (SELECT kd3.name FROM dim_kodam kd3 WHERE kd3.kodam_id = r.unit_id)
           ) AS kodam_name,
           (SELECT COUNT(*) FROM kkri_report_photos p WHERE p.report_id = r.id) AS n_photos
    FROM kkri_reports r
    LEFT JOIN kkri_users u ON u.id = r.user_id
    LEFT JOIN fact_satpen_dikmen s ON s.npsn = r.sekolah_npsn
    LEFT JOIN dim_kodim kdi ON kdi.kodim_id = r.unit_id
    LEFT JOIN dim_kodam kdm ON kdm.kodam_id = kdi.kodam_id
    ORDER BY r.submitted_at DESC
  `);
  return <ReportsClient reports={rows} isAdmin={isAdmin} />;
}
