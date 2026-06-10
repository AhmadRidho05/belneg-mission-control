// GET /api/web/admin/pembina/schools — school dropdown from kkri_target_all
import "server-only";
import { NextRequest } from "next/server";
import { qAll, getAdminFromRequest, ok, bad } from "../../../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!await getAdminFromRequest(req)) return bad("Akses ditolak.", 403);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const kodam = searchParams.get("kodam")?.trim() ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  const rows = await qAll<{
    npsn: string; nama_sekolah: string; bentuk: string;
    kecamatan: string; kab_kota_sekolah: string; provinsi: string;
    kodam: string; unit: string; level: string;
  }>(`
    SELECT npsn, nama_sekolah, bentuk, kecamatan, kab_kota_sekolah, provinsi, kodam, unit, level
    FROM kkri_target_all
    WHERE 1=1
      ${q ? "AND (nama_sekolah LIKE ? OR npsn LIKE ?)" : ""}
      ${kodam ? "AND UPPER(kodam) = UPPER(?)" : ""}
    ORDER BY nama_sekolah ASC
    LIMIT ?
  `, [
    ...(q ? [`%${q}%`, `%${q}%`] : []),
    ...(kodam ? [kodam] : []),
    limit,
  ]);

  return ok({ schools: rows });
}
