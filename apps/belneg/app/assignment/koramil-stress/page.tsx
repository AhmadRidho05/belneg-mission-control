import { qAll, qGet } from "../../api/v1/_lib";
import KoramilStressClient from "./koramil-stress-client";

export const dynamic = "force-dynamic";

// Koramil Stress Index = weighted composite per koramil:
//   60%  Load        — schools_per_koramil_in_parent_kodim_district,
//                      normalized 0..100 across all koramils
//   30%  Ops gap     — % of (address, phone, danramil_name, pangkat) missing
//   10%  Wilayah     — terrain factor: KR* (remote) +20, KM (kota) 0, else 10
//
// A koramil scores high when its parent kodim covers many schools relative
// to # sibling koramils AND its operational data is incomplete AND it sits
// in a remote bentuk wilayah.
export default async function KoramilStressPage() {
  const [stats, perKoramil, perKodam, byBentuk] = await Promise.all([
    qGet<any>(`
      SELECT
        (SELECT COUNT(*) FROM dim_koramil) AS total_koramil,
        (SELECT COUNT(DISTINCT kodim_id) FROM dim_koramil WHERE kodim_id IS NOT NULL) AS distinct_kodim,
        (SELECT COUNT(DISTINCT kodam_id) FROM dim_koramil) AS distinct_kodam,
        (SELECT COUNT(*) FROM dim_koramil WHERE address IS NOT NULL) AS with_address,
        (SELECT COUNT(*) FROM dim_koramil WHERE phone_mobile IS NOT NULL OR phone_office IS NOT NULL) AS with_phone
    `),
    qAll<any>(`
      WITH school_count AS (
        SELECT k.kodim_id, COUNT(*) AS n_schools
        FROM dim_kodim k
        JOIN fact_satpen_dikmen s ON s.kab_norm = k.kabupaten_norm
        WHERE s.bentuk_pendidikan IN ('SMA','SMK','MA','MAK')
        GROUP BY k.kodim_id
      ),
      koramil_count AS (
        SELECT kodim_id, COUNT(*) AS n_koramils
        FROM dim_koramil WHERE kodim_id IS NOT NULL
        GROUP BY kodim_id
      ),
      load_per AS (
        SELECT km.koramil_id, km.kodim_id, km.kodam_id, km.name AS koramil_name,
               km.short_name, km.danramil_name, km.pangkat, km.phone_mobile, km.address,
               km.bentuk_wilayah,
               COALESCE(sc.n_schools, 0)  AS schools_in_district,
               COALESCE(kc.n_koramils, 1) AS koramils_in_district,
               CAST(COALESCE(sc.n_schools, 0) AS REAL) / CAST(COALESCE(kc.n_koramils, 1) AS REAL) AS schools_per_koramil
        FROM dim_koramil km
        LEFT JOIN school_count   sc ON sc.kodim_id = km.kodim_id
        LEFT JOIN koramil_count  kc ON kc.kodim_id = km.kodim_id
      ),
      norm AS (SELECT MAX(schools_per_koramil) AS max_load FROM load_per)
      SELECT lp.koramil_id, lp.kodim_id, lp.kodam_id,
             lp.koramil_name, lp.short_name, lp.danramil_name, lp.pangkat,
             lp.schools_in_district, lp.koramils_in_district,
             ROUND(lp.schools_per_koramil, 1) AS schools_per_koramil,
             kd.name AS kodim_name, ka.name AS kodam_name,
             ROUND(100.0 * lp.schools_per_koramil / NULLIF((SELECT max_load FROM norm), 0), 1) AS load_score,
             (CASE WHEN lp.address       IS NULL OR lp.address       = '' THEN 25 ELSE 0 END +
              CASE WHEN lp.phone_mobile  IS NULL OR lp.phone_mobile  = '' THEN 25 ELSE 0 END +
              CASE WHEN lp.danramil_name IS NULL OR lp.danramil_name = '' THEN 25 ELSE 0 END +
              CASE WHEN lp.pangkat       IS NULL OR lp.pangkat       = '' THEN 25 ELSE 0 END) AS ops_gap_score,
             CASE WHEN lp.bentuk_wilayah LIKE 'KR%' THEN 20
                  WHEN lp.bentuk_wilayah = 'KM'     THEN 0
                  ELSE 10 END AS wilayah_factor,
             ROUND(
               0.6 * (100.0 * lp.schools_per_koramil / NULLIF((SELECT max_load FROM norm), 0)) +
               0.3 * (CASE WHEN lp.address       IS NULL OR lp.address       = '' THEN 25 ELSE 0 END +
                      CASE WHEN lp.phone_mobile  IS NULL OR lp.phone_mobile  = '' THEN 25 ELSE 0 END +
                      CASE WHEN lp.danramil_name IS NULL OR lp.danramil_name = '' THEN 25 ELSE 0 END +
                      CASE WHEN lp.pangkat       IS NULL OR lp.pangkat       = '' THEN 25 ELSE 0 END) +
               0.1 * (CASE WHEN lp.bentuk_wilayah LIKE 'KR%' THEN 20
                           WHEN lp.bentuk_wilayah = 'KM'     THEN 0
                           ELSE 10 END),
             1) AS stress_index
      FROM load_per lp
      LEFT JOIN dim_kodim kd ON kd.kodim_id = lp.kodim_id
      LEFT JOIN dim_kodam ka ON ka.kodam_id = lp.kodam_id
      ORDER BY stress_index DESC
    `),
    qAll<any>(`
      WITH school_count AS (
        SELECT k.kodim_id, COUNT(*) AS n_schools
        FROM dim_kodim k JOIN fact_satpen_dikmen s ON s.kab_norm = k.kabupaten_norm
        WHERE s.bentuk_pendidikan IN ('SMA','SMK','MA','MAK')
        GROUP BY k.kodim_id
      ),
      koramil_count AS (
        SELECT kodim_id, COUNT(*) AS n FROM dim_koramil WHERE kodim_id IS NOT NULL GROUP BY kodim_id
      )
      SELECT ka.kodam_id, ka.name AS kodam_name,
             COUNT(km.koramil_id) AS n_koramils,
             ROUND(AVG(CAST(COALESCE(sc.n_schools, 0) AS REAL) / CAST(COALESCE(kc.n, 1) AS REAL)), 1) AS avg_schools_per_koramil,
             SUM(COALESCE(sc.n_schools, 0)) AS total_schools
      FROM dim_koramil km
      JOIN dim_kodam ka ON ka.kodam_id = km.kodam_id
      LEFT JOIN school_count sc ON sc.kodim_id = km.kodim_id
      LEFT JOIN koramil_count kc ON kc.kodim_id = km.kodim_id
      GROUP BY ka.kodam_id
      ORDER BY avg_schools_per_koramil DESC
    `),
    qAll<any>(`
      SELECT COALESCE(bentuk_wilayah, '(unset)') AS bentuk, COUNT(*) AS n
      FROM dim_koramil GROUP BY bentuk_wilayah ORDER BY n DESC
    `),
  ]);

  return <KoramilStressClient stats={stats} perKoramil={perKoramil} perKodam={perKodam} byBentuk={byBentuk} />;
}
