import { redirect } from "next/navigation";
import { getWebSession } from "@/lib/server-auth";
import { qAll, qGet } from "../../api/v1/_lib";
import KoramilStressClient from "./koramil-stress-client";

export const dynamic = "force-dynamic";

export default async function KoramilStressPage() {
  const session = await getWebSession();
  if (!session || session.role !== "admin") redirect("/dashboard");

  const [stats, perKoramil, perKodam] = await Promise.all([
    qGet<any>(`
      SELECT
        (SELECT COUNT(*) FROM kkri_target_koramil) AS total_koramil,
        (SELECT COUNT(DISTINCT kode_kodim) FROM kkri_target_koramil WHERE kode_kodim IS NOT NULL) AS distinct_kodim,
        (SELECT COUNT(DISTINCT kodam) FROM kkri_target_koramil) AS distinct_kodam
    `),

    // Per-koramil stress index:
    //   load = sekolah_di_kodim / koramil_di_kodim   (kodim-level average)
    //   stress_index = normalized(load) × 100
    //   All koramil within the same kodim share the same load score.
    qAll<any>(`
      WITH kodim_stats AS (
        SELECT
          kode_kodim,
          MAX(kodam)    AS kodam_name,
          MAX(kab_kota) AS kab_kota,
          COUNT(DISTINCT koramil) AS n_koramil,
          COUNT(*)                AS n_sekolah,
          CAST(COUNT(*) AS REAL) / CAST(COUNT(DISTINCT koramil) AS REAL) AS load_per_koramil
        FROM kkri_target_koramil
        WHERE kode_kodim IS NOT NULL AND koramil IS NOT NULL
        GROUP BY kode_kodim
      ),
      max_load AS (SELECT MAX(load_per_koramil) AS mx FROM kodim_stats),
      koramil_list AS (
        SELECT DISTINCT kode_kodim, koramil, kodam AS kodam_name, kab_kota
        FROM kkri_target_koramil
        WHERE kode_kodim IS NOT NULL AND koramil IS NOT NULL
      )
      SELECT
        kl.kode_kodim,
        kl.koramil            AS koramil_name,
        kl.kodam_name,
        kl.kab_kota,
        ks.n_sekolah          AS schools_in_district,
        ks.n_koramil          AS koramils_in_district,
        ROUND(ks.load_per_koramil, 1) AS schools_per_koramil,
        ROUND(100.0 * ks.load_per_koramil / NULLIF((SELECT mx FROM max_load), 0), 1) AS stress_index
      FROM koramil_list kl
      JOIN kodim_stats ks ON ks.kode_kodim = kl.kode_kodim
      ORDER BY stress_index DESC
    `),

    // Kodam-level summary
    qAll<any>(`
      WITH kodim_stats AS (
        SELECT
          MAX(kodam) AS kodam_name,
          COUNT(DISTINCT koramil) AS n_koramil,
          COUNT(*)                AS n_sekolah,
          CAST(COUNT(*) AS REAL) / CAST(COUNT(DISTINCT koramil) AS REAL) AS load_per_koramil
        FROM kkri_target_koramil
        WHERE kode_kodim IS NOT NULL AND koramil IS NOT NULL
        GROUP BY kode_kodim
      )
      SELECT
        kodam_name,
        SUM(n_koramil)  AS n_koramils,
        SUM(n_sekolah)  AS total_schools,
        ROUND(AVG(load_per_koramil), 1) AS avg_schools_per_koramil
      FROM kodim_stats
      GROUP BY kodam_name
      ORDER BY avg_schools_per_koramil DESC
    `),
  ]);

  return <KoramilStressClient stats={stats} perKoramil={perKoramil} perKodam={perKodam} />;
}
