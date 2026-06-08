// Derives 8–15 personalised skills/knowledge from the user's TOP-5 career
// match — the ones with importance > 3.5 across at least one of the top
// careers, deduplicated across all 5, with avg_importance and
// avg_target_level aggregated.
import { NextRequest } from "next/server";
import { qAll, qGet, requireSiswa, ok, bad } from "../../_lib";

export const dynamic = "force-dynamic";

const SCALE_LABELS = {
  "1": "Belum pernah belajar",
  "2": "Pernah dengar/baca",
  "3": "Pernah belajar/praktik dasar",
  "4": "Cukup kompeten",
  "5": "Mahir/profesional",
};

// Per spec: 8–15 items. Below is just a hint to clients; the actual list
// length is determined by the importance>3.5 filter.

export async function GET(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;

  const limitTop = Math.min(parseInt(req.nextUrl.searchParams.get("top_careers") || "5", 10) || 5, 10);

  const a = await qGet<any>(
    `SELECT id, riasec_realistic AS r, riasec_investigative AS i,
            riasec_artistic AS a, riasec_social AS s,
            riasec_enterprising AS e, riasec_conventional AS c
     FROM siswa_assessments WHERE user_id = ?
     ORDER BY submitted_at DESC LIMIT 1`,
    [auth.user.sub]
  );
  if (!a) return bad("belum ada asesmen — submit dulu di /api/v2/assessment/submit", 404);

  // Re-compute top N careers via the same cosine-similarity logic as
  // /api/v2/careers/match. Returns just the soc codes.
  const careers = await qAll<{ onet_soc_code: string }>(
    `WITH occ AS (
       SELECT o.onet_soc_code,
         MAX(CASE WHEN oi.riasec_dim = 'Realistic'     THEN oi.score END) AS r,
         MAX(CASE WHEN oi.riasec_dim = 'Investigative' THEN oi.score END) AS i,
         MAX(CASE WHEN oi.riasec_dim = 'Artistic'      THEN oi.score END) AS a,
         MAX(CASE WHEN oi.riasec_dim = 'Social'        THEN oi.score END) AS s,
         MAX(CASE WHEN oi.riasec_dim = 'Enterprising'  THEN oi.score END) AS e,
         MAX(CASE WHEN oi.riasec_dim = 'Conventional'  THEN oi.score END) AS c
       FROM onet_occupations o
       JOIN onet_interests oi ON oi.onet_soc_code = o.onet_soc_code
       GROUP BY o.onet_soc_code
       HAVING r IS NOT NULL AND i IS NOT NULL AND a IS NOT NULL
          AND s IS NOT NULL AND e IS NOT NULL AND c IS NOT NULL
     )
     SELECT onet_soc_code,
       ((? * r + ? * i + ? * a + ? * s + ? * e + ? * c) /
        (SQRT(? * ? + ? * ? + ? * ? + ? * ? + ? * ? + ? * ?) *
         SQRT(r * r + i * i + a * a + s * s + e * e + c * c))) AS sim
     FROM occ
     ORDER BY sim DESC LIMIT ?`,
    [
      a.r, a.i, a.a, a.s, a.e, a.c,
      a.r, a.r, a.i, a.i, a.a, a.a, a.s, a.s, a.e, a.e, a.c, a.c,
      limitTop,
    ]
  );
  const topSocCodes = careers.map(r => r.onet_soc_code);
  if (topSocCodes.length === 0) return bad("tidak ada karier yang cocok — coba ulangi asesmen", 404);

  const placeholders = topSocCodes.map(() => "?").join(",");

  // Aggregate skills + knowledge across the top careers, importance>3.5.
  // appears_in_careers = group_concat of soc codes for traceability.
  const [skills, knowledge] = await Promise.all([
    qAll<any>(
      `SELECT s.element_id, s.element_name, s.category,
              'skill'                                       AS kind,
              ROUND(AVG(os.importance), 2)                  AS avg_importance,
              ROUND(AVG(os.level),      2)                  AS avg_target_level,
              GROUP_CONCAT(DISTINCT os.onet_soc_code)       AS appears_in_careers
       FROM onet_occupation_skills os
       JOIN onet_skills s ON s.element_id = os.element_id
       WHERE os.onet_soc_code IN (${placeholders}) AND os.importance > 3.5
       GROUP BY s.element_id
       ORDER BY avg_importance DESC`,
      topSocCodes
    ),
    qAll<any>(
      `SELECT k.element_id, k.element_name, k.category,
              'knowledge'                                   AS kind,
              ROUND(AVG(ok.importance), 2)                  AS avg_importance,
              ROUND(AVG(ok.level),      2)                  AS avg_target_level,
              GROUP_CONCAT(DISTINCT ok.onet_soc_code)       AS appears_in_careers
       FROM onet_occupation_knowledge ok
       JOIN onet_knowledge k ON k.element_id = ok.element_id
       WHERE ok.onet_soc_code IN (${placeholders}) AND ok.importance > 3.5
       GROUP BY k.element_id
       ORDER BY avg_importance DESC`,
      topSocCodes
    ),
  ]);

  // Merge + cap at 15 items, sorted by avg_importance desc
  const merged = [...skills, ...knowledge]
    .sort((a, b) => b.avg_importance - a.avg_importance)
    .slice(0, 15)
    .map(r => ({
      element_id:        r.element_id,
      element_name:      r.element_name,
      element_name_id:   null,            // BI translation not in schema yet
      kind:              r.kind,
      category:          r.category,
      avg_importance:    r.avg_importance,
      avg_target_level:  r.avg_target_level,
      appears_in_careers: r.appears_in_careers ? r.appears_in_careers.split(",") : [],
    }));

  // If <8 results (shouldn't happen with importance>3.5 on top-5 careers
  // but just in case), degrade gracefully.
  return ok({
    based_on_careers: topSocCodes,
    scale_labels: SCALE_LABELS,
    items: merged,
    count: merged.length,
  });
}
