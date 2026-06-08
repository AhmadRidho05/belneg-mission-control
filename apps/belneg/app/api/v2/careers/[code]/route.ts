import { NextRequest } from "next/server";
import { qAll, qGet, requireSiswa, ok, bad } from "../../_lib";

export const dynamic = "force-dynamic";

const ONET_CODE_RE = /^\d{2}-\d{4}\.\d{2}$/;

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;

  const { code } = await ctx.params;
  if (!ONET_CODE_RE.test(code)) return bad("onet_soc_code format invalid (expected NN-NNNN.NN)");

  const occ = await qGet<any>(
    `SELECT o.onet_soc_code, o.title, o.description,
       MAX(CASE WHEN oi.riasec_dim = 'Realistic'     THEN oi.score END) AS r,
       MAX(CASE WHEN oi.riasec_dim = 'Investigative' THEN oi.score END) AS i,
       MAX(CASE WHEN oi.riasec_dim = 'Artistic'      THEN oi.score END) AS a,
       MAX(CASE WHEN oi.riasec_dim = 'Social'        THEN oi.score END) AS s,
       MAX(CASE WHEN oi.riasec_dim = 'Enterprising'  THEN oi.score END) AS e,
       MAX(CASE WHEN oi.riasec_dim = 'Conventional'  THEN oi.score END) AS c
     FROM onet_occupations o
     LEFT JOIN onet_interests oi ON oi.onet_soc_code = o.onet_soc_code
     WHERE o.onet_soc_code = ?
     GROUP BY o.onet_soc_code`,
    [code]
  );
  if (!occ) return bad("karier tidak ditemukan", 404);

  const [topSkills, topKnowledge, related] = await Promise.all([
    qAll<any>(
      `SELECT s.element_id, s.element_name, s.category,
              ROUND(os.importance, 2) AS importance,
              ROUND(os.level, 2)      AS level
       FROM onet_occupation_skills os
       JOIN onet_skills s ON s.element_id = os.element_id
       WHERE os.onet_soc_code = ? AND os.importance > 3.5
       ORDER BY os.importance DESC LIMIT 10`,
      [code]
    ),
    qAll<any>(
      `SELECT k.element_id, k.element_name, k.category,
              ROUND(ok.importance, 2) AS importance,
              ROUND(ok.level, 2)      AS level
       FROM onet_occupation_knowledge ok
       JOIN onet_knowledge k ON k.element_id = ok.element_id
       WHERE ok.onet_soc_code = ? AND ok.importance > 3.5
       ORDER BY ok.importance DESC LIMIT 10`,
      [code]
    ),
    // Related = top-3 cosine-similar OTHER occupations using THIS occupation's
    // RIASEC vector. Skip if this occupation has no interest data.
    (occ.r != null && occ.i != null && occ.a != null && occ.s != null && occ.e != null && occ.c != null)
      ? qAll<any>(
          `WITH occ AS (
             SELECT o.onet_soc_code, o.title,
               MAX(CASE WHEN oi.riasec_dim = 'Realistic'     THEN oi.score END) AS r,
               MAX(CASE WHEN oi.riasec_dim = 'Investigative' THEN oi.score END) AS i,
               MAX(CASE WHEN oi.riasec_dim = 'Artistic'      THEN oi.score END) AS a,
               MAX(CASE WHEN oi.riasec_dim = 'Social'        THEN oi.score END) AS s,
               MAX(CASE WHEN oi.riasec_dim = 'Enterprising'  THEN oi.score END) AS e,
               MAX(CASE WHEN oi.riasec_dim = 'Conventional'  THEN oi.score END) AS c
             FROM onet_occupations o
             JOIN onet_interests oi ON oi.onet_soc_code = o.onet_soc_code
             WHERE o.onet_soc_code != ?
             GROUP BY o.onet_soc_code
             HAVING r IS NOT NULL AND i IS NOT NULL AND a IS NOT NULL
                AND s IS NOT NULL AND e IS NOT NULL AND c IS NOT NULL
           )
           SELECT onet_soc_code, title,
             ROUND(
               (? * r + ? * i + ? * a + ? * s + ? * e + ? * c) /
               (SQRT(? * ? + ? * ? + ? * ? + ? * ? + ? * ? + ? * ?) *
                SQRT(r * r + i * i + a * a + s * s + e * e + c * c)),
               4
             ) AS match_score
           FROM occ
           ORDER BY match_score DESC LIMIT 3`,
          [
            code,
            occ.r, occ.i, occ.a, occ.s, occ.e, occ.c,
            occ.r, occ.r, occ.i, occ.i, occ.a, occ.a,
            occ.s, occ.s, occ.e, occ.e, occ.c, occ.c,
          ]
        )
      : Promise.resolve([]),
  ]);

  return ok({
    onet_soc_code: occ.onet_soc_code,
    title: occ.title,
    title_id: null,
    description: occ.description,
    riasec_profile: { R: occ.r, I: occ.i, A: occ.a, S: occ.s, E: occ.e, C: occ.c },
    top_skills: topSkills,
    top_knowledge: topKnowledge,
    related_careers: related,
  });
}
