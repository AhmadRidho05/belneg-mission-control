import { NextRequest } from "next/server";
import { qAll, requireUser, ok } from "../_lib";

export const dynamic = "force-dynamic";

// Returns the list of sekolah a pelapor can submit reports for, scoped to their unit.
// KODAM   → semua kab di kodam-nya
// KOREM   → semua kab di korem-nya (or fallback to kodam scope if korem has no direct kab list)
// KODIM   → kab tunggal kodim itu
// KORAMIL → mirror dari kodim parent (kemkud sederhana — koramil rep at kodim level)
// ADMIN   → semua sekolah (limit 500 — needs search param eventually)
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "200", 10), 500);
  const search = (req.nextUrl.searchParams.get("q") || "").trim().toUpperCase();
  const unit = auth.user.unit_id;

  let where = "";
  const args: any[] = [];

  if (auth.user.role === "ADMIN") {
    // no scope filter
  } else if (!unit) {
    return ok({ rows: [], note: "unit_id not assigned yet" });
  } else if (unit.startsWith("KODAM-")) {
    where = "s.kab_norm IN (SELECT kabupaten_norm FROM dim_kodim WHERE kodam_id = ?)";
    args.push(unit);
  } else if (unit.startsWith("KOREM-")) {
    where = "s.kab_norm IN (SELECT kabupaten_norm FROM dim_kodim WHERE korem_id = ?)";
    args.push(unit);
  } else if (unit.startsWith("KODIM-")) {
    where = "s.kab_norm = (SELECT kabupaten_norm FROM dim_kodim WHERE kodim_id = ?)";
    args.push(unit);
  }

  if (search) {
    where = (where ? where + " AND " : "") + "(UPPER(s.nama) LIKE ? OR s.npsn LIKE ?)";
    args.push(`%${search}%`, `%${search}%`);
  }

  const sql = `
    SELECT s.npsn, s.nama, s.bentuk_pendidikan AS bentuk, UPPER(s.status_sekolah) AS status,
           COALESCE(s.akreditasi, 'BT') AS akr,
           s.kecamatan, s.kab_kota, REPLACE(s.provinsi, 'PROV. ', '') AS provinsi,
           s.lintang, s.bujur
    FROM fact_satpen_dikmen s
    ${where ? "WHERE " + where : ""}
    ORDER BY s.nama
    LIMIT ?
  `;
  const rows = await qAll<any>(sql, [...args, limit]);
  return ok({ rows, count: rows.length });
}
