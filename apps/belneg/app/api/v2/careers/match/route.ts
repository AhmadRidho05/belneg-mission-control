import { NextRequest } from "next/server";
import { qAll, qGet, requireSiswa, ok, bad } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "5", 10) || 5, 20);

  const a = await qGet<any>(
    `SELECT id, riasec_realistic AS r, riasec_investigative AS i,
            riasec_artistic AS a, riasec_social AS s,
            riasec_enterprising AS e, riasec_conventional AS c
     FROM siswa_assessments
     WHERE user_id = ?
     ORDER BY submitted_at DESC LIMIT 1`,
    [auth.user.sub]
  );
  if (!a) return bad("belum ada asesmen — submit dulu di /api/v2/assessment/submit", 404);

  // Cosine similarity in SQL — user_vec (0..100 per dim) vs occ_vec (1..7 per dim).
  // Cosine is scale-invariant so the differing scales don't matter.
  const rows = await qAll<any>(
    `WITH occ AS (
       SELECT o.onet_soc_code, o.title, o.description,
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
     ),
     scored AS (
       SELECT onet_soc_code, title, description, r, i, a, s, e, c,
         ROUND(
           (? * r + ? * i + ? * a + ? * s + ? * e + ? * c) /
           (SQRT(? * ? + ? * ? + ? * ? + ? * ? + ? * ? + ? * ?) *
            SQRT(r * r + i * i + a * a + s * s + e * e + c * c)),
           4
         ) AS match_score
       FROM occ
     )
     SELECT s.*,
       (SELECT COUNT(*) FROM onet_occupation_skills    os WHERE os.onet_soc_code = s.onet_soc_code AND os.importance > 3.5) AS n_skills_required,
       (SELECT COUNT(*) FROM onet_occupation_knowledge ok WHERE ok.onet_soc_code = s.onet_soc_code AND ok.importance > 3.5) AS n_knowledge_required
     FROM scored s
     ORDER BY match_score DESC
     LIMIT ?`,
    [
      a.r, a.i, a.a, a.s, a.e, a.c,
      a.r, a.r, a.i, a.i, a.a, a.a, a.s, a.s, a.e, a.e, a.c, a.c,
      limit,
    ]
  );

  return ok({
    based_on_assessment_id: a.id,
    user_scores: { R: a.r, I: a.i, A: a.a, S: a.s, E: a.e, C: a.c },
    rows: rows.map(r => ({
      onet_soc_code: r.onet_soc_code,
      title: r.title,
      title_id: null,                                 // BI translations not in schema yet
      description: r.description,
      match_score: r.match_score,
      riasec_profile: { R: r.r, I: r.i, A: r.a, S: r.s, E: r.e, C: r.c },
      n_skills_required: r.n_skills_required,
      n_knowledge_required: r.n_knowledge_required,
      median_salary_idr: null,                        // future enrichment
    })),
  });
}
