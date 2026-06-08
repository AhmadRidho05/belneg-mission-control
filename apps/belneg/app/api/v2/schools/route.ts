// Public endpoint — no auth required (sign-up flow needs this before
// user has a token). Filters fact_satpen_dikmen down to SMA-family schools.
import { NextRequest } from "next/server";
import { qAll, ok } from "../_lib";

export const dynamic = "force-dynamic";

const ALLOWED_BENTUK = ["SMA", "SMK", "MA", "MAK"];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const kab = (sp.get("kab") || "").trim();
  const provinsi = (sp.get("provinsi") || "").trim();
  const limit = Math.min(Math.max(parseInt(sp.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(parseInt(sp.get("offset") || "0", 10) || 0, 0);

  const conds: string[] = [`bentuk_pendidikan IN (${ALLOWED_BENTUK.map(() => "?").join(",")})`];
  const args: any[] = [...ALLOWED_BENTUK];

  if (q) {
    conds.push(`(nama LIKE ? OR npsn LIKE ?)`);
    args.push(`%${q}%`, `${q}%`);
  }
  if (kab) {
    conds.push(`kab_kota LIKE ?`);
    args.push(`%${kab}%`);
  }
  if (provinsi) {
    conds.push(`provinsi LIKE ?`);
    args.push(`%${provinsi}%`);
  }

  const whereSql = conds.join(" AND ");

  const [rows, totalRow] = await Promise.all([
    qAll<any>(
      `SELECT npsn, nama, bentuk_pendidikan AS bentuk, UPPER(status_sekolah) AS status,
              kecamatan, kab_kota, provinsi
       FROM fact_satpen_dikmen
       WHERE ${whereSql}
       ORDER BY nama ASC
       LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    ),
    qAll<{ n: number }>(
      `SELECT COUNT(*) AS n FROM fact_satpen_dikmen WHERE ${whereSql}`,
      args
    ),
  ]);

  return ok({
    rows,
    count: rows.length,
    total: totalRow[0]?.n ?? 0,
    limit,
    offset,
  });
}
