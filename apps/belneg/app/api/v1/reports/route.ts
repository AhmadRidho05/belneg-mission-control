import { NextRequest } from "next/server";
import { qAll, qGet, qRun, requireUser, newId, ok, bad } from "../_lib";

export const dynamic = "force-dynamic";

type ReportInput = {
  sekolah_npsn?: string;
  jenis_kegiatan: string;
  materi?: string;
  peserta_laki?: number;
  peserta_perempuan?: number;
  hasil?: string;
  kendala?: string;
  situasi_lapangan?: string;
  lat?: number;
  lng?: number;
  reported_at?: string;     // ISO timestamp from device; defaults to now
  photo_urls?: { url: string; caption?: string }[];
};

// POST → create a new report (with optional photo URLs already uploaded)
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  let body: ReportInput;
  try { body = await req.json(); } catch { return bad("invalid json"); }

  if (!body.jenis_kegiatan || body.jenis_kegiatan.trim().length < 2) {
    return bad("jenis_kegiatan wajib diisi");
  }

  const id = newId("rpt");
  const reportedAt = body.reported_at || new Date().toISOString();

  await qRun(
    `INSERT INTO kkri_reports(
       id, user_id, unit_id, sekolah_npsn, jenis_kegiatan, materi,
       peserta_laki, peserta_perempuan, hasil, kendala, situasi_lapangan,
       lat, lng, reported_at
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      auth.user.sub,
      auth.user.unit_id ?? null,
      body.sekolah_npsn?.trim() || null,
      body.jenis_kegiatan.trim().slice(0, 200),
      body.materi?.trim().slice(0, 2000) || null,
      Math.max(0, Number(body.peserta_laki) || 0),
      Math.max(0, Number(body.peserta_perempuan) || 0),
      body.hasil?.trim().slice(0, 4000) || null,
      body.kendala?.trim().slice(0, 4000) || null,
      body.situasi_lapangan?.trim().slice(0, 10000) || null,
      typeof body.lat === "number" ? body.lat : null,
      typeof body.lng === "number" ? body.lng : null,
      reportedAt,
    ]
  );

  // Insert photo references (URLs already uploaded via /uploads/photo)
  if (Array.isArray(body.photo_urls) && body.photo_urls.length > 0) {
    for (const p of body.photo_urls.slice(0, 12)) {
      if (!p.url) continue;
      await qRun(
        `INSERT INTO kkri_report_photos(id, report_id, url, caption) VALUES (?,?,?,?)`,
        [newId("pho"), id, String(p.url).slice(0, 500), p.caption?.slice(0, 500) || null]
      );
    }
  }

  return ok({ id, status: "submitted" }, { status: 201 });
}

// GET → list reports for current user (own reports), or all if ADMIN
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(sp.get("limit") || "30", 10), 100);
  const offset = Math.max(parseInt(sp.get("offset") || "0", 10), 0);

  const where: string[] = [];
  const args: any[] = [];
  if (auth.user.role !== "ADMIN") {
    where.push("r.user_id = ?");
    args.push(auth.user.sub);
  }
  if (sp.get("status")) {
    where.push("r.status = ?");
    args.push(sp.get("status"));
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const totalRow = await qGet<{ n: number }>(
    `SELECT COUNT(*) AS n FROM kkri_reports r ${whereSql}`,
    args
  );

  const rows = await qAll<any>(
    `SELECT
       r.id, r.user_id, r.unit_id, r.sekolah_npsn, r.jenis_kegiatan, r.materi,
       r.peserta_laki, r.peserta_perempuan, r.hasil, r.kendala, r.situasi_lapangan,
       r.lat, r.lng, r.reported_at, r.submitted_at, r.status,
       (SELECT s.nama FROM fact_satpen_dikmen s WHERE s.npsn = r.sekolah_npsn) AS sekolah_nama,
       (SELECT COUNT(*) FROM kkri_report_photos p WHERE p.report_id = r.id) AS n_photos
     FROM kkri_reports r
     ${whereSql}
     ORDER BY r.submitted_at DESC
     LIMIT ? OFFSET ?`,
    [...args, limit, offset]
  );

  return ok({ total: totalRow?.n ?? 0, limit, offset, rows });
}
