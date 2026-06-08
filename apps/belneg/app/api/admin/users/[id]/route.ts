import { NextRequest, NextResponse } from "next/server";
import { qRun, qGet, qAll } from "../../../v1/_lib";

export const dynamic = "force-dynamic";

// GET — full user detail (profile + reports + GPS history + assignment scope)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;

  const user = await qGet<any>(`
    SELECT u.id, u.email, u.phone, u.full_name, u.nrp, u.role, u.unit_id,
           u.is_active, u.deleted_at, u.created_at, u.approved_at, u.last_login_at,
           (SELECT name FROM dim_kodim WHERE kodim_id = u.unit_id) AS kodim_name,
           (SELECT name FROM dim_korem WHERE korem_id = u.unit_id) AS korem_name,
           (SELECT name FROM dim_kodam WHERE kodam_id = u.unit_id) AS kodam_name
    FROM kkri_users u WHERE u.id = ?
  `, [id]);
  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  // All reports
  const reports = await qAll<any>(`
    SELECT r.id, r.sekolah_npsn, r.jenis_kegiatan, r.materi,
           r.peserta_laki, r.peserta_perempuan, r.hasil, r.kendala,
           r.lat, r.lng, r.reported_at, r.submitted_at, r.status,
           (SELECT s.nama FROM fact_satpen_dikmen s WHERE s.npsn = r.sekolah_npsn) AS sekolah_nama,
           (SELECT s.kecamatan FROM fact_satpen_dikmen s WHERE s.npsn = r.sekolah_npsn) AS sekolah_kec,
           (SELECT s.kab_kota FROM fact_satpen_dikmen s WHERE s.npsn = r.sekolah_npsn) AS sekolah_kab,
           (SELECT COUNT(*) FROM kkri_report_photos p WHERE p.report_id = r.id) AS n_photos
    FROM kkri_reports r
    WHERE r.user_id = ?
    ORDER BY r.submitted_at DESC
  `, [id]);

  // GPS history (sorted asc for polyline rendering)
  const gps = reports
    .filter(r => r.lat != null && r.lng != null)
    .map(r => ({
      report_id: r.id,
      lat: r.lat as number,
      lng: r.lng as number,
      reported_at: r.reported_at,
      jenis_kegiatan: r.jenis_kegiatan,
      sekolah_nama: r.sekolah_nama,
    }))
    .sort((a, b) => new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime());

  // Assignment scope — list of schools this user can report on (based on unit_id)
  let assignment_count = 0;
  let assignment_sample: any[] = [];
  let assignment_geo = { center: null as { lat: number; lng: number } | null };

  if (user.unit_id) {
    let where = "";
    const args: any[] = [];
    if (user.unit_id.startsWith("KODAM-")) {
      where = "s.kab_norm IN (SELECT kabupaten_norm FROM dim_kodim WHERE kodam_id = ?)";
      args.push(user.unit_id);
    } else if (user.unit_id.startsWith("KOREM-")) {
      where = "s.kab_norm IN (SELECT kabupaten_norm FROM dim_kodim WHERE korem_id = ?)";
      args.push(user.unit_id);
    } else if (user.unit_id.startsWith("KODIM-")) {
      where = "s.kab_norm = (SELECT kabupaten_norm FROM dim_kodim WHERE kodim_id = ?)";
      args.push(user.unit_id);
    }
    if (where) {
      const c = await qGet<{ n: number }>(
        `SELECT COUNT(*) AS n FROM fact_satpen_dikmen s WHERE ${where}`, args);
      assignment_count = c?.n ?? 0;

      assignment_sample = await qAll<any>(
        `SELECT s.npsn, s.nama, s.bentuk_pendidikan AS bentuk, UPPER(s.status_sekolah) AS status,
                COALESCE(s.akreditasi, 'BT') AS akr,
                s.kecamatan, s.kab_kota,
                s.lintang AS lat, s.bujur AS lng
         FROM fact_satpen_dikmen s WHERE ${where}
         ORDER BY s.nama LIMIT 200`, args);

      // Unit centroid for map default-center
      if (user.unit_id.startsWith("KODIM-")) {
        const c2 = await qGet<{ lat: number; lng: number }>(
          `SELECT lat, lng FROM dim_kodim WHERE kodim_id = ?`, [user.unit_id]);
        if (c2) assignment_geo.center = { lat: c2.lat, lng: c2.lng };
      } else if (user.unit_id.startsWith("KOREM-")) {
        const c2 = await qGet<{ lat: number; lng: number }>(
          `SELECT lat, lng FROM dim_korem WHERE korem_id = ?`, [user.unit_id]);
        if (c2) assignment_geo.center = { lat: c2.lat, lng: c2.lng };
      } else if (user.unit_id.startsWith("KODAM-")) {
        const c2 = await qGet<{ lat: number; lng: number }>(
          `SELECT lat, lng FROM dim_kodam WHERE kodam_id = ?`, [user.unit_id]);
        if (c2) assignment_geo.center = { lat: c2.lat, lng: c2.lng };
      }
    }
  }

  return NextResponse.json({
    user,
    reports,
    gps,
    assignment: {
      count: assignment_count,
      sample: assignment_sample,
      center: assignment_geo.center,
    },
  });
}

// PATCH — update user fields (approve, reactivate, etc)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const exists = await qGet<{ id: string }>(`SELECT id FROM kkri_users WHERE id = ?`, [id]);
  if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });

  const sets: string[] = [];
  const args: any[] = [];
  if (typeof body.is_active === "number") { sets.push("is_active = ?"); args.push(body.is_active ? 1 : 0); }
  if (typeof body.role === "string") { sets.push("role = ?"); args.push(body.role); }
  if (typeof body.unit_id === "string") { sets.push("unit_id = ?"); args.push(body.unit_id || null); }
  if (typeof body.full_name === "string") { sets.push("full_name = ?"); args.push(body.full_name.slice(0, 200)); }
  if (typeof body.nrp === "string") { sets.push("nrp = ?"); args.push(body.nrp.slice(0, 50)); }
  if (body.is_active === 1) { sets.push("approved_at = CURRENT_TIMESTAMP"); }
  if (body.restore === true) { sets.push("deleted_at = NULL"); }

  if (sets.length === 0) return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  args.push(id);
  await qRun(`UPDATE kkri_users SET ${sets.join(", ")} WHERE id = ?`, args);
  return NextResponse.json({ updated: true });
}

// DELETE — soft delete (set deleted_at)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;
  const exists = await qGet<{ id: string }>(`SELECT id FROM kkri_users WHERE id = ?`, [id]);
  if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Soft delete + revoke access (set is_active=0)
  await qRun(`UPDATE kkri_users SET deleted_at = CURRENT_TIMESTAMP, is_active = 0 WHERE id = ?`, [id]);
  return NextResponse.json({ deleted: true });
}
